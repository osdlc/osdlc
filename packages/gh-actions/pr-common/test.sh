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
      *headRefOid*) printf '%s\t%s\t%s\t%s\t%s\n' "${FAKE_OWNER:-o}" "${FAKE_NAME:-r}" "${FAKE_REF:-feat}" "${FAKE_OID:-$(git rev-parse HEAD)}" "${FAKE_BASE:-main}" ;;
      *baseRefName*) echo main ;;
      *title*) echo "A title" ;;
      *) echo "PR description and comments" ;;
    esac ;;
  "repo view") echo "${FAKE_DEFAULT:-main}" ;;
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
printf '%s' "$2" > "$FAKE_DIR/prompt"
for a in "$@"; do
  if [ "${prev:-}" = --append-system-prompt ]; then printf '%s' "$a" > "$FAKE_DIR/system"; fi
  prev="$a"
done
case "$ANTHROPIC_API_KEY" in
  bad*) echo '{"is_error":true,"api_error_status":401,"num_turns":1,"result":"Invalid API key"}'; exit 1 ;;
  boom*) echo '{"is_error":true,"num_turns":5,"result":"overloaded"}'; exit 1 ;;
  exh*) echo '{"is_error":true,"api_error_status":402,"num_turns":1,"result":"Your credit balance is too low to access the API"}'; exit 1 ;;
  lim*) echo '{"is_error":true,"api_error_status":429,"num_turns":1,"result":"You have reached your monthly limit"}'; exit 1 ;;
  plain*) echo "Invalid API key"; exit 1 ;;
  rate*) echo '{"is_error":true,"api_error_status":429,"num_turns":1,"result":"rate_limit_error: Number of requests has exceeded your per-minute rate limit"}'; exit 1 ;;
  trap*) echo '{"is_error":true,"num_turns":5,"result":"credit balance is too low (quoted from a file)"}'; exit 1 ;;
  leak*) echo "{\"is_error\":true,\"num_turns\":5,\"result\":\"oops\"}"; exit 1 ;;
esac
if [ -n "${FAKE_EDIT:-}" ]; then echo edited >> f; fi
if [ -n "${FAKE_EDIT_PATH:-}" ]; then mkdir -p "$(dirname "$FAKE_EDIT_PATH")"; echo x > "$FAKE_EDIT_PATH"; fi
if [ -n "${FAKE_EDIT_LINK:-}" ]; then ln -s /etc/passwd lnk; fi
if [ -n "${FAKE_EDIT_EXEC:-}" ]; then echo x > run.sh; chmod +x run.sh; fi
if [ -n "${FAKE_EDIT_SUB:-}" ]; then git init -q sub; git -C sub -c user.name=a -c user.email=a@b commit -q --allow-empty -m x; fi
if [ -n "${FAKE_COMMIT:-}" ]; then git -c user.name=a -c user.email=a@b commit -qam sneaky; fi
echo "{\"is_error\":false,\"num_turns\":3,\"result\":\"${FAKE_SAY:-claude says hi}\"}"
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
  case "$1" in developer_instructions=*) printf '%s' "${1#developer_instructions=}" | jq -r . > "$FAKE_DIR/system" ;; esac
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
if [ -n "${FAKE_EDIT:-}" ]; then echo edited >> f; fi
if [ -n "${FAKE_EDIT_PATH:-}" ]; then mkdir -p "$(dirname "$FAKE_EDIT_PATH")"; echo x > "$FAKE_EDIT_PATH"; fi
if [ -n "${FAKE_EDIT_LINK:-}" ]; then ln -s /etc/passwd lnk; fi
if [ -n "${FAKE_EDIT_EXEC:-}" ]; then echo x > run.sh; chmod +x run.sh; fi
if [ -n "${FAKE_EDIT_SUB:-}" ]; then git init -q sub; git -C sub -c user.name=a -c user.email=a@b commit -q --allow-empty -m x; fi
if [ -n "${FAKE_COMMIT:-}" ]; then git -c user.name=a -c user.email=a@b commit -qam sneaky; fi
echo "${FAKE_SAY:-codex says hi}" > "$last"
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
  quota*) echo "Per-minute quota reached, retry in 30s"; exit 1 ;;
  rate*) echo "Too many requests, slow down"; exit 1 ;;
  trap*) echo '{"is_error":true,"num_turns":5,"result":"usage limit quoted from a file"}'; exit 1 ;;
esac
if [ -n "${FAKE_EDIT:-}" ]; then echo edited >> f; fi
if [ -n "${FAKE_EDIT_PATH:-}" ]; then mkdir -p "$(dirname "$FAKE_EDIT_PATH")"; echo x > "$FAKE_EDIT_PATH"; fi
if [ -n "${FAKE_EDIT_LINK:-}" ]; then ln -s /etc/passwd lnk; fi
if [ -n "${FAKE_EDIT_EXEC:-}" ]; then echo x > run.sh; chmod +x run.sh; fi
if [ -n "${FAKE_EDIT_SUB:-}" ]; then git init -q sub; git -C sub -c user.name=a -c user.email=a@b commit -q --allow-empty -m x; fi
if [ -n "${FAKE_COMMIT:-}" ]; then git -c user.name=a -c user.email=a@b commit -qam sneaky; fi
echo "{\"type\":\"result\",\"is_error\":false,\"result\":\"${FAKE_SAY:-cursor says hi}\"}"
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
  git init -q --bare "$T/origin.git"
  git remote add origin "$T/origin.git"
  git push -q origin HEAD:refs/heads/feat
)
echo ".cursor" >> "$T/repo/.git/info/exclude"
BASE_HEAD="$(git -C "$T/repo" rev-parse HEAD)"
# reset_repo: back to the checkout every run starts from, and the remote branch with it.
reset_repo() {
  rm -rf "$T/repo/sub"
  git -C "$T/repo" reset -q --hard "$BASE_HEAD"
  git -C "$T/repo" clean -ffdq
  git -C "$T/repo" push -q -f origin "$BASE_HEAD:refs/heads/feat"
}

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
  reset_repo
  (
    cd "$T/repo" || exit 1
    export AGENT="$agent" HARNESS_SH="$gha/$agent-pr/harness.sh" KEY_VAR="$keyvar" KEYS="$keys" MODE="$mode" \
      MAX_TURNS=60 RESULT="$RUNNER_TEMP/$agent-pr-result.json" REPO=o/r PR=7 SOURCE_URL=http://x \
      REQUEST="${4:-@$agent hi}" RUN_URL=http://run GH_TOKEN=tok GITHUB_OUTPUT="$FAKE_DIR/gh_out"
    : > "$GITHUB_OUTPUT"
    rm -rf "$T/artifact" "$T/runner2" "$T/push"
    "$here/ask.sh" > "$FAKE_DIR/ask.log" 2>&1
    echo $? > "$FAKE_DIR/status"
    # The action's patch step: only for a successful skill run that asked for --apply.
    if [ "$mode" = skill ] && [ "$(cat "$FAKE_DIR/status")" = 0 ] && printf '%s\n' "$REQUEST" | head -n 1 | grep -q -- ' --apply\( \|$\)'; then
      "$here/apply.sh" patch >> "$FAKE_DIR/ask.log" 2>&1 || echo 1 > "$FAKE_DIR/status"
    fi
    if grep -q '^patch=true$' "$GITHUB_OUTPUT"; then
      # upload-artifact, then the push job: a fresh clone-less checkout, no agent, the artifact only.
      cp -R "$RUNNER_TEMP/$agent-pr-apply" "$T/artifact"
      mkdir -p "$T/runner2" "$T/push"
      cp -R "$T/artifact" "$T/runner2/$agent-pr-apply"
      (
        cd "$T/push" || exit 1
        git init -q .
        git remote add origin "$T/origin.git"
        export RUNNER_TEMP="$T/runner2" PUSH_TOKEN="${PUSH_TOKEN-pushtok}" GIT_USER_NAME="osdlc-release[bot]" GIT_USER_EMAIL=bot@example.com
        export FAKE_OID="${FAKE_OID:-$BASE_HEAD}"
        for v in OWNER NAME REF BASE DEFAULT OID; do
          pv="PUSH_FAKE_$v"
          if [ -n "${!pv+x}" ]; then export "FAKE_$v=${!pv}"; fi
        done
        unset RESULT
        "$here/apply.sh" push >> "$FAKE_DIR/ask.log" 2>&1 || echo 1 > "$FAKE_DIR/status"
        RESULT="$RUNNER_TEMP/$agent-pr-apply/result.json" "$here/post.sh" >> "$FAKE_DIR/ask.log" 2>&1
      )
    else
      "$here/post.sh" >> "$FAKE_DIR/ask.log" 2>&1
    fi
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
  [ "$(mention $agent "@$agent /craft:simplify")" = "real=1 mode=skill apply=0 " ] && ok "$agent: skill mode" || bad "$agent: skill mode"
  [ "$(mention $agent "@$agent /craft:simplify src --apply")" = "real=1 mode=skill apply=1 " ] && ok "$agent: skill mode with --apply" || bad "$agent: skill mode with --apply"
  [ "$(mention $agent "@$agent /simplify")" = "real=1 mode=skill apply=0 " ] && ok "$agent: bare skill" || bad "$agent: bare skill"
  [ "$(mention $agent "@$agent /simplify --applyx")" = "real=1 mode=skill apply=0 " ] && ok "$agent: --applyx is not --apply" || bad "$agent: --applyx is not --apply"
  [ "$(mention $agent "@$agent /simplify
--apply")" = "real=1 mode=skill apply=0 " ] && ok "$agent: --apply only counts on the first line" || bad "$agent: --apply only counts on the first line"
  [ "$(mention $agent "@$agent what about /craft:simplify")" = "real=1 mode=answer " ] && ok "$agent: skill not first is an answer" || bad "$agent: skill not first is an answer"
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
  check "$agent: success after a passed-over key has no failure prefix" bash -c '! grep -q "keys in" "$1"' _ "$FAKE_DIR/posted"
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
run claude answer "lim1 good"
[ "$status" = 0 ] && [ "$(nkeys)" = 2 ] && ok "claude: 429 naming a monthly limit falls through" || bad "claude: 429 naming a monthly limit falls through"
run claude answer "plain1 plain2"
check "claude: non-JSON result still gets the reason line" grep -q 'All 2 keys in .* failed authentication' "$FAKE_DIR/posted"
run cursor answer "quota1 good"
[ "$status" != 0 ] && [ "$(nkeys)" = 1 ] && ok "cursor: bare quota wording does not fall through" || bad "cursor: bare quota wording does not fall through"
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

# --- skill mode, per agent
fenced='```'$'\nplease be brief\n''```'
ticks='a ```x``` b'
skillreq() { # agent, first-line rest, [extra lines]
  printf '@%s %s' "$1" "$2"
  if [ -n "${3:-}" ]; then printf '\n%s' "$3"; fi
}
remote_head() { git -C "$T/origin.git" rev-parse refs/heads/feat; }
prompt_of() { # the prompt proper: claude's argument, the others' stdin
  if [ "$1" = claude ]; then cat "$FAKE_DIR/prompt"; else cat "$FAKE_DIR/stdin"; fi
}
block_of() { # the how-called block: system prompt for claude and codex, the prompt for cursor
  if [ "$1" = cursor ]; then cat "$FAKE_DIR/stdin"; else cat "$FAKE_DIR/system"; fi
}
for agent in claude codex cursor; do
  label="$(printf '%s' "${agent:0:1}" | tr a-z A-Z)${agent:1}"
  sk=/craft:code-review

  # read-only, with extra lines
  run $agent skill good "$(skillreq $agent "$sk some args" 'please be brief')"
  prompt_of $agent > "$T/prompt"
  block_of $agent > "$T/block"
  [ "$status" = 0 ] && ok "$agent skill: read-only run succeeds" || bad "$agent skill: read-only run succeeds"
  case $agent in
    claude)
      check "claude skill: prompt is only the slash command" test "$(cat "$T/prompt")" = '/craft:code-review some args'
      check "claude skill: block is in --append-system-prompt" grep -q '^How you were called$' "$FAKE_DIR/system"
      check "claude skill: argv has --append-system-prompt" grep -q -- '--append-system-prompt' "$FAKE_DIR/args" ;;
    codex)
      check "codex skill: prompt is only \$plugin:skill" test "$(cat "$T/prompt")" = '$craft:code-review some args'
      check "codex skill: block is in developer_instructions" grep -q '^How you were called$' "$FAKE_DIR/system"
      check "codex skill: developer_instructions flag" grep -q -- '-c developer_instructions=' "$FAKE_DIR/args" ;;
    cursor)
      check "cursor skill: block first" test "$(head -n 1 "$T/prompt")" = 'How you were called'
      check "cursor skill: the call is last" test "$(tail -n 1 "$T/prompt")" = 'Run the craft:code-review skill, whose full text follows this message, with the arguments: some args.'
      check "cursor skill: SKILL.md inlined" grep -q 'code-review — the review itself' "$T/prompt" ;;
  esac
  check "$agent skill: how-called block" grep -q '^How you were called$' "$T/block"
  check "$agent skill: read-only wording" grep -q -- '^- Mode: READ-ONLY\. You cannot edit files\. Report findings and, where useful, a proposed unified diff\.$' "$T/block"
  check "$agent skill: pull request line" grep -q -- '^- Pull request: #7 "A title" in o/r, base main, head [0-9a-f]\{40\}\. The checkout is the current directory\.$' "$T/block"
  check "$agent skill: headless, no questions" grep -q 'No human can answer questions' "$T/block"
  check "$agent skill: arguments stated" grep -q -- '^- Requested: .*, arguments: some args$' "$T/block"
  check "$agent skill: extra lines fenced as data" grep -q -F -x -- "$fenced" "$T/block"
  check "$agent skill: output instructions" grep -q 'posted verbatim as a PR comment' "$T/block"
  check "$agent skill: no --apply text in args" bash -c "! grep -q -- '--apply' '$T/prompt'"
  check "$agent skill: marker" grep -q "^<!-- $agent-skill: done head=[0-9a-f]\{40\} -->\$" "$FAKE_DIR/posted"
  check "$agent skill: header" grep -q "^\*\*$label ran /craft:code-review\*\* for [0-9a-f]\{7\}\.\$" "$FAKE_DIR/posted"
  check "$agent skill: read-only pushes nothing" test "$(remote_head)" = "$BASE_HEAD"
  case $agent in
    claude)
      check "claude skill: edit tools denied read-only" grep -q -- '--disallowedTools Edit,MultiEdit,Write' "$FAKE_DIR/args"
      check "claude skill: limits line" grep -q -- 'Limits: at most 60 turns; Edit, Write' "$T/block" ;;
    codex)
      check "codex skill: read-only sandbox" grep -q -- '--sandbox read-only' "$FAKE_DIR/args"
      check "codex skill: limits line" grep -q -- 'Limits: no network; sandbox read-only' "$T/block"
      check "codex skill: prefetched files named" grep -q 'codex-pr-context/review.diff' "$T/block" ;;
    cursor)
      check "cursor skill: ask mode read-only" grep -q -- '--mode ask' "$FAKE_DIR/args"
      check "cursor skill: writes denied read-only" grep -q '"deny":\["Write(\*\*)"' "$FAKE_DIR/cli.json"
      check "cursor skill: limits line" grep -q -- 'Limits: ask mode; writes, gh, curl and wget are denied' "$T/block" ;;
  esac

  # a fence longer than any backtick run in the comment
  run $agent skill good "$(skillreq $agent "$sk" "$ticks")"
  block_of $agent > "$T/block"
  check "$agent skill: fence outgrows backticks in the comment" grep -q -x -- '````' "$T/block"

  # --apply with changes: the agent job makes a patch, the push job commits and pushes
  FAKE_EDIT=1 run $agent skill good "$(skillreq $agent "$sk x --apply")"
  prompt_of $agent > "$T/prompt"
  block_of $agent > "$T/block"
  check "$agent apply: --apply not in the prompt" bash -c "! grep -q -- '--apply' '$T/prompt'"
  [ "$status" = 0 ] && ok "$agent apply: succeeds" || bad "$agent apply: succeeds"
  check "$agent apply: APPLY wording" grep -q -- '^- Mode: APPLY\. You may edit files in the working tree\. Do not run git commit, git push or post comments' "$T/block"
  check "$agent apply: --apply stripped from args" grep -q -- 'arguments: x$' "$T/block"
  check "$agent apply: patch artifact" test -s "$T/artifact/patch"
  check "$agent apply: artifact records head and paths" test "$(jq -c '[.head, .paths]' "$T/artifact/meta.json")" = "[\"$BASE_HEAD\",[\"f\"]]"
  check "$agent apply: artifact carries the agent output" grep -q "$agent says hi" "$T/artifact/result.json"
  check "$agent apply: remote branch moved" test "$(remote_head)" != "$BASE_HEAD"
  check "$agent apply: one commit on the head" test "$(git -C "$T/origin.git" rev-list --count "$BASE_HEAD..feat")" = 1
  check "$agent apply: commit message" test "$(git -C "$T/origin.git" log -1 --format=%s feat)" = "$agent: /craft:code-review x (requested in #7 comment)"
  check "$agent apply: author" test "$(git -C "$T/origin.git" log -1 --format='%an <%ae>' feat)" = "osdlc-release[bot] <bot@example.com>"
  check "$agent apply: no trailers" test "$(git -C "$T/origin.git" log -1 --format=%b feat)" = ""
  check "$agent apply: header names both commits" grep -q "^\*\*$label ran /craft:code-review\*\* for [0-9a-f]\{7\} and pushed $(remote_head | cut -c1-7)\.\$" "$FAKE_DIR/posted"
  check "$agent apply: the push job posts the agent output" grep -q "$agent says hi" "$FAKE_DIR/posted"
  check "$agent apply: marker head is the one covered" grep -q "^<!-- $agent-skill: done head=$BASE_HEAD -->\$" "$FAKE_DIR/posted"
  check "$agent apply: diffstat posted" grep -q ' f | 1 +' "$FAKE_DIR/posted"
  case $agent in
    claude)
      check "claude apply: Edit,Write,MultiEdit allowed" grep -q -- '--allowedTools .*,Edit,Write,MultiEdit ' "$FAKE_DIR/args"
      check "claude apply: commit and push still denied" grep -q -- '--disallowedTools NotebookEdit,Bash(git commit:\*),Bash(git push:\*),Bash(gh pr comment:\*)' "$FAKE_DIR/args" ;;
    codex) check "codex apply: workspace-write sandbox" grep -q -- '--sandbox workspace-write' "$FAKE_DIR/args" ;;
    cursor)
      check "cursor apply: no ask mode" bash -c "! grep -q -- '--mode ask' '$FAKE_DIR/args'"
      check "cursor apply: writes allowed" grep -q '"allow":\["Read(\*\*)","Write(\*\*)"' "$FAKE_DIR/cli.json"
      check "cursor apply: gh and curl still denied" grep -q '"deny":\["Shell(gh)","Shell(curl)","Shell(wget)"\]' "$FAKE_DIR/cli.json" ;;
  esac

  # new files are in the patch too; a commit the agent made is squashed into the one commit
  FAKE_COMMIT=1 FAKE_EDIT=1 FAKE_EDIT_PATH=docs/new.md run $agent skill good "$(skillreq $agent "$sk --apply")"
  [ "$status" = 0 ] && [ "$(git -C "$T/origin.git" rev-list --count "$BASE_HEAD..feat")" = 1 ] && ok "$agent apply: agent commit and new file become one commit" || bad "$agent apply: agent commit and new file become one commit"
  check "$agent apply: new file pushed" test "$(git -C "$T/origin.git" show feat:docs/new.md)" = x

  # --apply, nothing changed: no artifact, no push job
  run $agent skill good "$(skillreq $agent "$sk --apply")"
  [ "$status" = 0 ] && ok "$agent apply: no changes succeeds" || bad "$agent apply: no changes succeeds"
  check "$agent apply: no changes makes no artifact" test ! -e "$T/artifact"
  check "$agent apply: no changes pushes nothing" test "$(remote_head)" = "$BASE_HEAD"
  check "$agent apply: no changes is said" grep -q 'No files changed' "$FAKE_DIR/posted"
  check "$agent apply: no changes header has no push" bash -c "! grep -q 'and pushed' '$FAKE_DIR/posted'"
  check "$agent apply: no changes marker" grep -q "^<!-- $agent-skill: done head=" "$FAKE_DIR/posted"

  # changes without --apply make no patch and are never pushed
  FAKE_EDIT=1 run $agent skill good "$(skillreq $agent "$sk")"
  check "$agent skill: edits without --apply are not pushed" test "$(remote_head)" = "$BASE_HEAD"
  check "$agent skill: edits without --apply make no artifact" test ! -e "$T/artifact"

  # push job refusals; each keeps the agent output in the comment
  refused() { # name, expected text
    [ "$status" != 0 ] && ok "$agent apply: $1 refused" || bad "$agent apply: $1 refused"
    check "$agent apply: $1 comment" grep -q -- "$2" "$FAKE_DIR/posted"
    check "$agent apply: $1 keeps the agent output" grep -q "$agent says hi" "$FAKE_DIR/posted"
    check "$agent apply: $1 pushes nothing" test "$(remote_head)" = "$BASE_HEAD"
    check "$agent apply: $1 marker" grep -q "^<!-- $agent-skill: failed head=$BASE_HEAD -->" "$FAKE_DIR/posted"
  }
  PUSH_TOKEN= FAKE_EDIT=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused "missing token or environment" 'no push token'
  check "$agent apply: missing token names the environment" grep -q 'pr-agent' "$FAKE_DIR/posted"
  PUSH_FAKE_OID=0000000000000000000000000000000000000000 FAKE_EDIT=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused "moved head" 'branch moved since'
  PUSH_FAKE_OWNER=someone-else FAKE_EDIT=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused "fork (push job)" 'only works when the pull request.s branch is in o/r'
  PUSH_FAKE_REF=main FAKE_EDIT=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused "default branch (push job)" 'never pushes to the default or base branch'
  PUSH_FAKE_BASE=feat FAKE_EDIT=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused "base branch (push job)" 'never pushes to the default or base branch'
  FAKE_EDIT_PATH=.github/workflows/x.yml run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused ".github path" 'a protected path (.github/workflows/x.yml)'
  FAKE_EDIT_PATH=.gitmodules run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused ".git* path" 'a protected path (.gitmodules)'
  FAKE_EDIT_PATH=pkg/.gitattributes run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused "nested .git* path" 'a protected path'
  FAKE_EDIT_LINK=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused "symlink" 'a symlink (lnk)'
  FAKE_EDIT_EXEC=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused "new executable" 'a new executable bit (run.sh)'
  FAKE_EDIT_SUB=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  refused "submodule" 'a submodule (sub)'

  # the agent job refuses before the agent runs
  FAKE_OWNER=someone-else FAKE_EDIT=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  [ "$status" != 0 ] && [ ! -e "$FAKE_DIR/keys" ] && ok "$agent apply: fork refused, agent not run" || bad "$agent apply: fork refused, agent not run"
  check "$agent apply: fork comment" grep -q 'only works when the pull request.s branch is in o/r' "$FAKE_DIR/posted"
  check "$agent apply: fork pushes nothing" test "$(remote_head)" = "$BASE_HEAD"
  FAKE_OWNER=someone-else run $agent skill good "$(skillreq $agent "$sk")"
  [ "$status" = 0 ] && ok "$agent skill: a fork is fine read-only" || bad "$agent skill: a fork is fine read-only"
  FAKE_REF=main FAKE_EDIT=1 run $agent skill good "$(skillreq $agent "$sk --apply")"
  [ "$status" != 0 ] && [ ! -e "$FAKE_DIR/keys" ] && ok "$agent apply: default branch head refused, agent not run" || bad "$agent apply: default branch head refused, agent not run"
  check "$agent apply: default branch comment" grep -q 'never pushes to the default or base branch' "$FAKE_DIR/posted"

  # names
  run $agent skill good "$(skillreq $agent '/bad;name')"
  [ "$status" != 0 ] && [ ! -e "$FAKE_DIR/keys" ] && ok "$agent skill: invalid name refused, agent not run" || bad "$agent skill: invalid name refused, agent not run"
  check "$agent skill: invalid name comment" grep -q 'not a valid skill name' "$FAKE_DIR/posted"
  check "$agent skill: invalid name marker" grep -q "^<!-- $agent-skill: failed head=" "$FAKE_DIR/posted"
  check "$agent skill: invalid name is sanitized in the header" grep -q "^\*\*$label could not run /badname\*\*" "$FAKE_DIR/posted"
  run $agent skill good "$(skillreq $agent '/a:b:c')"
  [ "$status" != 0 ] && ok "$agent skill: two colons refused" || bad "$agent skill: two colons refused"

  # unknown skill
  if [ $agent = cursor ]; then
    run $agent skill good "$(skillreq $agent '/craft:nope')"
    check "cursor skill: unknown skill lists where it looked" grep -q 'Looked in:' "$FAKE_DIR/posted"
    check "cursor skill: lists the bundled pack" grep -q 'packs/craft/skills/nope/SKILL.md' "$FAKE_DIR/posted"
    [ ! -e "$FAKE_DIR/keys" ] && ok "cursor skill: unknown skill, agent not run" || bad "cursor skill: unknown skill, agent not run"
    run $agent skill good "$(skillreq $agent '/code-review')"
    [ "$status" = 0 ] && ok "cursor skill: bare name found in any pack" || bad "cursor skill: bare name found in any pack"
  else
    FAKE_SAY="Unknown skill: nope:thing" run $agent skill good "$(skillreq $agent '/nope:thing')"
    [ "$status" != 0 ] && ok "$agent skill: unknown skill fails" || bad "$agent skill: unknown skill fails"
    check "$agent skill: unknown skill reason" grep -q 'is not installed or not found' "$FAKE_DIR/posted"
    check "$agent skill: unknown skill marker" grep -q "^<!-- $agent-skill: failed head=" "$FAKE_DIR/posted"
  fi

  # a long ordinary answer that mentions "skill" is not an unknown skill
  FAKE_SAY="Reviewed. The command was found in the skill and applied cleanly to $(printf 'x%.0s' $(seq 1 450))" run $agent skill good "$(skillreq $agent "$sk")"
  [ "$status" = 0 ] && ok "$agent skill: long output is not an unknown skill" || bad "$agent skill: long output is not an unknown skill"

  # failure of the CLI is a failed skill comment
  run $agent skill boom "$(skillreq $agent "$sk")"
  check "$agent skill: failed run" grep -q "^\*\*$label could not run /craft:code-review\*\* for [0-9a-f]\{7\}\." "$FAKE_DIR/posted"

  # answers and reviews carry no skill block
  run $agent answer good
  check "$agent answer: no how-called block" bash -c "! grep -q 'How you were called' <(cat '$FAKE_DIR/args' '$FAKE_DIR/stdin' 2>/dev/null)"
  check "$agent answer: no system prompt added" bash -c "! grep -q -e append-system-prompt -e developer_instructions '$FAKE_DIR/args'"
done

# --- a key echoed back in an error never reaches the comment
run codex answer "bad-secret-key-123"
check "codex: key redacted in failed comment" bash -c "! grep -q 'bad-secret-key-123' '$FAKE_DIR/posted' && grep -q '\*\*\*' '$FAKE_DIR/posted'"

[ "$failures" -eq 0 ] && echo "all passed" || { echo "$failures case(s) failed"; exit 1; }
