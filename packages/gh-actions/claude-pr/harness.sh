# Sourced by pr-common/ask.sh. Runs claude -p once with $KEY.

harness_review_intro() {
  echo "the /craft:code-review skill with base origin/$1"
}

# Skill mode runs /<plugin>:<skill> as the first line of the prompt (a slash
# command for claude -p). With --apply ($APPLY=1) Edit, Write and MultiEdit are
# allowed; commit, push and gh pr comment stay denied (the action commits).
# The how-called block of skill mode goes in --append-system-prompt: after a
# slash command, claude -p takes every following line as the command's arguments.
harness_uses_system_prompt() { :; }

harness_limits() {
  if [ "$1" = 1 ]; then
    echo "at most ${MAX_TURNS:-60} turns; git commit, git push, gh pr comment and notebook edits are denied."
  else
    echo "at most ${MAX_TURNS:-60} turns; Edit, Write, git commit, git push and gh pr comment are denied."
  fi
}

harness_run() {
  local allowed="Read,Glob,Grep,Skill,Agent,Bash(gh pr view:*),Bash(gh pr diff:*),Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(node:*)"
  local denied="Edit,MultiEdit,Write,NotebookEdit,Bash(git commit:*),Bash(git push:*),Bash(gh pr comment:*)"
  if [ "${APPLY:-0}" = 1 ]; then
    allowed="$allowed,Edit,Write,MultiEdit"
    denied="NotebookEdit,Bash(git commit:*),Bash(git push:*),Bash(gh pr comment:*)"
  fi
  local sys=()
  if [ -n "${SYSTEM_PROMPT:-}" ]; then sys=(--append-system-prompt "$SYSTEM_PROMPT"); fi
  ANTHROPIC_API_KEY="$KEY" claude -p "$PROMPT" ${sys[@]+"${sys[@]}"} \
    --output-format json \
    --max-turns "$MAX_TURNS" \
    --allowedTools "$allowed" \
    --disallowedTools "$denied" \
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
