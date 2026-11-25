#!/usr/bin/env bash
# End to end check of the `story-shots` command, in Docker: write baselines for
# a fixture build, then check against them, then make a story differ and
# expect the check to fail. Needs Docker and the built dist/.
#
#   pnpm run test:shots
#
# The work folder comes from mktemp, so it is under TMPDIR. A Docker engine in a
# VM mounts only some folders (Colima: your home folder and /tmp/colima, not
# macOS's /var/folders), so set TMPDIR to one it mounts, or the run times out.
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

# Everything the container wrote belongs to the host user, so a later run and
# git can replace it.
if [[ -n "$(find "$WORK/.storybook/baselines" "$WORK/test-results" ! -user "$(id -u)" -print -quit)" ]]; then
  echo "the container left files the host user does not own" >&2
  exit 1
fi

# A second --update rewrites nothing that still matches, and deletes the
# baseline of a story that is gone.
sum_before="$(cat "$WORK/.storybook/baselines/demo-card--plain--light.png" | cksum)"
cp "$WORK/.storybook/baselines/demo-card--plain--light.png" "$WORK/.storybook/baselines/demo-card--gone--light.png"
node "$BIN" "$WORK" --update
[[ "$(cat "$WORK/.storybook/baselines/demo-card--plain--light.png" | cksum)" == "$sum_before" ]] ||
  { echo "--update rewrote a baseline that still matched" >&2; exit 1; }
[[ ! -e "$WORK/.storybook/baselines/demo-card--gone--light.png" ]] ||
  { echo "--update kept the baseline of a story that is gone" >&2; exit 1; }

# The prune covers only what the filter covers, with items trimmed as the
# shooting side trims them: --update with an excluded story keeps its baselines.
node "$BIN" "$WORK" --update --exclude "demo-card--perf, demo-card--wide"
for shot in demo-card--wide--light demo-card--wide--dark; do
  [[ -f "$WORK/.storybook/baselines/$shot.png" ]] || { echo "the prune deleted excluded $shot" >&2; exit 1; }
done

# A story that crashes fails --update and gets no baseline.
CRASH="$WORK/crash"
mkdir -p "$CRASH/storybook-static"
cp "$HERE/fixtures/storybook-static/iframe.html" "$CRASH/storybook-static/"
printf '{"v":5,"entries":{"demo-card--crash":{"type":"story"}}}' > "$CRASH/storybook-static/index.json"
if node "$BIN" "$CRASH" --update; then
  echo "--update passed on a crashing story" >&2
  exit 1
fi
if ls "$CRASH/.storybook/baselines" | grep -q crash; then
  echo "--update wrote a baseline for a crashing story" >&2
  exit 1
fi

# A changed story fails the check.
sed -i.bak 's/#cde/#cdf/' "$WORK/storybook-static/iframe.html"
if node "$BIN" "$WORK" --include demo-card--plain; then
  echo "the check passed on a changed story" >&2
  exit 1
fi
# The accessibility check and the keyboard walk run on a build whose card has
# a button with no accessible name and one with a name.
A11Y="$WORK/a11y"
mkdir -p "$A11Y/storybook-static"
sed 's|<div id="card"|<button id="bare"></button><button id="named">Named</button><div id="card"|' \
  "$HERE/fixtures/storybook-static/iframe.html" > "$A11Y/storybook-static/iframe.html"
printf '{"v":5,"entries":{"demo-card--plain":{"type":"story"}}}' > "$A11Y/storybook-static/index.json"

if node "$BIN" "$A11Y" --a11y; then
  echo "--a11y passed on a button with no name" >&2
  exit 1
fi
grep -q '"button-name"' "$A11Y/test-results/story-a11y/a11y-report.json" ||
  { echo "the a11y report does not name the button-name rule" >&2; exit 1; }
[[ ! -e "$A11Y/.storybook/baselines" ]] ||
  { echo "--a11y made a baselines folder" >&2; exit 1; }

# A story that sets parameters.a11y.test to todo is reported, not failed.
sed -i.bak "s|{ parameters: { screenshot } }|{ parameters: { screenshot, a11y: { test: 'todo' } } }|" \
  "$A11Y/storybook-static/iframe.html"
node "$BIN" "$A11Y" --a11y
grep -q '"button-name"' "$A11Y/test-results/story-a11y/a11y-report.json" ||
  { echo "a todo story's violations are missing from the a11y report" >&2; exit 1; }

# The walk is a survey: it passes, and records both buttons as stops.
WALK_MAX=5 node "$BIN" "$A11Y" --walk
node -e '
  const report = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))
  const stops = report[0]?.stops ?? []
  if (report.length !== 1 || stops.length !== 2) {
    console.error("the walk report holds " + report.length + " stories and " + stops.length + " stops, not 1 and 2")
    process.exit(1)
  }
' "$A11Y/test-results/story-walk/walk-report.json"
[[ -f "$A11Y/test-results/story-walk/walk/demo-card--plain/01.png" ]] ||
  { echo "the walk wrote no screenshot of its first stop" >&2; exit 1; }

# One mode at a time.
if node "$BIN" "$A11Y" --a11y --walk 2>/dev/null; then
  echo "--a11y and --walk were accepted together" >&2
  exit 1
fi
echo "story-shots e2e: OK"
