# Sourced by pr-common/ask.sh. Runs claude -p once with $KEY.

harness_review_intro() {
  echo "the /craft:code-review skill with base origin/$1"
}

harness_run() {
  ANTHROPIC_API_KEY="$KEY" claude -p "$PROMPT" \
    --output-format json \
    --max-turns "$MAX_TURNS" \
    --allowedTools "Read,Glob,Grep,Skill,Agent,Bash(gh pr view:*),Bash(gh pr diff:*),Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(node:*)" \
    --disallowedTools "Edit,MultiEdit,Write,NotebookEdit,Bash(git commit:*),Bash(git push:*),Bash(gh pr comment:*)" \
    < /dev/null > "$RESULT"
}

# The text check looks only at a run that never got a turn, or at
# output that is not JSON, so tool inputs Claude tried cannot match.
harness_auth_failed() {
  local auth='authentication_error|invalid x-api-key|invalid api key'
  jq -e --arg re "$auth" '.api_error_status == 401
      or (.is_error == true and (.num_turns // 0) <= 1 and ((.result // "") | test($re; "i")))' \
      "$RESULT" > /dev/null 2>&1 \
    || { ! jq -e . "$RESULT" > /dev/null 2>&1 && grep -qiE "$auth" "$RESULT"; }
}
