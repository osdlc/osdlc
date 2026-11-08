#!/usr/bin/env bash
# Asks Claude about pull request $PR and writes the CLI's JSON result to a
# file. Exits with the CLI's status, so a failed run fails the step.
set -euo pipefail

: "${PR:?PR is required}" "${REQUEST:?REQUEST is required}"
: "${MAX_TURNS:=30}" "${ALLOWED_TOOLS:=}" "${DISALLOWED_TOOLS:=}"

result_file="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/claude-pr-answer-$PR.json"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "result-file=$result_file" >> "$GITHUB_OUTPUT"
fi

prompt="You are answering a question on pull request #$PR in ${GITHUB_REPOSITORY:-this repository}.
The pull request branch is checked out in the current directory.
Use \`gh pr view $PR --comments\` and \`gh pr diff $PR\` for its description, discussion and diff.
Answer only what is asked, in GitHub-flavored markdown, as your final message.
You cannot edit files, commit or post; the workflow posts your final message.

The request${SOURCE_URL:+, from $SOURCE_URL}:

$REQUEST"

args=(-p "$prompt" --output-format json --max-turns "$MAX_TURNS")
[ -n "$ALLOWED_TOOLS" ] && args+=(--allowedTools "$ALLOWED_TOOLS")
[ -n "$DISALLOWED_TOOLS" ] && args+=(--disallowedTools "$DISALLOWED_TOOLS")
[ -n "${MODEL:-}" ] && args+=(--model "$MODEL")

set +e
claude "${args[@]}" < /dev/null > "$result_file"
status=$?
set -e

summary=$(jq -c '{is_error, subtype, num_turns, total_cost_usd, api_error_status}' "$result_file" 2> /dev/null) \
  || summary="unparsable result: $(head -c 2000 "$result_file")"
echo "$summary"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  is_error=$(jq -r 'if .is_error == false then "false" else "true" end' "$result_file" 2> /dev/null || echo true)
  cost=$(jq -r '.total_cost_usd // 0' "$result_file" 2> /dev/null || echo 0)
  {
    echo "is-error=$is_error"
    echo "cost-usd=$cost"
  } >> "$GITHUB_OUTPUT"
fi

exit "$status"
