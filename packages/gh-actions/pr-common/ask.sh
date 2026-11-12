#!/usr/bin/env bash
# Builds the prompt (review mode or answer mode) and runs the harness once per
# key in $KEYS until one authenticates. $MODE (review | answer) comes from
# mention.sh. $HARNESS_SH is the harness's own script, which defines
#   harness_run                run the CLI once with $KEY and $PROMPT in the
#                              environment (also $RESULT, $MAX_TURNS, $MODEL); write
#                              the JSON result to $RESULT; return the CLI's exit status
#   harness_auth_failed        succeed when $RESULT shows an authentication failure
#                              (default: .auth_failed == true in the result JSON)
#   harness_key_exhausted      succeed when $RESULT shows the key's account is out of
#                              credit, quota or usage (default: .key_exhausted == true)
#   harness_review_intro BASE  the words after "by running" in the review prompt
# and may set HARNESS_OFFLINE=1 (the agent cannot reach gh, so the pull request
# text and diff are written to files) and define harness_prompt_suffix (text
# appended to the review prompt).
# The result JSON has is_error (false on success) and result (the final message).
set -e  # no pipefail: `grep -q` may close a pipe early, as in the workflow it came from
: "${AGENT:?AGENT is required}" "${HARNESS_SH:?HARNESS_SH is required}" "${KEY_VAR:?KEY_VAR is required}"
# shellcheck source=/dev/null
. "$HARNESS_SH"
# Default for harnesses whose result JSON carries auth_failed.
if [ "$(type -t harness_auth_failed)" != function ]; then
  harness_auth_failed() { jq -e '.auth_failed == true' "$RESULT" > /dev/null 2>&1; }
fi
if [ "$(type -t harness_key_exhausted)" != function ]; then
  harness_key_exhausted() { jq -e '.key_exhausted == true' "$RESULT" > /dev/null 2>&1; }
fi
rm -f "$RESULT"
ctx="${RUNNER_TEMP:-/tmp}/$AGENT-pr-context"
if [ "$MODE" = review ] || [ "${HARNESS_OFFLINE:-}" = 1 ]; then
  base=$(gh pr view "$PR" --json baseRefName --jq .baseRefName)
fi
if [ "${HARNESS_OFFLINE:-}" = 1 ]; then
  mkdir -p "$ctx"
  gh pr view "$PR" --comments > "$ctx/pr.md"
  gh pr diff "$PR" > "$ctx/pr.diff"
  git diff "origin/$base...HEAD" > "$ctx/review.diff"
fi
# `@AGENT review [focus]` at the start of the comment runs the review skill.
if [ "$MODE" = review ]; then
  focus=$(printf '%s\n' "$REQUEST" | sed -E "1s/^[[:space:]]*@$AGENT[[:space:]]+review[[:space:]]*//")
  offline=""
  if [ "${HARNESS_OFFLINE:-}" = 1 ]; then
    offline="You cannot reach the network or run gh. The change is in $ctx/review.diff, the pull request text in $ctx/pr.md.
"
  fi
  prompt="Review pull request #$PR in $REPO by running $(harness_review_intro "$base").
The pull request branch is checked out in the current directory, and origin/$base is fetched.
Review only what this branch changes against origin/$base (\`git diff origin/$base...HEAD\`); read the changed files in full where needed.
${offline}Your final message is posted to the pull request as a comment: GitHub-flavored markdown, findings in order of severity,
each with its file:line, the concrete failure and the fix. Say so plainly if there are no findings.
You cannot edit files, commit or post; the workflow posts your final message.
${focus:+Focus requested by the reviewer: $focus}"
  if [ "$(type -t harness_prompt_suffix)" = function ]; then
    prompt="$prompt

$(harness_prompt_suffix)"
  fi
else
  if [ "${HARNESS_OFFLINE:-}" = 1 ]; then
    context="The pull request description and discussion are in $ctx/pr.md and its diff in $ctx/pr.diff; you cannot reach the network or run gh."
  else
    context="Use \`gh pr view $PR --comments\` and \`gh pr diff $PR\` for its description, discussion and diff."
  fi
  prompt="You are answering a question on pull request #$PR in $REPO.
The pull request branch is checked out in the current directory.
$context
Answer only what is asked, in GitHub-flavored markdown, as your final message.
You cannot edit files, commit or post; the workflow posts your final message.

The request, from $SOURCE_URL:

$REQUEST"
fi
status=1
tried=0
auth_failed=0
exhausted=0
fell=0  # the last key tried was passed over
keys=()
while IFS= read -r k; do
  if [ -n "$k" ]; then keys+=("$k"); fi
done < <(printf '%s\n' "$KEYS" | tr ',' '\n' | tr -s '[:space:]' '\n')
for key in "${keys[@]}"; do echo "::add-mask::$key"; done
for key in "${keys[@]}"; do
  tried=$((tried + 1))
  n=$tried
  set +e
  KEY="$key" PROMPT="$prompt" harness_run
  status=$?
  set -e
  echo "key $n: exit $status"
  jq '{is_error, subtype, num_turns, total_cost_usd, api_error_status, result}' "$RESULT" || cat "$RESULT"
  if [ "$status" -eq 0 ] && jq -e '.is_error == false' "$RESULT" > /dev/null 2>&1; then
    break
  fi
  # Only an authentication failure or an exhausted key moves on to the next key.
  fell=0
  if harness_auth_failed; then
    auth_failed=$((auth_failed + 1))
    fell=1
    echo "::warning::key $n in $KEY_VAR failed authentication; remove it from the secret"
    continue
  fi
  if harness_key_exhausted; then
    exhausted=$((exhausted + 1))
    fell=1
    if [ "$n" -lt "${#keys[@]}" ]; then
      echo "::warning::key $n in $KEY_VAR is out of credit or quota; trying key $((n + 1))"
    else
      echo "::warning::key $n in $KEY_VAR is out of credit or quota; no keys left"
    fi
    continue
  fi
  break
done
# Every key was passed over: say why in the posted failure.
if [ "$fell" -eq 1 ]; then
  if [ "$exhausted" -eq 0 ]; then why="All $tried keys in $KEY_VAR failed authentication."
  elif [ "$auth_failed" -eq 0 ]; then why="All $tried keys in $KEY_VAR are out of credit or quota."
  else why="No key in $KEY_VAR worked: $auth_failed failed authentication, $exhausted are out of credit or quota."
  fi
  jq --arg w "$why" '.result = $w + "\n\n" + (.result // "")' "$RESULT" > "$RESULT.tmp" 2> /dev/null && mv "$RESULT.tmp" "$RESULT"
fi
if [ "$tried" -eq 0 ]; then
  jq -n --arg m "No $KEY_VAR secret is set" '{is_error: true, result: $m}' | tee "$RESULT"
fi
exit "$status"
