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
IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
PLAYWRIGHT_VERSION="1.62.1"
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
SETTLE_MS="1500"
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
# non-interactive shell cannot reach. The image is public, so pull anonymously.
# The empty config also drops the active context (Colima's or OrbStack's, say),
# so pin its endpoint first or docker falls back to /var/run/docker.sock.
if [[ -z "${DOCKER_HOST:-}" ]]; then
  DOCKER_HOST="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
  # Only local socket endpoints: a remote (tcp/ssh) context carries TLS material
  # in its own config, which the empty config below would drop.
  case "$DOCKER_HOST" in unix://* | npipe://*) export DOCKER_HOST ;; *) unset DOCKER_HOST ;; esac
fi
DOCKER_CONFIG_DIR="$(mktemp -d)"
trap 'rm -rf "$DOCKER_CONFIG_DIR"' EXIT
printf '{}' > "$DOCKER_CONFIG_DIR/config.json"
export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"

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
  -e "HOST_UID=$(id -u)" \
  -e "HOST_GID=$(id -g)" \
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
    # The container runs as root. Hand what it wrote back to the host user, so
    # the next run can replace it on a Linux host (Docker Desktop remaps this).
    chown -R "$HOST_UID:$HOST_GID" /baselines /artifacts 2>/dev/null || true
    exit $status
  '

if [[ "$MODE" == "update" ]]; then
  echo "story-shots: baselines written to $BASELINES; commit them"
else
  echo "story-shots: every shot matches its baseline"
fi
