#!/usr/bin/env bash
# Renders a pr-update report as Markdown on stdout.
#   render-summary.sh <report.json> [excluded.tsv]
# With $PR_NUMBER set it renders the comment for that one PR instead of the
# table, ending in the hidden marker <!-- pr-update: done|conflict|failed head=<sha> -->.
# Env: REPO (owner/name, for links), GITHUB_SERVER_URL, and for the comment
# PR_HEAD_SHA, PR_BASE_SHA, PR_BASE_NAME, RUN_URL, REPAIR_AGENT.
set -euo pipefail

report="${1:?usage: render-summary.sh report.json [excluded.tsv]}"
excluded="${2:-}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
server="${GITHUB_SERVER_URL:-https://github.com}"
repo="${REPO:-}"
pr="${PR_NUMBER:-}"

if jq -e 'has("error")' "$report" >/dev/null; then
  if [ -n "$pr" ]; then
    echo "**pr-update** could not run: $(jq -r '.error' "$report")"
    [ -z "${RUN_URL:-}" ] || echo "[Run log]($RUN_URL)"
    echo
    echo "<!-- pr-update: failed head=${PR_HEAD_SHA:-unknown} -->"
  else
    echo "## pr-update"
    echo
    echo "The run failed: $(jq -r '.error' "$report")"
  fi
  exit 0
fi

if [ -n "$pr" ]; then
  row="$(jq -c -L "$here" --argjson n "$pr" 'include "rows"; rows | map(select(.number == $n)) | .[0] // null' "$report")"
  if [ "$row" = null ]; then
    reason="not updated"
    if [ -n "$excluded" ] && [ -s "$excluded" ]; then
      reason="$(awk -F'\t' -v n="$pr" '$1 == n { print $2 }' "$excluded" | head -1)"
    fi
    echo "**pr-update** did not update this PR: ${reason:-not updated}."
    [ -z "${RUN_URL:-}" ] || echo "[Run log]($RUN_URL)"
    echo
    echo "<!-- pr-update: done head=${PR_HEAD_SHA:-unknown} -->"
    exit 0
  fi
  short() { printf '%s' "${1:0:7}"; }
  head_sha="${PR_HEAD_SHA:-unknown}"
  base_name="${PR_BASE_NAME:-the base branch}"
  agent="${REPAIR_AGENT:-the}"
  jq -r --arg head "$(short "$head_sha")" --arg base "$base_name" --arg basesha "$(short "${PR_BASE_SHA:-}")" \
    --arg agent "$agent" '
    def tick: "`" + . + "`";
    (if .outcome == "updated" and .pushed then
        ((if .strategy == "rebase" then "Rebased onto " else "Merged " end) + (($base | tick) + (if $basesha != "" then " (" + ($basesha | tick) + ")" else "" end))
         + (if .strategy == "rebase" then "" else " into " + (.head | tick) end)
         + "; the branch is now at " + ($head | tick) + ".")
      elif .outcome == "updated" then "Would update `\(.head)` (dry run, nothing pushed)."
      elif .outcome == "up-to-date" then "Already up to date with \($base | tick); nothing to do."
      elif .outcome == "conflict" then "Conflict: merging \($base | tick) into \(.head | tick) needs a person. Nothing was pushed."
      elif .outcome == "failed" then "Failed: \(.detail). Nothing was pushed."
      elif .outcome == "blocked" then
        (if .blockedBy then "Blocked: its parent PR #\(.blockedBy) is behind and is updated first." else "Blocked: its parent PR is behind and is updated first." end)
      else "Skipped: \(.detail)." end),
    (if .strategyFallback then "- The rebase stopped (\(.strategyFallback)); it was retried as a merge." else empty end),
    (if (.detail | test("resolved [0-9]+")) then
       "- Automatic resolvers (rerere, lockfile rule, project resolvers) cleared \(.detail | capture("resolved (?<n>[0-9]+)") | .n) conflicted path(s)."
     else empty end),
    (.repaired[] | "- The \($agent) repair ran for a \(.kind): \(.note)"),
    (.conflicts[] | "- Unresolved: `\(.path)` - \(.why)")' <<<"$row"
  echo
  [ -z "${RUN_URL:-}" ] || echo "[Run log]($RUN_URL)"
  echo
  kind="$(jq -r 'if .outcome == "conflict" then "conflict" elif .outcome == "failed" then "failed" else "done" end' <<<"$row")"
  echo "<!-- pr-update: $kind head=$head_sha -->"
  exit 0
fi

echo "## pr-update"
echo

jq -r -L "$here" --arg base "$server/$repo/pull" 'include "rows";
  def cell: gsub("\\|"; "\\|") | gsub("\n"; " ");
  (if .applied then "" else "Dry run: nothing was pushed.\n\n" end),
  "| PR | Branch | Result | Detail |",
  "| --- | --- | --- | --- |",
  ( rows[] | . as $r
    | ($r.detail
       + (if $r.strategyFallback then " (fell back to merge: " + $r.strategyFallback + ")" else "" end)
       + (if ($r.conflicts | length) > 0 then " Conflicts: " + ([$r.conflicts[].path] | join(", ")) else "" end)
       + (if ($r.repaired | length) > 0 then " Repaired: " + ([$r.repaired[].note] | join("; ")) else "" end)) as $detail
    | "| [#\($r.number)](\($base)/\($r.number)) | `\($r.head)` | \($r.status) | \($detail | cell) |" ),
  "",
  "updated \(.counts.updated), up to date \(.counts.upToDate), conflict \(.counts.conflict), failed \(.counts.failed), skipped \(.counts.skipped)"
' "$report"

# pr-update 0.10 records a listing failure on its `repos` entry; earlier
# versions listed it under `repoFailures`.
failed_repos='def failed: (.repoFailures // []) + [(.repos // [])[] | select(.failure) | {repo, message: .failure.message}];'
if jq -e "$failed_repos"' failed | length > 0' "$report" >/dev/null; then
  echo
  jq -r "$failed_repos"' failed[] | "- repository \(.repo) could not be listed: \(.message)"' "$report"
fi

if [ -n "$excluded" ] && [ -s "$excluded" ]; then
  echo
  echo "### Excluded before the run"
  echo
  while IFS=$'\t' read -r number reason; do
    echo "- [#$number]($server/$repo/pull/$number): $reason"
  done <"$excluded"
fi
