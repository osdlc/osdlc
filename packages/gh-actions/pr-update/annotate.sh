#!/usr/bin/env bash
# After a run, makes the outcome visible on the PRs themselves.
#  - A PR that ended conflict or failed gets $CONFLICT_LABEL and, once per
#    (head sha, base sha), a comment with the reason and the marker
#    <!-- pr-update: conflict head=<sha> base=<sha> -->.
#  - A PR that ended updated through the repair agent (a non-empty `repaired`
#    list; resolvers, rerere and generators never add to it) gets, once per
#    merge commit, a comment with the repaired files, the agent's note and the
#    resolution (git show --remerge-diff), ending
#    <!-- pr-update: repaired head=<sha> -->. Other updates stay silent.
#  - A PR that ended updated or up-to-date loses $CONFLICT_LABEL.
#  - With $PR_NUMBER (an explicit request for one PR) the PR gets the full
#    summary comment instead of the conflict comment.
# Does nothing when $APPLY is not true. DRY_RUN=1 prints each write.
# Reads $REPORT, $EXCLUDED (excluded.tsv) and $LABELED (labeled.txt).
set -euo pipefail

: "${REPO:?REPO is required}"
: "${REPORT:?REPORT is required}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXCLUDED="${EXCLUDED:-/dev/null}"
LABELED="${LABELED:-/dev/null}"
CONFLICT_LABEL="${CONFLICT_LABEL:-}"
COMMENT_CONFLICTS="${COMMENT_CONFLICTS:-true}"
PR_NUMBER="${PR_NUMBER:-}"
APPLY="${APPLY:-true}"
DRY_RUN="${DRY_RUN:-}"
tmp="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/pr-update-action"

[ "$APPLY" = true ] || exit 0
errored=""
if jq -e 'has("error")' "$REPORT" >/dev/null; then errored=1; fi

write() { # a gh call that changes something
  if [ "$DRY_RUN" = 1 ]; then
    printf '+ gh'
    printf ' %q' "$@"
    printf '\n'
  else
    gh "$@"
  fi
}

label_ready=""
ensure_label() {
  [ -n "$label_ready" ] || {
    write label create "$CONFLICT_LABEL" --repo "$REPO" --force \
      --color B60205 --description "pr-update could not bring this branch up to date"
    label_ready=1
  }
}

pr_facts() { # number -> sets head base_name base_sha, and bodies file
  local n="$1" json
  json="$(gh pr view "$n" --repo "$REPO" --json headRefOid,baseRefName,comments)"
  head="$(jq -r '.headRefOid' <<<"$json")"
  base_name="$(jq -r '.baseRefName' <<<"$json")"
  jq -r '.comments[].body' <<<"$json" >"$tmp/comments-$n.txt"
  base_sha="$(gh api "repos/$REPO/branches/$base_name" -q .commit.sha)"
}

REMERGE_LINES=300
comment_repair() { # number: the PR just pushed a merge the repair agent fixed
  local n="$1" marker body base7 url files diff headname
  pr_facts "$n"
  marker="<!-- pr-update: repaired head=$head -->"
  if grep -qxF "$marker" "$tmp/comments-$n.txt"; then
    echo "pr-update: #$n already has a repair comment for this merge"
    return
  fi
  git cat-file -e "$head^{commit}" 2>/dev/null || git fetch --quiet origin "$head" 2>/dev/null || true
  base7="$(git rev-parse --short=7 "$head^2" 2>/dev/null || echo "${base_sha:0:7}")"
  url="${GITHUB_SERVER_URL:-https://github.com}/$REPO/commit/$head"
  headname="$(jq -r -L "$here" --argjson n "$n" 'include "rows"; rows[] | select(.number == $n) | .head' "$REPORT")"
  body="$tmp/repair-$n.md"
  files="$(git show --remerge-diff --format= --name-only "$head" 2>/dev/null || true)"
  {
    echo "**pr-update** merged \`$base_name\` (\`$base7\`) into \`$headname\` and repaired a conflict. Merge commit: [\`${head:0:7}\`]($url)."
    echo
    if [ -n "$files" ]; then
      echo "Repaired files:"
      sed 's/.*/- `&`/' <<<"$files"
      echo
    fi
    jq -r -L "$here" --argjson n "$n" 'include "rows"; rows[] | select(.number == $n) | .repaired[] | "Agent note (\(.kind)): \(.note)"' "$REPORT"
    echo
    echo "<details><summary>Resolution</summary>"
    echo
    echo '```diff'
    if diff="$(git show --remerge-diff --format= "$head" 2>/dev/null)" && [ -n "$diff" ]; then
      head -n "$REMERGE_LINES" <<<"$diff"
      if [ "$(wc -l <<<"$diff")" -gt "$REMERGE_LINES" ]; then
        echo "... truncated to $REMERGE_LINES lines; see the merge commit for the rest"
      fi
    else
      git show --stat --format= "$head" 2>/dev/null || echo "(resolution not available in this checkout)"
    fi
    echo '```'
    echo
    echo "</details>"
    echo
    echo "$marker"
  } >"$body"
  write pr comment "$n" --repo "$REPO" --body-file "$body"
}

while IFS=$'\t' read -r n outcome; do
  [ -n "$n" ] || continue
  case "$outcome" in
    conflict | failed)
      [ -n "$CONFLICT_LABEL" ] || [ "$COMMENT_CONFLICTS" = true ] || continue
      if [ -n "$CONFLICT_LABEL" ]; then
        ensure_label
        write pr edit "$n" --repo "$REPO" --add-label "$CONFLICT_LABEL"
      fi
      if [ "$COMMENT_CONFLICTS" = true ] && [ "$n" != "$PR_NUMBER" ]; then
        pr_facts "$n"
        marker_tail="head=$head base=$base_sha -->"
        if grep -F "<!-- pr-update: " "$tmp/comments-$n.txt" | grep -qF "$marker_tail"; then
          echo "pr-update: #$n already has a comment for this head and base"
        else
          body="$tmp/comment-$n.md"
          {
            echo "**pr-update** could not bring this branch up to date with \`$base_name\` ($outcome)."
            echo
            jq -r -L "$here" --argjson n "$n" 'include "rows"; rows[] | select(.number == $n)
              | (.conflicts[] | "- `\(.path)`: \(.why)"), (if (.conflicts | length) == 0 then "- \(.detail)" else empty end)' "$REPORT"
            echo
            echo "It will not be retried until its head or \`$base_name\` moves. Update it by hand, or comment \`/pr-update retry\` to try again now."
            [ -z "${RUN_URL:-}" ] || echo "[Run log]($RUN_URL)"
            echo
            echo "<!-- pr-update: $outcome head=$head base=$base_sha -->"
          } >"$body"
          write pr comment "$n" --repo "$REPO" --body-file "$body"
        fi
      fi
      ;;
    updated | up-to-date)
      if [ "$outcome" = updated ] && [ "$COMMENT_CONFLICTS" = true ] && [ "$n" != "$PR_NUMBER" ] &&
        jq -e -L "$here" --argjson n "$n" 'include "rows"; rows[] | select(.number == $n and .pushed and (.repaired | length) > 0)' "$REPORT" >/dev/null; then
        comment_repair "$n"
      fi
      if [ -n "$CONFLICT_LABEL" ] && grep -qx "$n" "$LABELED"; then
        write pr edit "$n" --repo "$REPO" --remove-label "$CONFLICT_LABEL"
      fi
      ;;
  esac
done < <([ -n "$errored" ] || jq -r -L "$here" 'include "rows"; rows[] | select(.pushed or .outcome != "updated") | "\(.number)\t\(.outcome)"' "$REPORT")

if [ -n "$PR_NUMBER" ]; then
  pr_facts "$PR_NUMBER"
  body="$tmp/reply-$PR_NUMBER.md"
  PR_HEAD_SHA="$head" PR_BASE_SHA="$base_sha" PR_BASE_NAME="$base_name" \
    "$here/render-summary.sh" "$REPORT" "$EXCLUDED" >"$body"
  write pr comment "$PR_NUMBER" --repo "$REPO" --body-file "$body"
fi
