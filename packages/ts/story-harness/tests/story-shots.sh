#!/usr/bin/env bash
# End to end check of the `story-shots` command, in Docker: write baselines for
# a fixture build, then check against them, then make a story differ and
# expect the check to fail. Needs Docker and the built dist/.
#
#   npm run test:shots
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BIN="$HERE/../bin/story-shots.js"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r "$HERE/fixtures/storybook-static" "$WORK/storybook-static"

node "$BIN" "$WORK" --update
ls "$WORK/.storybook/baselines"
for shot in demo-card--plain--light demo-card--plain--dark demo-card--wide--light demo-card--wide--dark; do
  [[ -f "$WORK/.storybook/baselines/$shot.png" ]] || { echo "missing baseline $shot" >&2; exit 1; }
done
if ls "$WORK/.storybook/baselines" | grep -q perf; then
  echo "a skipped story got a baseline" >&2
  exit 1
fi

node "$BIN" "$WORK"

# A changed story fails the check.
sed -i.bak 's/#cde/#cdf/' "$WORK/storybook-static/iframe.html"
if node "$BIN" "$WORK" --include demo-card--plain; then
  echo "the check passed on a changed story" >&2
  exit 1
fi
echo "story-shots e2e: OK"
