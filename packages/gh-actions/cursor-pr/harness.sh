# Sourced by pr-common/ask.sh. Runs `agent -p` (Cursor CLI) once with $KEY.
#
# Auth: CURSOR_API_KEY. A bad key exits 1 with plain text, not JSON ("The API
# key is invalid"), which is what harness_auth_failed looks for.
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

# Skill mode: Cursor has no plugin install either, so the skill's SKILL.md is
# found on disk and inlined. harness_skill_resolve prints its path, or where it
# looked and returns 1 (the comment then says the skill was not found).
cursor_skill_dirs() { # plugin ("" for a bare skill name)
  local pack packs
  echo "$PWD/.cursor/skills"
  echo "${HOME:-/root}/.cursor/skills"
  packs="$(cd "$GITHUB_ACTION_PATH/../../../.cursor-plugin/packs" 2> /dev/null && pwd)"
  if [ -n "$1" ]; then
    echo "$packs/$1/skills"
  else
    for pack in "$packs"/*; do echo "$pack/skills"; done
  fi
}

harness_skill_resolve() {
  local name="${1#*:}" plugin="" dir tried=""
  case "$1" in *:*) plugin="${1%%:*}" ;; esac
  while IFS= read -r dir; do
    if [ -f "$dir/$name/SKILL.md" ]; then echo "$dir/$name/SKILL.md"; return 0; fi
    tried="$tried
- $dir/$name/SKILL.md"
  done < <(cursor_skill_dirs "$plugin")
  echo "The skill /$1 was not found. Looked in:$tried"
  return 1
}

harness_skill_ref() {
  echo "the $1 skill"
}

harness_skill_invocation() {
  echo "Run the $1 skill, whose full text follows this message${2:+, with the arguments: $2}."
}

harness_skill_suffix() {
  echo "The $(basename "$(dirname "$SKILL_FILE")") skill follows. Its folder is $(dirname "$SKILL_FILE"); read other files it refers to from there."
  echo "Run node scripts only with the node command."
  echo
  echo "-----"
  cat "$SKILL_FILE"
}

harness_limits() {
  if [ "$1" = 1 ]; then
    echo "gh, curl and wget are denied; file writes are allowed; the job's timeout."
  else
    echo "ask mode; writes, gh, curl and wget are denied; the job's timeout."
  fi
}

cursor_restore_config() {
  rm -f .cursor/cli.json
  if [ "$2" = 1 ]; then cp -P "$1/cli.json.orig" .cursor/cli.json; fi
}

harness_run() {
  local d="${RUNNER_TEMP:-/tmp}/cursor-pr-run" status had=0 mode
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
  # --apply ($APPLY=1): writes allowed, so no ask mode; --force lets the agent
  # use the allowed tools without a prompt nobody could answer. The deny list still wins.
  mode=(--mode ask)
  if [ "${APPLY:-0}" = 1 ]; then
    mode=(--force)
    cat > .cursor/cli.json <<'JSON'
{"permissions":{"allow":["Read(**)","Write(**)","Shell(git)","Shell(node)"],"deny":["Shell(gh)","Shell(curl)","Shell(wget)"]}}
JSON
  else
    cat > .cursor/cli.json <<'JSON'
{"permissions":{"allow":["Read(**)","Shell(git)","Shell(node)"],"deny":["Write(**)","Shell(gh)","Shell(curl)","Shell(wget)"]}}
JSON
  fi
  printf '%s' "$PROMPT" | env -u GH_TOKEN -u GITHUB_TOKEN CURSOR_API_KEY="$KEY" \
    agent -p --trust --output-format json "${mode[@]}" ${MODEL:+--model "$MODEL"} > "$d/out" 2> "$d/err"
  status=$?
  cursor_restore_config "$d" "$had"
  trap - EXIT TERM INT
  # A good run prints the claude-style envelope ({is_error, result, ...}).
  if [ "$status" -eq 0 ] && jq -e '.is_error == false' "$d/out" > /dev/null 2>&1; then
    jq --arg k "$KEY" '. + {auth_failed: false} | .result |= (split($k) | join("***"))' "$d/out" > "$RESULT"
  else
    # Anything else: keep the last lines of output and stderr, minus colour codes and the key.
    { cat "$d/out"; cat "$d/err"; } | sed $'s/\x1b\\[[0-9;]*m//g' | tail -n 20 \
      | jq -Rs --arg k "$KEY" '{is_error: true,
          result: ((split($k) | join("***")) | if . == "" then "agent produced no output" else . end),
          auth_failed: test("API key is invalid|invalid API key|not logged in|not authenticated|Authentication required"; "i")}' > "$RESULT"
    [ "$status" -ne 0 ] || status=1
  fi
  return "$status"
}
