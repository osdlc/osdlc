#!/usr/bin/env bash
# Runs `pr-update update` over the open PRs that select-prs.sh lets through,
# writes the job summary and the step outputs, labels and comments on the PRs
# (annotate.sh), and turns pr-update's exit code into this step's.
# DRY_RUN=1 prints the pr-update command instead of running it.
# PR_UPDATE_CMD replaces `npx @osdlc/pr-update@<version>`, for tests.
#
# Exit policy: pr-update exits 1 when a PR ended conflict or failed. That is the
# normal outcome of a conflicted PR, so with a readable report it is a warning
# and this script exits 0, unless FAIL_ON_CONFLICT=true. Any other code, or
# exit 1 with no report or an {"error"} report, is a real error and fails.
set -euo pipefail

: "${REPO:?REPO is required}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PR_UPDATE_VERSION="${PR_UPDATE_VERSION:-0.9.9}"
STRATEGY="${STRATEGY:-merge}"
REPAIR_AGENT="${REPAIR_AGENT:-}"
REPAIR_TIMEOUT_SECONDS="${REPAIR_TIMEOUT_SECONDS:-600}"
INCLUDE_DRAFTS="${INCLUDE_DRAFTS:-true}"
APPLY="${APPLY:-true}"
FAIL_ON_CONFLICT="${FAIL_ON_CONFLICT:-false}"
EXTRA_ARGS="${EXTRA_ARGS:-}"
DRY_RUN="${DRY_RUN:-}"
PR_NUMBER="${PR_NUMBER:-}"
tmp="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/pr-update-action"
report="$tmp/report.json"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
output="${GITHUB_OUTPUT:-/dev/null}"

die() { echo "pr-update: $*" >&2; exit 1; }

[[ "$PR_UPDATE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "pr-update-version must be an exact X.Y.Z, not '$PR_UPDATE_VERSION'"
case "$STRATEGY" in merge | rebase) ;; *) die "strategy must be merge or rebase, not '$STRATEGY'" ;; esac
case "$REPAIR_AGENT" in "" | claude | codex | cursor | pi) ;; *) die "repair-agent must be claude, codex, cursor, pi or empty" ;; esac
[[ "$REPAIR_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || die "repair-timeout-seconds must be a positive integer"
# The key is for pr-update and its repair agent only; select-prs.sh and
# annotate.sh run without it. An empty key is removed so the agent sees none.
[ -n "${ANTHROPIC_API_KEY:-}" ] || unset ANTHROPIC_API_KEY

mkdir -p "$tmp"
rm -f "$report"
export PR_NUMBER

OUT_DIR="$tmp" SKIP_LABEL="${SKIP_LABEL:-}" CONFLICT_LABEL="${CONFLICT_LABEL:-}" \
  INCLUDE_DRAFTS="$INCLUDE_DRAFTS" env -u ANTHROPIC_API_KEY "$here/select-prs.sh"
eligible="$(wc -l <"$tmp/eligible.txt" | tr -d ' ')"
excluded="$(wc -l <"$tmp/excluded.tsv" | tr -d ' ')"
echo "pr-update: $eligible PR(s) to update, $excluded excluded"

annotate() {
  REPORT="$report" EXCLUDED="$tmp/excluded.tsv" LABELED="$tmp/labeled.txt" \
    CONFLICT_LABEL="${CONFLICT_LABEL:-}" COMMENT_CONFLICTS="${COMMENT_CONFLICTS:-true}" \
    APPLY="$APPLY" REPAIR_AGENT="$REPAIR_AGENT" env -u ANTHROPIC_API_KEY "$here/annotate.sh" ||
    echo "::warning::could not label or comment on the PRs (does the token have pull requests and issues write?)"
}

finish() {
  REPO="$REPO" "$here/render-summary.sh" "$report" "$tmp/excluded.tsv" >>"$summary"
  echo "report-path=$report" >>"$output"
  echo "excluded=$excluded" >>"$output"
  for pair in updated:updated up-to-date:upToDate conflict:conflict failed:failed skipped:skipped; do
    echo "${pair%%:*}=$(jq -r ".counts.${pair##*:} // 0" "$report")" >>"$output"
  done
  annotate
}

# With no --pr, pr-update would take every open PR, so an empty list must not reach it.
if [ "$eligible" -eq 0 ]; then
  echo '{"applied":false,"results":[],"skipped":[],"counts":{"updated":0,"upToDate":0,"conflict":0,"failed":0,"skipped":0}}' >"$report"
  finish
  exit 0
fi

if [ -n "${PR_UPDATE_CMD:-}" ]; then
  cmd=("$PR_UPDATE_CMD")
else
  cmd=(npx --yes "@osdlc/pr-update@$PR_UPDATE_VERSION")
fi
cmd+=(update --trust --strategy "$STRATEGY" --report "$report")
[ "$APPLY" != true ] || cmd+=(--apply)
# Drafts are already filtered by select-prs.sh; pr-update has --no-drafts but
# no --drafts, and the --pr list below is exactly what to update.
[ -z "$REPAIR_AGENT" ] || cmd+=(--repair-agent "$REPAIR_AGENT")
while IFS= read -r n; do cmd+=(--pr "$n"); done <"$tmp/eligible.txt"
if [ -n "$EXTRA_ARGS" ]; then
  # Split on whitespace only: no glob expansion of the words.
  set -f
  # shellcheck disable=SC2206
  cmd+=($EXTRA_ARGS)
  set +f
fi

if [ -n "$REPAIR_AGENT" ]; then
  # pr-update has no flag for the repair timeout, only config. A config file
  # named by PR_UPDATE_CONFIG replaces the project's pair, so this repository's
  # own pr-update.yaml, if it ever gets one, is not read by this action.
  printf 'pr_update:\n  repair:\n    timeout_seconds: %s\n' "$REPAIR_TIMEOUT_SECONDS" >"$tmp/pr-update.yaml"
  export PR_UPDATE_CONFIG="$tmp/pr-update.yaml"
fi

if [ "$DRY_RUN" = 1 ]; then
  printf '+'
  printf ' %q' "${cmd[@]}"
  printf '\n'
  exit 0
fi

code=0
"${cmd[@]}" || code=$?

if [ ! -s "$report" ]; then
  echo "::error::pr-update exited $code and wrote no report"
  echo "pr-update exited $code and wrote no report." >>"$summary"
  exit "$((code == 0 ? 1 : code))"
fi
finish

if jq -e 'has("error")' "$report" >/dev/null; then
  echo "::error::pr-update failed: $(jq -r '.error' "$report")"
  exit "$((code == 0 ? 1 : code))"
fi
case "$code" in
  0) exit 0 ;;
  1)
    n="$(jq -r '.counts.conflict + .counts.failed' "$report")"
    if [ "$FAIL_ON_CONFLICT" = true ]; then
      echo "::error::$n PR(s) ended conflict or failed"
      exit 1
    fi
    echo "::warning::$n PR(s) ended conflict or failed; see the job summary"
    exit 0
    ;;
  *)
    echo "::error::pr-update exited $code"
    exit "$code"
    ;;
esac
