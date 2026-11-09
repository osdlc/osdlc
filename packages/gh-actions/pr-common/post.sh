#!/usr/bin/env bash
# Posts $RESULT (the JSON result) as a pull request comment, with a done or failed marker.
set -e  # no pipefail: `grep -q` may close a pipe early, as in the workflow it came from
: "${AGENT:?AGENT is required}"
label="$(printf '%s' "${AGENT:0:1}" | tr '[:lower:]' '[:upper:]')${AGENT:1}"
# Every comment ends with a marker, so a reader (or a script) can
# tell the run is finished: `<!-- AGENT-review: done head=<sha> -->`,
# or `failed`; answers use `AGENT-answer`. A review also opens with
# a visible "<Agent> review done" line naming the commit it covered.
head=$(git rev-parse HEAD 2>/dev/null || echo unknown)  # checkout may have failed
kind=$AGENT-${MODE:-answer}
out="$RUNNER_TEMP/$AGENT-pr-answer.md"
if [ -s "$RESULT" ] && jq -e '.is_error == false' "$RESULT" > /dev/null 2>&1; then
  outcome=done
  {
    if [ "$MODE" = review ]; then
      echo "**$label review done** for ${head:0:7}. The findings are below; respond to them now."
      echo
    fi
    jq -r '.result' "$RESULT"
  } > "$out"
else
  outcome=failed
  {
    if [ "$MODE" = review ]; then
      echo "**$label review failed** for ${head:0:7}."
    else
      echo "$label could not answer. [Run log]($RUN_URL)"
    fi
    echo
    echo '```'
    jq -r '.result // "no result"' "$RESULT" 2>/dev/null || echo "no result"
    echo '```'
  } > "$out"
fi
{
  echo
  echo "<sub>[Run log]($RUN_URL)</sub>"
  echo
  echo "<!-- $kind: $outcome head=$head -->"
} >> "$out"
gh pr comment "$PR" --repo "$REPO" --body-file "$out"
