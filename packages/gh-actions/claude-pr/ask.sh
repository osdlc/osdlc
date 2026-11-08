#!/usr/bin/env bash
# Builds the prompt (review mode or answer mode) and runs claude -p with each
# key in $KEYS until one authenticates. Writes result.json; prints mode= to
# $GITHUB_OUTPUT.
set -e  # no pipefail: `grep -q` may close a pipe early, as in the workflow it came from
# `@claude review [focus]` at the start of the comment runs the review skill.
if printf '%s\n' "$REQUEST" | head -n 1 | grep -qE '^[[:space:]]*@claude[[:space:]]+review([[:space:]]|$)'; then
  echo "mode=review" >> "$GITHUB_OUTPUT"
  focus=$(printf '%s\n' "$REQUEST" | sed -E '1s/^[[:space:]]*@claude[[:space:]]+review[[:space:]]*//')
  base=$(gh pr view "$PR" --json baseRefName --jq .baseRefName)
  prompt="Review pull request #$PR in $REPO by running the /craft:code-review skill with base origin/$base.
The pull request branch is checked out in the current directory, and origin/$base is fetched.
Review only what this branch changes against origin/$base (\`git diff origin/$base...HEAD\`); read the changed files in full where needed.
Your final message is posted to the pull request as a comment: GitHub-flavored markdown, findings in order of severity,
each with its file:line, the concrete failure and the fix. Say so plainly if there are no findings.
You cannot edit files, commit or post; the workflow posts your final message.
${focus:+Focus requested by the reviewer: $focus}"
else
  echo "mode=answer" >> "$GITHUB_OUTPUT"
  prompt="You are answering a question on pull request #$PR in $REPO.
The pull request branch is checked out in the current directory.
Use \`gh pr view $PR --comments\` and \`gh pr diff $PR\` for its description, discussion and diff.
Answer only what is asked, in GitHub-flavored markdown, as your final message.
You cannot edit files, commit or post; the workflow posts your final message.

The request, from $SOURCE_URL:

$REQUEST"
fi
status=1
tried=0
keys=()
while IFS= read -r k; do
  if [ -n "$k" ]; then keys+=("$k"); fi
done < <(printf '%s\n' "$KEYS" | tr ',' '\n' | tr -s '[:space:]' '\n')
for key in "${keys[@]}"; do echo "::add-mask::$key"; done
for key in "${keys[@]}"; do
  tried=$((tried + 1))
  n=$tried
  set +e
  ANTHROPIC_API_KEY="$key" claude -p "$prompt" \
    --output-format json \
    --max-turns "$MAX_TURNS" \
    --allowedTools "Read,Glob,Grep,Skill,Agent,Bash(gh pr view:*),Bash(gh pr diff:*),Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(node:*)" \
    --disallowedTools "Edit,MultiEdit,Write,NotebookEdit,Bash(git commit:*),Bash(git push:*),Bash(gh pr comment:*)" \
    < /dev/null > result.json
  status=$?
  set -e
  echo "key $n: exit $status"
  jq '{is_error, subtype, num_turns, total_cost_usd, api_error_status, result}' result.json || cat result.json
  if [ "$status" -eq 0 ] && jq -e '.is_error == false' result.json > /dev/null 2>&1; then
    break
  fi
  # Only an authentication failure moves on to the next key.
  # The text check looks only at a run that never got a turn, or at
  # output that is not JSON, so tool inputs Claude tried cannot match.
  auth='authentication_error|invalid x-api-key|invalid api key'
  if jq -e --arg re "$auth" '.api_error_status == 401
      or (.is_error == true and (.num_turns // 0) <= 1 and ((.result // "") | test($re; "i")))' \
      result.json > /dev/null 2>&1 \
    || { ! jq -e . result.json > /dev/null 2>&1 && grep -qiE "$auth" result.json; }; then
    echo "::warning::key $n in ANTHROPIC_API_KEY failed authentication; remove it from the secret"
    continue
  fi
  break
done
if [ "$tried" -eq 0 ]; then
  jq -n '{is_error: true, result: "No ANTHROPIC_API_KEY secret is set"}' | tee result.json
fi
exit "$status"
