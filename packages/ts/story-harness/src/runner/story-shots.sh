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
# runs it under emulation. That makes the comparison exact: no pixel may differ
# by more than a colour distance of 0.02, and the same command gives the same
# answer on a laptop and in CI. The static Storybook is served inside the
# container, so no host port is used.
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

usage() {
  echo "usage: story-shots <package dir> [--update] [--include p1,p2] [--exclude p3] [--settle-ms N]" >&2
  exit 2
}
fail() {
  echo "story-shots: $*" >&2
  exit 2
}
[[ $# -ge 1 ]] || usage
PKG="$(cd "$1" && pwd -P)"
shift

MODE="check"
INCLUDE=""
EXCLUDE=""
# Empty: the runner's own default (DEFAULT_SETTLE_MS in story.ts) applies.
SETTLE_MS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --update) MODE="update" ;;
    --include | --exclude | --settle-ms)
      [[ $# -ge 2 ]] || fail "$1 needs a value"
      case "$1" in
        --include) INCLUDE="$2" ;;
        --exclude) EXCLUDE="$2" ;;
        --settle-ms) SETTLE_MS="$2" ;;
      esac
      shift ;;
    *) fail "unknown argument $1" ;;
  esac
  shift
done
# The same items the shooting side's splitList gives: story ids hold no
# spaces, so drop them, then drop empty items. The prune below then only
# splits on commas.
normalize() {
  local list="${1//[[:space:]]/}"
  while [[ "$list" == *,,* ]]; do list="${list//,,/,}"; done
  list="${list#,}"
  echo "${list%,}"
}
INCLUDE="$(normalize "$INCLUDE")"
EXCLUDE="$(normalize "$EXCLUDE")"

is_count() { [[ "$1" =~ ^[0-9]+$ ]]; }
if [[ -n "$SETTLE_MS" ]] && ! is_count "$SETTLE_MS"; then
  fail "--settle-ms takes a whole number of milliseconds, got $SETTLE_MS"
fi
if [[ -n "${SHOT_WORKERS:-}" ]] && { ! is_count "$SHOT_WORKERS" || [[ "$SHOT_WORKERS" -lt 1 ]]; }; then
  fail "SHOT_WORKERS takes a whole number of at least 1, got $SHOT_WORKERS"
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

# Pull the image anonymously the first time. Docker Desktop's credential helper
# wants the login keychain, which a non-interactive shell cannot reach, and the
# image is public. A config with no credential settings avoids the helper, but
# also drops the active context (Colima's or OrbStack's, say), so the pull pins
# a local socket endpoint. A remote (tcp/ssh) context keeps its TLS material in
# the user's config, so it pulls with that config. Only the pull is touched:
# `docker run` below finds the image locally and uses the user's own config.
pull_image() {
  local host="${DOCKER_HOST:-}" config
  [[ -n "$host" ]] || host="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
  case "$host" in
    unix://* | npipe://*) ;;
    *) docker pull --quiet --platform "$PLATFORM" "$IMAGE" >/dev/null; return ;;
  esac
  config="$(mktemp -d)"
  printf '{}' > "$config/config.json"
  local status=0
  DOCKER_HOST="$host" DOCKER_CONFIG="$config" docker pull --quiet --platform "$PLATFORM" "$IMAGE" >/dev/null || status=$?
  rm -rf "$config"
  return $status
}
docker image inspect "$IMAGE" >/dev/null 2>&1 || pull_image

mkdir -p "$BASELINES"
rm -rf "$RESULTS"
mkdir -p "$RESULTS"

echo "story-shots: $MODE run of $PKG in $IMAGE ($PLATFORM)"
# The runner and the Storybook are mounted read-only and copied into the
# container, which installs its own @playwright/test: the host's node_modules
# may hold another platform's binaries. The npm cache is a named volume, so only
# the first run downloads it. Only the baselines and results directories are
# writable.
docker run --rm --platform "$PLATFORM" --ipc=host \
  -v "$RUNNER:/runner:ro" \
  -v "$STATIC:/storybook:ro" \
  -v "$BASELINES:/baselines" \
  -v "$RESULTS:/artifacts" \
  -v "story-shots-npm-cache:/root/.npm" \
  -e "MODE=$MODE" \
  -e "STORY_INCLUDE=$INCLUDE" \
  -e "STORY_EXCLUDE=$EXCLUDE" \
  -e "SETTLE_MS=$SETTLE_MS" \
  ${SHOT_WORKERS:+-e "SHOT_WORKERS=$SHOT_WORKERS"} \
  -e "PLAYWRIGHT_VERSION=$PLAYWRIGHT_VERSION" \
  -e CI=1 \
  "$IMAGE" \
  bash -c '
    set -euo pipefail
    mkdir -p /work/baselines
    cp /runner/* /work/
    cd /work
    npm init -y >/dev/null 2>&1
    npm pkg set type=module >/dev/null 2>&1
    npm install --silent --no-audit --no-fund --prefer-offline "@playwright/test@$PLAYWRIGHT_VERSION"
    if [[ "$MODE" == "check" ]]; then
      cp -r /baselines/. /work/baselines/
      UPDATE="--update-snapshots=none"
    else
      UPDATE="--update-snapshots=all"
    fi
    set +e
    STORYBOOK_DIR=/storybook BASELINE_DIR=/work/baselines ARTIFACTS_DIR=/work/test-results \
      npx playwright test -c playwright.config.js $UPDATE
    status=$?
    set -e
    if [[ "$MODE" == "update" ]]; then
      # A passing run replaces the baselines its filter covers, which prunes
      # deleted stories; baselines outside the filter are left alone. A failed
      # run keeps what it did write and deletes nothing.
      if [[ $status -eq 0 ]]; then
        IFS=, read -ra includes <<< "$STORY_INCLUDE"
        IFS=, read -ra excludes <<< "$STORY_EXCLUDE"
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
