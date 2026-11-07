#!/usr/bin/env bash
# Story screenshot baselines: shoot every enrolled story of a built Storybook in
# light and dark, and compare each shot with its committed baseline.
#
#   story-shots <package dir> [--update] [--include p1,p2] [--exclude p3] [--settle-ms N]
#
# The package's `story-shots` command runs this script.
#
# <package dir> holds `storybook-static/` (build it first) and the baselines in
# `.storybook/baselines/`. `--include` / `--exclude` are story id prefixes.
# `--update` rewrites the baselines instead of comparing, and prunes baselines
# of stories that no longer exist (only those the filter covers). Commit what
# it writes.
#
# The baselines are Linux PNGs, because CI is Linux and font rasterisation
# differs across platforms. So the browser always runs in the pinned Playwright
# image, as linux/amd64 to match the CI runner exactly; on Apple silicon Docker
# runs it under emulation. That makes the comparison exact (zero pixel
# tolerance) and the same command gives the same answer on a laptop and in CI.
# The static Storybook is served inside the container, so no host port is used.
#
# SHOT_WORKERS=N sets the Playwright worker count in the container (default 6).
# STORY_SHOTS_PLATFORM sets the container platform (default linux/amd64).
#
# On a failure the expected/actual/diff images are in
# `<package dir>/test-results/story-shots/`.
set -euo pipefail

RUNNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# The image and the @playwright/test installed in it must be the same version.
PLAYWRIGHT_VERSION="1.62.1"
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"
PLATFORM="${STORY_SHOTS_PLATFORM:-linux/amd64}"
# This folder holds TypeScript in the package source and JavaScript once built.
CONFIG="playwright.config.js"
if [[ -f "$RUNNER/playwright.config.ts" ]]; then CONFIG="playwright.config.ts"; fi

if [[ $# -lt 1 ]]; then
  echo "usage: story-shots <package dir> [--update] [--include p1,p2] [--exclude p3] [--settle-ms N]" >&2
  exit 2
fi
PKG="$(cd "$1" && pwd -P)"
shift

MODE="check"
INCLUDE=""
EXCLUDE=""
# Empty: the runner's own default (DEFAULT_SETTLE_MS in story.ts) applies.
SETTLE_MS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --include | --exclude | --settle-ms)
      if [[ $# -lt 2 ]]; then echo "story-shots: $1 needs a value" >&2; exit 2; fi ;;
  esac
  case "$1" in
    --update) MODE="update" ;;
    --include) INCLUDE="$2"; shift ;;
    --exclude) EXCLUDE="$2"; shift ;;
    --settle-ms) SETTLE_MS="$2"; shift ;;
    *) echo "story-shots: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

is_count() { [[ "$1" =~ ^[0-9]+$ ]]; }
if [[ -n "$SETTLE_MS" ]] && ! is_count "$SETTLE_MS"; then
  echo "story-shots: --settle-ms takes a whole number of milliseconds, got $SETTLE_MS" >&2
  exit 2
fi
if [[ -n "${SHOT_WORKERS:-}" ]] && { ! is_count "$SHOT_WORKERS" || [[ "$SHOT_WORKERS" -lt 1 ]]; }; then
  echo "story-shots: SHOT_WORKERS takes a whole number of at least 1, got $SHOT_WORKERS" >&2
  exit 2
fi

STATIC="$PKG/storybook-static"
BASELINES="$PKG/.storybook/baselines"
RESULTS="$PKG/test-results/story-shots"

if [[ ! -f "$STATIC/index.json" ]]; then
  echo "story-shots: $STATIC/index.json not found; build the Storybook first" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "story-shots: Docker is not running; the baselines are made and checked in a Linux container" >&2
  exit 1
fi

# Docker Desktop's credential helper wants the login keychain, which a
# non-interactive shell cannot reach. The image is public, so pull anonymously
# through a config with no credential settings. It keeps the user's `proxies`,
# so the container's npm install still goes through a corporate proxy.
#
# That config also drops the active context (Colima's or OrbStack's, say), so
# pin a local socket endpoint first or docker falls back to
# /var/run/docker.sock. A remote (tcp/ssh) context keeps its TLS material in
# the user's config, so with one active the user's config is left as it is.
USER_DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}/config.json"
REMOTE_CONTEXT=0
if [[ -z "${DOCKER_HOST:-}" ]]; then
  DOCKER_HOST="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
  case "$DOCKER_HOST" in
    unix://* | npipe://*) export DOCKER_HOST ;;
    "") unset DOCKER_HOST ;;
    *) unset DOCKER_HOST; REMOTE_CONTEXT=1 ;;
  esac
fi
DOCKER_CONFIG_DIR=""
trap '[[ -z "$DOCKER_CONFIG_DIR" ]] || rm -rf "$DOCKER_CONFIG_DIR"' EXIT
if [[ $REMOTE_CONTEXT -eq 0 ]]; then
  DOCKER_CONFIG_DIR="$(mktemp -d)"
  node -e '
    const fs = require("node:fs")
    let config = {}
    try { config = JSON.parse(fs.readFileSync(process.argv[1], "utf8")) } catch {}
    fs.writeFileSync(process.argv[2], JSON.stringify(config.proxies ? { proxies: config.proxies } : {}))
  ' "$USER_DOCKER_CONFIG" "$DOCKER_CONFIG_DIR/config.json" 2>/dev/null ||
    printf '{}' > "$DOCKER_CONFIG_DIR/config.json"
  export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"
fi

mkdir -p "$BASELINES"
rm -rf "$RESULTS"
mkdir -p "$RESULTS"

echo "story-shots: $MODE run of $PKG in $IMAGE ($PLATFORM)"
# The runner and the Storybook are mounted read-only and copied into the
# container, which installs its own @playwright/test: the host's node_modules
# may hold another platform's binaries. Only the baselines and results directories are writable.
docker run --rm --platform "$PLATFORM" --ipc=host \
  -v "$RUNNER:/runner:ro" \
  -v "$STATIC:/storybook:ro" \
  -v "$BASELINES:/baselines" \
  -v "$RESULTS:/artifacts" \
  -e "MODE=$MODE" \
  -e "STORY_INCLUDE=$INCLUDE" \
  -e "STORY_EXCLUDE=$EXCLUDE" \
  -e "SETTLE_MS=$SETTLE_MS" \
  ${SHOT_WORKERS:+-e "SHOT_WORKERS=$SHOT_WORKERS"} \
  -e "PLAYWRIGHT_VERSION=$PLAYWRIGHT_VERSION" \
  -e "CONFIG=$CONFIG" \
  -e CI=1 \
  "$IMAGE" \
  bash -c '
    set -euo pipefail
    mkdir -p /work/baselines
    cp /runner/* /work/
    cd /work
    npm init -y >/dev/null 2>&1
    npm pkg set type=module >/dev/null 2>&1
    npm install --silent --no-audit --no-fund "@playwright/test@$PLAYWRIGHT_VERSION"
    if [[ "$MODE" == "check" ]]; then
      cp -r /baselines/. /work/baselines/
      UPDATE="--update-snapshots=none"
    else
      UPDATE="--update-snapshots=all"
    fi
    set +e
    STORYBOOK_DIR=/storybook BASELINE_DIR=/work/baselines ARTIFACTS_DIR=/work/test-results \
      npx playwright test -c "$CONFIG" $UPDATE
    status=$?
    set -e
    if [[ "$MODE" == "update" ]]; then
      # A passing run replaces the baselines its filter covers, which prunes
      # deleted stories; baselines outside the filter are left alone. A failed
      # run keeps what it did write and deletes nothing.
      if [[ $status -eq 0 ]]; then
        # Split, trim and drop empty items, as splitList in story.ts does, so
        # the prune covers exactly the stories the run shot.
        split() {
          local item
          IFS=, read -ra raw <<< "$1"
          for item in "${raw[@]}"; do
            item="${item#"${item%%[![:space:]]*}"}"
            item="${item%"${item##*[![:space:]]}"}"
            [[ -n "$item" ]] && printf "%s\n" "$item"
          done
          return 0
        }
        mapfile -t includes < <(split "$STORY_INCLUDE")
        mapfile -t excludes < <(split "$STORY_EXCLUDE")
        for file in /baselines/*.png; do
          [[ -e "$file" ]] || continue
          name="$(basename "$file")"
          covered=$(( ${#includes[@]} == 0 ))
          for p in "${includes[@]+"${includes[@]}"}"; do [[ "$name" == "$p"* ]] && covered=1; done
          for p in "${excludes[@]+"${excludes[@]}"}"; do [[ "$name" == "$p"* ]] && covered=0; done
          if [[ $covered -eq 1 ]]; then rm -f "$file"; fi
        done
      fi
      cp -r /work/baselines/. /baselines/
    fi
    cp -r /work/test-results/. /artifacts/ 2>/dev/null || true
    # The container runs as root. Give what it wrote to the owner of the
    # mounted baselines folder as the container sees it, so the next run can
    # replace it: that is the host user under rootful Docker, and root, which
    # maps to the host user, under a rootless engine. Docker Desktop remaps it
    # anyway.
    owner="$(stat -c "%u:%g" /baselines)"
    chown -R "$owner" /baselines /artifacts 2>/dev/null || true
    exit $status
  '

if [[ "$MODE" == "update" ]]; then
  echo "story-shots: baselines written to $BASELINES; commit them"
else
  echo "story-shots: every shot matches its baseline"
fi
