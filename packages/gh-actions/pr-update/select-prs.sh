#!/usr/bin/env bash
# Decides which open PRs of $REPO pr-update may touch.
# Writes these files in $OUT_DIR:
#   eligible.txt  PR numbers, one per line
#   excluded.tsv  number<TAB>reason, for the summary
#   labeled.txt   numbers that carry $CONFLICT_LABEL
# A PR is excluded when it is from a fork (the token cannot push there), is a
# draft and $INCLUDE_DRAFTS is not true, or carries $SKIP_LABEL.
# With $PR_NUMBER set only that PR is looked at, and the skip label and the
# draft setting do not apply: asking for a PR by number overrides them.
set -euo pipefail

: "${REPO:?REPO is required}"
: "${OUT_DIR:?OUT_DIR is required}"
SKIP_LABEL="${SKIP_LABEL:-}"
CONFLICT_LABEL="${CONFLICT_LABEL:-}"
INCLUDE_DRAFTS="${INCLUDE_DRAFTS:-true}"
PR_NUMBER="${PR_NUMBER:-}"
LIMIT="${LIMIT:-200}"

mkdir -p "$OUT_DIR"

if [ -n "$PR_NUMBER" ]; then
  [[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "pr-update: pr must be a number, not '$PR_NUMBER'" >&2; exit 1; }
  one="$(gh pr view "$PR_NUMBER" --repo "$REPO" --json number,state,isDraft,isCrossRepository,labels)"
  prs="$(jq -c 'if .state == "OPEN" then [del(.state)] else [] end' <<<"$one")"
  if [ "$prs" = "[]" ]; then
    printf '%s\tnot an open PR\n' "$PR_NUMBER" >"$OUT_DIR/excluded.tsv"
    : >"$OUT_DIR/eligible.txt"
    : >"$OUT_DIR/labeled.txt"
    exit 0
  fi
  SKIP_LABEL=""
  INCLUDE_DRAFTS=true
else
  prs="$(gh pr list --repo "$REPO" --state open --limit "$LIMIT" \
    --json number,isDraft,isCrossRepository,labels)"
  if [ "$(jq 'length' <<<"$prs")" -ge "$LIMIT" ]; then
    echo "::warning::$LIMIT open PRs listed; any beyond that are not updated"
  fi
fi

# One reason per PR, the first that applies. Empty reason means eligible.
jq -r --arg label "$SKIP_LABEL" --arg drafts "$INCLUDE_DRAFTS" '
  .[]
  | { number,
      reason: (
        if .isCrossRepository then "from a fork; the token cannot push to it"
        elif ($drafts != "true" and .isDraft) then "draft"
        elif ($label != "" and ([.labels[].name] | index($label))) then "label " + $label
        else "" end) }
  | "\(.number)\t\(.reason)"' <<<"$prs" |
  sort -n >"$OUT_DIR/all.tsv"

: >"$OUT_DIR/eligible.txt"
: >"$OUT_DIR/excluded.tsv"
while IFS=$'\t' read -r number reason; do
  [ -n "$number" ] || continue
  if [ -z "$reason" ]; then
    echo "$number" >>"$OUT_DIR/eligible.txt"
  else
    printf '%s\t%s\n' "$number" "$reason" >>"$OUT_DIR/excluded.tsv"
  fi
done <"$OUT_DIR/all.tsv"

if [ -n "$CONFLICT_LABEL" ]; then
  jq -r --arg l "$CONFLICT_LABEL" '.[] | select([.labels[].name] | index($l)) | .number' <<<"$prs" >"$OUT_DIR/labeled.txt"
else
  : >"$OUT_DIR/labeled.txt"
fi
