#!/usr/bin/env bash
# Checks the pr-update action's scripts with a fake `gh` and a fake `pr-update`
# on PATH: nothing touches GitHub or npm, so it needs no network and no
# secrets. Needs bash 3.2+ and jq. Each case names what the run must do.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
failures=0
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

pass() { echo "ok   $1"; }
fail() { echo "FAIL $1"; shift; printf '     %s\n' "$@"; failures=$((failures + 1)); }
has() { # name, file, substring
  if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1: expected '$3' in" "$(sed 's/^/     /' "$2")"; fi
}
lacks() { # name, file, substring
  if grep -qF -- "$3" "$2"; then fail "$1: unexpected '$3' in" "$(sed 's/^/     /' "$2")"; else pass "$1"; fi
}

# ---- fixtures -------------------------------------------------------------

cat >"$work/prs.json" <<'EOF'
[
 {"number":101,"state":"OPEN","isDraft":false,"isCrossRepository":false,"labels":[]},
 {"number":102,"state":"OPEN","isDraft":true,"isCrossRepository":false,"labels":[]},
 {"number":103,"state":"OPEN","isDraft":false,"isCrossRepository":true,"labels":[]},
 {"number":104,"state":"OPEN","isDraft":false,"isCrossRepository":false,"labels":[{"name":"no-auto-update"}]},
 {"number":105,"state":"OPEN","isDraft":false,"isCrossRepository":false,"labels":[{"name":"needs-manual-update"}]},
 {"number":106,"state":"OPEN","isDraft":false,"isCrossRepository":false,"labels":[]}
]
EOF

# Shaped like `pr-update update --report`: see update.ts (output, toResult).
cat >"$work/report.json" <<'EOF'
{
 "applied": true,
 "results": [
  {"number":101,"head":"feat/a","base":"main","strategy":"merge","status":"updated","pushed":true,"detail":"updated (resolved 2)"},
  {"number":105,"head":"feat/e","base":"main","strategy":"merge","status":"updated","pushed":true,"detail":"updated (repaired conflict)","repaired":[{"kind":"conflict","note":"kept both imports"}]},
  {"number":106,"head":"feat/f","base":"main","strategy":"merge","status":"conflict","pushed":false,"detail":"needs a human: src/x.ts (no resolver claims it)","conflicts":[{"path":"src/x.ts","why":"no resolver claims it"}]}
 ],
 "skipped": [
  {"number":102,"head":"feat/b","reason":"already up to date"},
  {"number":107,"head":"feat/g","reason":"blocked on #101"},
  {"number":108,"head":"feat/h","reason":"failed 1 time(s) at this head and base; waiting for either to move"}
 ],
 "counts": {"updated":2,"upToDate":0,"conflict":1,"failed":0,"skipped":3}
}
EOF

cat >"$work/bin/gh" <<'EOF'
#!/usr/bin/env bash
# Fake gh: reads come from fixtures, writes are logged.
echo "gh $*" >>"$FAKE_LOG"
case "$1 $2" in
  "pr list") cat "$FAKE_PRS" ;;
  "pr view")
    n="$3"
    if [[ "$*" == *headRefOid* ]]; then
      echo '{"headRefOid":"aaaaaaaaaaaa1111","baseRefName":"main","comments":'"${FAKE_COMMENTS:-[]}"'}'
    else
      jq -c --argjson n "$n" '.[] | select(.number == $n)' "$FAKE_PRS"
    fi ;;
  "api repos"*) echo "bbbbbbbbbbbb2222" ;;
  *) ;;
esac
EOF
cat >"$work/bin/fake-pr-update" <<'EOF'
#!/usr/bin/env bash
echo "pr-update $*" >>"$FAKE_LOG"
echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-<unset>} PR_UPDATE_CONFIG=${PR_UPDATE_CONFIG:-<unset>}" >>"$FAKE_LOG"
prev=""
for a in "$@"; do
  [ "$prev" = --report ] && cp "$FAKE_REPORT" "$a"
  prev="$a"
done
exit "${FAKE_EXIT:-0}"
EOF
chmod +x "$work/bin/gh" "$work/bin/fake-pr-update"

# run_action name, then env assignments. Leaves $log, $summary, $out, $code.
run_action() {
  local name="$1"
  shift
  log="$work/$name.log"; summary="$work/$name.summary"; out="$work/$name.out"
  rm -rf "$work/tmp-$name"
  : >"$log"; : >"$summary"; : >"$out"
  env -i PATH="$work/bin:$PATH" HOME="$HOME" \
    FAKE_LOG="$log" FAKE_PRS="$work/prs.json" FAKE_REPORT="$work/report.json" \
    RUNNER_TEMP="$work/tmp-$name" GITHUB_STEP_SUMMARY="$summary" GITHUB_OUTPUT="$out" \
    GITHUB_SERVER_URL=https://github.com RUN_URL=https://github.com/o/r/actions/runs/1 \
    REPO=o/r PR_UPDATE_CMD="$work/bin/fake-pr-update" "$@" \
    bash "$here/run.sh" >"$work/$name.stdout" 2>&1
  code=$?
}
cmdline() { grep '^pr-update ' "$1"; }

# ---- filtering ------------------------------------------------------------

run_action filter SKIP_LABEL=no-auto-update CONFLICT_LABEL=needs-manual-update \
  INCLUDE_DRAFTS=true REPAIR_AGENT=claude ANTHROPIC_API_KEY=sk-test FAKE_EXIT=1
c="$(cmdline "$log")"
for n in 101 102 105 106; do
  [[ "$c" == *"--pr $n"* ]] && pass "eligible PR $n is passed" || fail "eligible PR $n is passed: $c"
done
[[ "$c" != *"--pr 103"* ]] && pass "fork PR 103 is excluded" || fail "fork PR 103 is excluded: $c"
[[ "$c" != *"--pr 104"* ]] && pass "labelled PR 104 is excluded" || fail "labelled PR 104 is excluded: $c"
[[ "$c" == *"--pr 102"* && "$c" != *"-drafts"* ]] && pass "drafts are included, with no drafts flag" || fail "drafts are included: $c"
[[ "$c" == *"--trust"* && "$c" == *"--apply"* && "$c" == *"--strategy merge"* ]] && pass "trust, apply and merge" || fail "trust, apply and merge: $c"
[[ "$c" == *"--repair-agent claude"* ]] && pass "key given: repair-agent claude" || fail "repair-agent claude: $c"
has "repair timeout goes in a config file" "$log" "PR_UPDATE_CONFIG=$work/tmp-filter/pr-update-action/pr-update.yaml"
has "timeout value written" "$work/tmp-filter/pr-update-action/pr-update.yaml" "timeout_seconds: 600"

run_action nodrafts SKIP_LABEL=no-auto-update INCLUDE_DRAFTS=false
c="$(cmdline "$log")"
[[ "$c" != *"--pr 102"* && "$c" != *"-drafts"* ]] && pass "include-drafts=false drops draft 102" || fail "include-drafts=false: $c"

run_action nokey SKIP_LABEL=no-auto-update REPAIR_AGENT=
c="$(cmdline "$log")"
[[ "$c" != *"--repair-agent"* ]] && pass "no repair agent: no --repair-agent flag" || fail "no repair agent: $c"
has "no key: key not exported" "$log" "ANTHROPIC_API_KEY=<unset>"

run_action extra SKIP_LABEL= EXTRA_ARGS="--retry-failed"
c="$(cmdline "$log")"
[[ "$c" == *"--pr 104"* && "$c" == *"--retry-failed"* ]] && pass "empty skip-label excludes nothing; extra-args passed" || fail "extra-args: $c"

# ---- one PR by number -----------------------------------------------------

run_action single SKIP_LABEL=no-auto-update INCLUDE_DRAFTS=false PR_NUMBER=104 CONFLICT_LABEL=needs-manual-update
c="$(cmdline "$log")"
[[ "$c" == *"--pr 104"* && "$c" != *"--pr 101"* ]] && pass "a PR named by number ignores the skip label" || fail "single: $c"
has "single: reply comment posted" "$log" "gh pr comment 104 --repo o/r --body-file"

run_action single_fork PR_NUMBER=103
[ -z "$(cmdline "$log")" ] && pass "a named fork PR is still refused (pr-update not run)" || fail "single fork ran pr-update"
has "single fork: reply says why" "$log" "gh pr comment 103"

# ---- exit codes -----------------------------------------------------------

run_action exit1 FAKE_EXIT=1
[ "$code" -eq 0 ] && pass "exit 1 with a report (conflict) does not fail the step" || fail "exit 1 with a report: code $code"
has "exit 1 warns" "$work/exit1.stdout" "::warning::"

run_action exit1strict FAKE_EXIT=1 FAIL_ON_CONFLICT=true
[ "$code" -eq 1 ] && pass "fail-on-conflict fails on exit 1" || fail "fail-on-conflict: code $code"

run_action exit22 FAKE_EXIT=22
[ "$code" -eq 22 ] && pass "exit 22 (missing tool) fails with 22" || fail "exit 22: code $code"

echo '{"error":"boom"}' >"$work/error.json"
run_action errreport FAKE_EXIT=1 FAKE_REPORT="$work/error.json"
[ "$code" -eq 1 ] && has "an error report fails the step" "$work/errreport.stdout" "::error::pr-update failed: boom" || fail "error report: code $code"

run_action ok FAKE_EXIT=0 SKIP_LABEL=no-auto-update
[ "$code" -eq 0 ] && pass "exit 0 passes" || fail "exit 0: code $code"
has "outputs: updated" "$out" "updated=2"
has "outputs: conflict" "$out" "conflict=1"
has "outputs: excluded" "$out" "excluded=2"

# Everything excluded: pr-update must not run (no --pr would mean all PRs).
echo '[{"number":1,"state":"OPEN","isDraft":false,"isCrossRepository":true,"labels":[]}]' >"$work/prs-none.json"
run_action none FAKE_PRS="$work/prs-none.json"
log="$work/none.log"
[ -z "$(cmdline "$log")" ] && [ "$code" -eq 0 ] && pass "no eligible PR: pr-update not run, exit 0" || fail "no eligible PR: code $code, $(cmdline "$log")"

# ---- summary --------------------------------------------------------------

run_action sum SKIP_LABEL=no-auto-update FAKE_EXIT=1
has "summary: updated row with link" "$summary" "[#101](https://github.com/o/r/pull/101)"
has "summary: repaired status" "$summary" "| repaired |"
has "summary: conflict path" "$summary" "Conflicts: src/x.ts"
has "summary: up-to-date" "$summary" "| up-to-date |"
has "summary: blocked" "$summary" "| blocked |"
has "summary: failed before" "$summary" "| skipped (failed before) |"
has "summary: counts" "$summary" "updated 2, up to date 0, conflict 1, failed 0, skipped 3"
has "summary: exclusions" "$summary" "[#103](https://github.com/o/r/pull/103): from a fork"
has "summary: label exclusion" "$summary" "[#104](https://github.com/o/r/pull/104): label no-auto-update"

# ---- labels and comments --------------------------------------------------

run_action ann SKIP_LABEL=no-auto-update CONFLICT_LABEL=needs-manual-update FAKE_EXIT=1
has "label created" "$log" "gh label create needs-manual-update --repo o/r --force"
has "conflict PR gets the label" "$log" "gh pr edit 106 --repo o/r --add-label needs-manual-update"
has "conflict PR gets a comment" "$log" "gh pr comment 106 --repo o/r --body-file"
has "updated PR loses the label" "$log" "gh pr edit 105 --repo o/r --remove-label needs-manual-update"
lacks "a PR without the label is not touched" "$log" "gh pr edit 101"
body="$work/tmp-ann/pr-update-action/comment-106.md"
has "comment names the path" "$body" "src/x.ts"
has "comment carries the marker" "$body" "<!-- pr-update: conflict head=aaaaaaaaaaaa1111 base=bbbbbbbbbbbb2222 -->"

run_action dedupe SKIP_LABEL=no-auto-update CONFLICT_LABEL=needs-manual-update FAKE_EXIT=1 \
  FAKE_COMMENTS='[{"body":"x\n<!-- pr-update: conflict head=aaaaaaaaaaaa1111 base=bbbbbbbbbbbb2222 -->"}]'
lacks "same head and base: not commented again" "$log" "gh pr comment 106"

run_action dry SKIP_LABEL=no-auto-update CONFLICT_LABEL=needs-manual-update APPLY=false FAKE_EXIT=1
lacks "dry run: no label or comment" "$log" "gh pr comment"
lacks "dry run: no --apply" "$log" "--apply"

# The reply for one PR: what happened, the marker.
run_action reply PR_NUMBER=106 SKIP_LABEL= CONFLICT_LABEL=needs-manual-update REPAIR_AGENT=claude FAKE_EXIT=1
reply="$work/tmp-reply/pr-update-action/reply-106.md"
has "reply: conflict headline" "$reply" "Conflict: merging \`main\` into \`feat/f\` needs a person"
has "reply: unresolved path" "$reply" "Unresolved: \`src/x.ts\`"
has "reply: run link" "$reply" "[Run log](https://github.com/o/r/actions/runs/1)"
has "reply: marker" "$reply" "<!-- pr-update: conflict head=aaaaaaaaaaaa1111 -->"
PR_NUMBER=101 PR_HEAD_SHA=cafef00dcafef00d PR_BASE_SHA=0123456789ab PR_BASE_NAME=main REPAIR_AGENT=claude REPO=o/r \
  "$here/render-summary.sh" "$work/report.json" >"$work/r101.md"
has "reply: updated headline" "$work/r101.md" "Merged \`main\` (\`0123456\`) into \`feat/a\`; the branch is now at \`cafef00\`."
has "reply: resolvers" "$work/r101.md" "cleared 2 conflicted path(s)"
has "reply: done marker" "$work/r101.md" "<!-- pr-update: done head=cafef00dcafef00d -->"
PR_NUMBER=105 PR_HEAD_SHA=abc REPAIR_AGENT=claude "$here/render-summary.sh" "$work/report.json" >"$work/r105.md"
has "reply: repair note" "$work/r105.md" "repair ran for a conflict: kept both imports"
PR_NUMBER=107 PR_HEAD_SHA=abc "$here/render-summary.sh" "$work/report.json" >"$work/r107.md"
has "reply: blocked by parent" "$work/r107.md" "its parent PR #101 is behind"
PR_NUMBER=108 PR_HEAD_SHA=abc "$here/render-summary.sh" "$work/report.json" >"$work/r108.md"
has "reply: skipped reason" "$work/r108.md" "Skipped: failed 1 time(s)"

# ---- script hygiene -------------------------------------------------------

for f in run.sh select-prs.sh render-summary.sh annotate.sh test-dry-run.sh; do
  if bash -n "$here/$f"; then pass "bash -n $f"; else fail "bash -n $f"; fi
done
if command -v shellcheck >/dev/null; then
  if shellcheck "$here"/*.sh; then pass "shellcheck"; else fail "shellcheck"; fi
else
  echo "skip shellcheck (not installed)"
fi

[ "$failures" -eq 0 ] || { echo "$failures case(s) failed"; exit 1; }
echo "all passed"
