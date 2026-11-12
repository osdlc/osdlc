#!/usr/bin/env bash
# Runs mention.sh, ask.sh and post.sh for claude, codex and cursor against fake
# claude, codex, agent and gh programs on PATH. Needs no network and no keys.
# Checks the mention filter, mode parsing, key rotation only on authentication
# failures, the read-only flags, key redaction and each harness's markers.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
gha="$(cd "$here/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
failures=0

ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }
check() { # name, command...
  local name="$1"
  shift
  if "$@" > /dev/null 2>&1; then ok "$name"; else bad "$name"; fi
}

mkdir -p "$T/bin" "$T/repo"

# --- fake gh: answers what the scripts ask, posts a comment into $T/posted
cat > "$T/bin/gh" <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in
  "pr view")
    case "$*" in
      *baseRefName*) echo main ;;
      *) echo "PR description and comments" ;;
    esac ;;
  "pr diff") echo "diff --git a/f b/f" ;;
  "pr comment")
    while [ $# -gt 0 ]; do
      if [ "$1" = --body-file ]; then cp "$2" "$FAKE_DIR/posted"; fi
      shift
    done ;;
esac
EOF

# --- fake claude: key from ANTHROPIC_API_KEY. bad* -> 401, boom -> other error
cat > "$T/bin/claude" <<'EOF'
#!/usr/bin/env bash
echo "$ANTHROPIC_API_KEY" >> "$FAKE_DIR/keys"
echo "$*" > "$FAKE_DIR/args"
case "$ANTHROPIC_API_KEY" in
  bad*) echo '{"is_error":true,"api_error_status":401,"num_turns":1,"result":"Invalid API key"}'; exit 1 ;;
  boom*) echo '{"is_error":true,"num_turns":5,"result":"overloaded"}'; exit 1 ;;
  exh*) echo '{"is_error":true,"api_error_status":402,"num_turns":1,"result":"Your credit balance is too low to access the API"}'; exit 1 ;;
  rate*) echo '{"is_error":true,"api_error_status":429,"num_turns":1,"result":"rate_limit_error: Number of requests has exceeded your per-minute rate limit"}'; exit 1 ;;
  trap*) echo '{"is_error":true,"num_turns":5,"result":"credit balance is too low (quoted from a file)"}'; exit 1 ;;
  leak*) echo "{\"is_error\":true,\"num_turns\":5,\"result\":\"oops\"}"; exit 1 ;;
esac
echo '{"is_error":false,"num_turns":3,"result":"claude says hi"}'
EOF

# --- fake codex: key from CODEX_API_KEY; last message goes to --output-last-message
cat > "$T/bin/codex" <<'EOF'
#!/usr/bin/env bash
echo "$CODEX_API_KEY" >> "$FAKE_DIR/keys"
echo "$*" > "$FAKE_DIR/args"
cat > "$FAKE_DIR/stdin"
last=""
while [ $# -gt 0 ]; do
  if [ "$1" = --output-last-message ]; then last="$2"; fi
  shift
done
case "$CODEX_API_KEY" in
  bad*) echo '{"type":"turn.failed","error":{"message":"unexpected status 401 Unauthorized: Incorrect API key provided: '"$CODEX_API_KEY"'"}}'; exit 1 ;;
  boom*) echo '{"type":"turn.failed","error":{"message":"stream disconnected, request id req_401abc"}}'; exit 1 ;;
  exh*) echo '{"type":"turn.failed","error":{"message":"You exceeded your current quota, please check your plan and billing details. insufficient_quota"}}'; exit 1 ;;
  rate*) echo '{"type":"turn.failed","error":{"message":"429 Too Many Requests: Rate limit reached for requests per min"}}'; exit 1 ;;
  trap*) echo "insufficient_quota exceeded your current quota" > "$last"; echo "stream disconnected" >&2; exit 1 ;;
esac
echo "not json line"
echo '{"type":"thread.started","thread_id":"t"}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"codex says hi"}}'
echo '{"type":"turn.completed","usage":{}}'
echo "codex says hi" > "$last"
EOF

# --- fake agent (cursor): key from CURSOR_API_KEY; bad* -> plain-text exit 1
cat > "$T/bin/agent" <<'EOF'
#!/usr/bin/env bash
echo "$CURSOR_API_KEY" >> "$FAKE_DIR/keys"
echo "$*" > "$FAKE_DIR/args"
cat > "$FAKE_DIR/stdin"
cp .cursor/cli.json "$FAKE_DIR/cli.json" 2> /dev/null
case "$CURSOR_API_KEY" in
  bad*) printf '\033[33m⚠ Warning: The provided API key is invalid.\033[0m\n' ; exit 1 ;;
  boom*) echo "Something broke"; exit 1 ;;
  exh*) echo "You have hit your usage limit. Upgrade your plan."; exit 1 ;;
  rate*) echo "Too many requests, slow down"; exit 1 ;;
  trap*) echo '{"is_error":true,"num_turns":5,"result":"usage limit quoted from a file"}'; exit 1 ;;
esac
echo '{"type":"result","is_error":false,"result":"cursor says hi"}'
EOF
chmod +x "$T/bin"/*

# A repository with origin/main behind HEAD, so `git diff origin/main...HEAD` works.
(
  cd "$T/repo" || exit 1
  git init -q -b main .
  git config user.email t@example.com
  git config user.name t
  echo a > f && git add f && git commit -qm one
  git update-ref refs/remotes/origin/main HEAD
  echo b >> f && git commit -qam two
)

export FAKE_DIR="$T/fake"
export PATH="$T/bin:$PATH"
export RUNNER_TEMP="$T/runner"
export GITHUB_ACTION_PATH="$gha/cursor-pr"
mkdir -p "$RUNNER_TEMP"

# run <agent> <mode> <keys> [request]: runs ask.sh then post.sh; sets $status.
run() {
  local agent="$1" mode="$2" keys="$3" keyvar
  case "$agent" in claude) keyvar=ANTHROPIC_API_KEY ;; codex) keyvar=OPENAI_API_KEY ;; cursor) keyvar=CURSOR_API_KEY ;; esac
  rm -rf "$FAKE_DIR"
  mkdir -p "$FAKE_DIR"
  (
    cd "$T/repo" || exit 1
    export AGENT="$agent" HARNESS_SH="$gha/$agent-pr/harness.sh" KEY_VAR="$keyvar" KEYS="$keys" MODE="$mode" \
      MAX_TURNS=60 RESULT="$RUNNER_TEMP/$agent-pr-result.json" REPO=o/r PR=7 SOURCE_URL=http://x \
      REQUEST="${4:-@$agent hi}" RUN_URL=http://run GH_TOKEN=tok
    "$here/ask.sh" > "$FAKE_DIR/ask.log" 2>&1
    echo $? > "$FAKE_DIR/status"
    "$here/post.sh" >> "$FAKE_DIR/ask.log" 2>&1
  )
  status="$(cat "$FAKE_DIR/status")"
}

nkeys() { wc -l < "$FAKE_DIR/keys" | tr -d ' '; }

# --- mention filter and mode, per agent
mention() { # agent, request -> prints "real mode"
  local out="$T/gh_output"
  : > "$out"
  AGENT="$1" REQUEST="$2" GITHUB_OUTPUT="$out" "$here/mention.sh" > /dev/null
  tr '\n' ' ' < "$out"
}
for agent in claude codex cursor; do
  other=codex; [ "$agent" = codex ] && other=cursor
  [ "$(mention $agent "@$agent what is this")" = "real=1 mode=answer " ] && ok "$agent: plain mention answers" || bad "$agent: plain mention answers"
  [ "$(mention $agent "@$agent review focus on x")" = "real=1 mode=review " ] && ok "$agent: review mode" || bad "$agent: review mode"
  [ "$(mention $agent "  @$agent review")" = "real=1 mode=review " ] && ok "$agent: review mode, indented, no focus" || bad "$agent: review mode, indented, no focus"
  [ "$(mention $agent "thanks @$agent review please")" = "real=1 mode=answer " ] && ok "$agent: review not on first line start is an answer" || bad "$agent: review not at start is an answer"
  [ "$(mention $agent "@$agent reviewer?")" = "real=1 mode=answer " ] && ok "$agent: reviewer is not review" || bad "$agent: reviewer is not review"
  [ -z "$(mention $agent "\`@$agent\` in code")" ] && ok "$agent: inline code ignored" || bad "$agent: inline code ignored"
  [ -z "$(mention $agent $'```\n@'"$agent"$'\n```')" ] && ok "$agent: fenced code ignored" || bad "$agent: fenced code ignored"
  [ -z "$(mention $agent "> @$agent quoted")" ] && ok "$agent: quote ignored" || bad "$agent: quote ignored"
  [ -z "$(mention $agent "me@$agent.com and @${agent}x and @$other")" ] && ok "$agent: other words and agents ignored" || bad "$agent: other words and agents ignored"
done

# --- key rotation, markers, read-only flags, per agent
for agent in claude codex cursor; do
  label="$(printf '%s' "${agent:0:1}" | tr a-z A-Z)${agent:1}"

  run $agent answer "bad1 bad2,good"
  [ "$status" = 0 ] && [ "$(nkeys)" = 3 ] && ok "$agent: rotates past two auth failures" || bad "$agent: rotates past two auth failures"
  check "$agent: warns about each dead key" test "$(grep -c '::warning::' "$FAKE_DIR/ask.log")" = 2
  check "$agent: masks keys" grep -q '::add-mask::good' "$FAKE_DIR/ask.log"
  check "$agent: answer marker" grep -q "^<!-- $agent-answer: done head=[0-9a-f]\{40\} -->\$" "$FAKE_DIR/posted"
  check "$agent: answer text posted" grep -q "$agent says hi" "$FAKE_DIR/posted"

  run $agent answer "boom good"
  [ "$status" != 0 ] && [ "$(nkeys)" = 1 ] && ok "$agent: no rotation on other failures" || bad "$agent: no rotation on other failures"
  check "$agent: failed marker" grep -q "^<!-- $agent-answer: failed head=" "$FAKE_DIR/posted"
  check "$agent: failed answer says who" grep -q "^$label could not answer" "$FAKE_DIR/posted"

  run $agent answer "bad1 bad2"
  [ "$status" != 0 ] && [ "$(nkeys)" = 2 ] && ok "$agent: all keys dead fails" || bad "$agent: all keys dead fails"
  check "$agent: all dead is a failed comment" grep -q "answer: failed" "$FAKE_DIR/posted"

  run $agent answer "exh1 good"
  [ "$status" = 0 ] && [ "$(nkeys)" = 2 ] && ok "$agent: exhausted key falls through" || bad "$agent: exhausted key falls through"
  check "$agent: exhausted warning" grep -q '::warning::key 1 in .* is out of credit or quota; trying key 2' "$FAKE_DIR/ask.log"

  run $agent answer "exh1 bad1 good"
  [ "$status" = 0 ] && [ "$(nkeys)" = 3 ] && ok "$agent: exhausted then auth-failed then good" || bad "$agent: exhausted then auth-failed then good"

  run $agent answer "exh1 exh2"
  [ "$status" != 0 ] && [ "$(nkeys)" = 2 ] && ok "$agent: all exhausted fails" || bad "$agent: all exhausted fails"
  check "$agent: all exhausted says so" grep -q 'All 2 keys in .* are out of credit or quota' "$FAKE_DIR/posted"
  check "$agent: last key says no keys left" grep -q 'key 2 in .* is out of credit or quota; no keys left' "$FAKE_DIR/ask.log"

  run $agent answer "bad1 exh1"
  check "$agent: mixed reason" grep -q '1 failed authentication, 1 are out of credit or quota' "$FAKE_DIR/posted"
  run $agent answer "bad1 bad2"
  check "$agent: all auth failed reason" grep -q 'All 2 keys in .* failed authentication' "$FAKE_DIR/posted"

  run $agent answer "rate1 good"
  [ "$status" != 0 ] && [ "$(nkeys)" = 1 ] && ok "$agent: plain rate limit does not fall through" || bad "$agent: plain rate limit does not fall through"

  run $agent answer "trap1 good"
  [ "$status" != 0 ] && [ "$(nkeys)" = 1 ] && ok "$agent: agent output about credit does not fall through" || bad "$agent: agent output about credit does not fall through"

  run $agent answer ""
  check "$agent: no key is reported" grep -q "No .*_API_KEY secret is set" "$FAKE_DIR/posted"

  run $agent review "good" "@$agent review the error paths"
  check "$agent: review marker" grep -q "^<!-- $agent-review: done head=" "$FAKE_DIR/posted"
  check "$agent: review opens with the label" grep -q "^\*\*$label review done\*\* for [0-9a-f]\{7\}\." "$FAKE_DIR/posted"
  run $agent review "boom" "@$agent review"
  check "$agent: failed review" grep -q "^\*\*$label review failed\*\* for" "$FAKE_DIR/posted"
done

# --- per-harness details
run claude review good "@claude review the error paths"
check "claude: skill call" grep -q -- 'by running the /craft:code-review skill with base origin/main' "$FAKE_DIR/args"
check "claude: focus passed" grep -q 'Focus requested by the reviewer: the error paths' "$FAKE_DIR/args"
check "claude: edit tools disallowed" grep -q -- '--disallowedTools Edit,MultiEdit,Write' "$FAKE_DIR/args"
check "claude: max turns" grep -q -- '--max-turns 60' "$FAKE_DIR/args"

run codex review good "@codex review"
check "codex: skill call" grep -q -F 'by running the $craft:code-review skill with base origin/main' "$FAKE_DIR/stdin"
check "codex: read-only sandbox" grep -q -- '--sandbox read-only' "$FAKE_DIR/args"
check "codex: no key in argv" bash -c "! grep -q good '$FAKE_DIR/args'"
check "codex: diff file written" test -s "$RUNNER_TEMP/codex-pr-context/review.diff"
run codex answer good
check "codex: answer reads context files" grep -q 'codex-pr-context/pr.md' "$FAKE_DIR/stdin"
run codex answer good
check "codex: no model flag by default" bash -c "! grep -q -- ' -m ' '$FAKE_DIR/args'"
MODEL=gpt-x run codex answer good
check "codex: model flag" grep -q -- '-m gpt-x' "$FAKE_DIR/args"

run cursor review good "@cursor review"
check "cursor: skill text inlined" grep -q 'code-review — the review itself' "$FAKE_DIR/stdin"
check "cursor: ask mode, trusted workspace" grep -q -- '-p --trust --output-format json --mode ask' "$FAKE_DIR/args"
check "cursor: writes denied while running" grep -q '"deny":\["Write(\*\*)"' "$FAKE_DIR/cli.json"
check "cursor: cli.json removed afterwards" test ! -e "$T/repo/.cursor/cli.json"
mkdir -p "$T/repo/.cursor"
echo '{"keep":1}' > "$T/repo/.cursor/cli.json"
run cursor answer good
check "cursor: existing cli.json restored" grep -q '"keep":1' "$T/repo/.cursor/cli.json"
rm -rf "$T/repo/.cursor"

# --- a key echoed back in an error never reaches the comment
run codex answer "bad-secret-key-123"
check "codex: key redacted in failed comment" bash -c "! grep -q 'bad-secret-key-123' '$FAKE_DIR/posted' && grep -q '\*\*\*' '$FAKE_DIR/posted'"

[ "$failures" -eq 0 ] && echo "all passed" || { echo "$failures case(s) failed"; exit 1; }
