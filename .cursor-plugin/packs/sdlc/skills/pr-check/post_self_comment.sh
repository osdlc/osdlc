#!/usr/bin/env bash
# Post an orchestrator-authored comment to a PR and record the posted
# timestamp into the PR's pr-check cursor so the next /sdlc:pr-check
# tick can filter the orchestrator's own reply out of the
# new-entries set.
#
# Without this wrapper, every orchestrator-dispatched response posted
# via raw `gh pr comment` shows up to pr-check on the next tick as a
# net-new third-party comment (the orchestrator is authenticated as
# the user's GitHub identity, indistinguishable from real feedback)
# and the orchestrator wastes a dispatch on its own reply. The cursor
# field `self_posted_at: list[str]` is the precise filter — entries
# whose createdAt/submittedAt matches any timestamp in that list are
# dropped before the new-entries computation.
#
# Usage:
#   post_self_comment.sh <pr-number> <body>
#   post_self_comment.sh <pr-number> --body-file <path>
#
# Optional environment overrides (for tests):
#   PR_CHECK_CURSOR_DIR    Override the cursor directory.
#                          Default: <main-checkout>/.sdlc/pr-cursors/ — the
#                          MAIN checkout (the parent of `git rev-parse
#                          --git-common-dir`), whichever worktree runs this,
#                          because `sdlc pr classify` reads cursors there.
#   PR_CHECK_PROJECT_ROOT  Override the project root.
#                          Default: $(git rev-parse --show-toplevel)
#                          or $PWD if not in a git repo.
#
# Exits 0 on success. Exits non-zero with an error on stderr if the
# `gh` post fails, the timestamp can't be captured, or the cursor file
# can't be written.

set -euo pipefail

die() {
  echo "post_self_comment.sh: $*" >&2
  exit 1
}

if [ "$#" -lt 2 ]; then
  die "usage: post_self_comment.sh <pr-number> <body> | <pr-number> --body-file <path>"
fi

pr_number="$1"
shift

# Validate PR number is an integer.
case "$pr_number" in
  ''|*[!0-9]*) die "pr-number must be a bare integer, got: $pr_number" ;;
esac

# Resolve body — either inline or from a file.
if [ "$1" = "--body-file" ]; then
  shift
  [ "$#" -ge 1 ] || die "--body-file requires a path"
  body_file="$1"
  [ -r "$body_file" ] || die "--body-file: cannot read $body_file"
  body="$(cat "$body_file")"
else
  body="$1"
fi

# Resolve project root and cursor directory.
project_root="${PR_CHECK_PROJECT_ROOT:-}"
if [ -z "$project_root" ]; then
  if project_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
    :
  else
    project_root="$PWD"
  fi
fi

# The runtime state lives in the main checkout's .sdlc/ (runtimeStateDir in
# lib/util/git.ts): from a linked worktree the git common dir is the main
# checkout's .git, so its parent is the main checkout. Outside a git repo, or
# when the common dir is not a plain `.git` (bare repo, submodule), fall back
# to the project root.
state_root="$project_root"
if common_dir="$(git -C "$project_root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
  && top_dir="$(git -C "$project_root" rev-parse --show-toplevel 2>/dev/null)" \
  && [ "$(basename "$common_dir")" = ".git" ]; then
  top_real="$(cd "$top_dir" && pwd -P)"
  root_real="$(cd "$project_root" && pwd -P)"
  state_root="$(dirname "$common_dir")${root_real#"$top_real"}"
fi
cursor_dir="${PR_CHECK_CURSOR_DIR:-$state_root/.sdlc/pr-cursors}"
cursor_path="$cursor_dir/$pr_number.json"

# Tool availability.
command -v gh >/dev/null 2>&1 || die "gh not found on PATH"
command -v jq >/dev/null 2>&1 || die "jq not found on PATH"

# Post the comment. `gh pr comment` prints the comment URL on stdout
# on success. We discard the URL — we use the re-query below to read
# the canonical `createdAt` timestamp because the URL alone doesn't
# carry the timestamp and parsing the comment ID out of the URL just
# to make a second query is no simpler than the re-query itself.
gh pr comment "$pr_number" --body "$body" >/dev/null

# Capture the posted comment's createdAt. The PR's `comments` array
# is ordered by createdAt ascending, so the last entry is the comment
# we just posted. (If a true racing third-party post slipped in
# between, the next tick's NEEDS-RESPONSE on that third-party comment
# is the right behaviour anyway — we're only protecting against the
# orchestrator's OWN reply being misread.)
created_at="$(gh pr view "$pr_number" --json comments \
  --jq '.comments[-1].createdAt')"

if [ -z "$created_at" ] || [ "$created_at" = "null" ]; then
  die "could not capture createdAt timestamp from gh pr view $pr_number"
fi

# Append the timestamp to the cursor's self_posted_at array,
# creating the file (with a null last_seen_comment_at sentinel) if
# absent. jq does the JSON manipulation; bash never edits JSON in
# place by hand.
mkdir -p "$cursor_dir"
if [ -f "$cursor_path" ]; then
  tmp="$(mktemp)"
  jq --arg ts "$created_at" \
    '. + {self_posted_at: ((.self_posted_at // []) + [$ts])}' \
    "$cursor_path" >"$tmp"
  mv "$tmp" "$cursor_path"
else
  jq -n --arg ts "$created_at" \
    '{last_seen_comment_at: null, last_invoked_at: null, self_posted_at: [$ts]}' \
    >"$cursor_path"
fi

echo "$created_at"
