# Sourced by pr-common/ask.sh. Runs `agent -p` (Cursor CLI) once with $KEY.
#
# Auth: CURSOR_API_KEY. A bad key exits 1 with plain text, not JSON ("The API
# key is invalid"), which is what harness_auth_failed looks for.
# Out of credit: unverified. cursor-agent's real usage-limit message was not
# found, so the key_exhausted pattern in harness_run is a guess.
# Read-only: --mode ask plus a temporary .cursor/cli.json that denies writes
# and gh and allows only reads, git and node. Cursor's rules match the command
# name, not its arguments, so `git push` is not blocked by name; the caller's
# token (contents: read) is what stops a push. Cursor has no turn limit flag.
# Skills: cursor has no plugin install, so the craft code-review skill is
# inlined into the review prompt from this repository's .cursor-plugin pack.

HARNESS_OFFLINE=1

cursor_skills_dir() {
  (cd "$GITHUB_ACTION_PATH/../../../.cursor-plugin/packs/craft/skills" && pwd)
}

harness_review_intro() {
  echo "the code-review skill, whose full text follows this message, with base origin/$1"
}

harness_prompt_suffix() {
  local skills
  skills="$(cursor_skills_dir)"
  echo "The code-review skill follows. Its sibling skill folders are under $skills"
  echo "(so <pr-stats-dir> is $skills/pr-stats and the rubric files are in $skills/code-review/references)."
  echo "Run node scripts only with the node command; the change is also in the diff file named above."
  echo
  echo "-----"
  cat "$skills/code-review/SKILL.md"
}

cursor_restore_config() {
  rm -f .cursor/cli.json
  if [ "$2" = 1 ]; then cp -P "$1/cli.json.orig" .cursor/cli.json; fi
}

harness_run() {
  local d="${RUNNER_TEMP:-/tmp}/cursor-pr-run" status had=0
  mkdir -p "$d" .cursor
  : > "$d/out"; : > "$d/err"
  if [ -e .cursor/cli.json ] || [ -L .cursor/cli.json ]; then
    had=1
    cp -P .cursor/cli.json "$d/cli.json.orig"
    rm -f .cursor/cli.json   # write a regular file, never through a symlink
  fi
  # Restore on exit too, so a termination signal cannot leave the deny config behind.
  trap "cursor_restore_config '$d' '$had'" EXIT
  trap 'exit 143' TERM INT
  cat > .cursor/cli.json <<'JSON'
{"permissions":{"allow":["Read(**)","Shell(git)","Shell(node)"],"deny":["Write(**)","Shell(gh)","Shell(curl)","Shell(wget)"]}}
JSON
  printf '%s' "$PROMPT" | env -u GH_TOKEN -u GITHUB_TOKEN CURSOR_API_KEY="$KEY" \
    agent -p --trust --output-format json --mode ask ${MODEL:+--model "$MODEL"} > "$d/out" 2> "$d/err"
  status=$?
  cursor_restore_config "$d" "$had"
  trap - EXIT TERM INT
  # A good run prints the claude-style envelope ({is_error, result, ...}).
  if [ "$status" -eq 0 ] && jq -e '.is_error == false' "$d/out" > /dev/null 2>&1; then
    jq --arg k "$KEY" '. + {auth_failed: false, key_exhausted: false} | .result |= (split($k) | join("***"))' "$d/out" > "$RESULT"
  else
    # Anything else: keep the last lines of output and stderr, minus colour codes and the key.
    # After real turns the text may be the agent quoting an error, so it is not classified.
    had_turns=false
    if jq -e '(.num_turns // 0) > 1' "$d/out" > /dev/null 2>&1; then had_turns=true; fi
    { cat "$d/out"; cat "$d/err"; } | sed $'s/\x1b\\[[0-9;]*m//g' | tail -n 20 \
      | jq -Rs --arg k "$KEY" --argjson real "$had_turns" '{is_error: true,
          result: ((split($k) | join("***")) | if . == "" then "agent produced no output" else . end),
          auth_failed: (($real | not) and test("API key is invalid|invalid API key|not logged in|not authenticated|Authentication required"; "i")),
          key_exhausted: (($real | not) and test("usage limit|out of credits|quota (exceeded|exhausted)"; "i"))}' > "$RESULT"
    [ "$status" -ne 0 ] || status=1
  fi
  return "$status"
}
