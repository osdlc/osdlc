#!/usr/bin/env bash
# Posts result.json as a pull request comment, with a done or failed marker.
set -e  # no pipefail: `grep -q` may close a pipe early, as in the workflow it came from
# Every comment ends with a marker, so a reader (or a script) can
# tell the run is finished: `<!-- claude-review: done head=<sha> -->`,
# or `failed`; answers use `claude-answer`. A review also opens with
# a visible "Claude review done" line naming the commit it covered.
head=$(git rev-parse HEAD 2>/dev/null || echo unknown)  # checkout may have failed
kind=claude-${MODE:-answer}
if [ -s result.json ] && jq -e '.is_error == false' result.json > /dev/null 2>&1; then
  outcome=done
  {
    if [ "$MODE" = review ]; then
      echo "**Claude review done** for ${head:0:7}. The findings are below; respond to them now."
      echo
    fi
    jq -r '.result' result.json
  } > answer.md
else
  outcome=failed
  {
    if [ "$MODE" = review ]; then
      echo "**Claude review failed** for ${head:0:7}."
    else
      echo "Claude could not answer. [Run log]($RUN_URL)"
    fi
    echo
    echo '```'
    jq -r '.result // "no result"' result.json 2>/dev/null || echo "no result"
    echo '```'
  } > answer.md
fi
{
  echo
  echo "<sub>[Run log]($RUN_URL)</sub>"
  echo
  echo "<!-- $kind: $outcome head=$head -->"
} >> answer.md
gh pr comment "$PR" --body-file answer.md
