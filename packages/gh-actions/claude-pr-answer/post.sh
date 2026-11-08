#!/usr/bin/env bash
# Posts Claude's answer from $RESULT_FILE on pull request $PR, or the error
# and a link to the run when there is no answer.
set -euo pipefail

: "${PR:?PR is required}" "${RESULT_FILE:?RESULT_FILE is required}"

body="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/claude-pr-answer-$PR.md"

if [ -s "$RESULT_FILE" ] && jq -e '.is_error == false' "$RESULT_FILE" > /dev/null 2>&1; then
  jq -r '.result' "$RESULT_FILE" > "$body"
else
  {
    echo "Claude could not answer.${RUN_URL:+ [Run log]($RUN_URL)}"
    echo
    echo '```'
    jq -r '.result // "no result"' "$RESULT_FILE" 2> /dev/null || echo "no result"
    echo '```'
  } > "$body"
fi

gh pr comment "$PR" --body-file "$body"
