#!/usr/bin/env bash
# The `--apply` half of skill mode. The agent only edits files; this script (the
# action, not the agent) commits and pushes.
#   apply.sh check   before the agent runs: refuse a fork head. Prints the reason
#                    and exits 1 on a refusal.
#   apply.sh push    after it ran: refuse unless the checkout is still the PR's
#                    head, commit what changed as one commit, push it to the PR
#                    head branch with $PUSH_TOKEN (plain push, never forced) and
#                    add what changed to $RESULT. Exits 1 on a refusal, leaving
#                    $RESULT an error that says why (the agent's output is kept).
# Env: AGENT REPO PR REQUEST RESULT RUNNER_TEMP, and for push PUSH_TOKEN,
# GIT_USER_NAME, GIT_USER_EMAIL. PUSH_TOKEN never reaches the agent.
set -e
: "${AGENT:?AGENT is required}" "${REPO:?REPO is required}" "${PR:?PR is required}"
step="${1:?check or push}"
here="$(dirname "$0")"
# shellcheck source=/dev/null
. "$here/skill-request.sh"
parse_skill_request
tmp="${RUNNER_TEMP:-/tmp}"

# Sets pr_owner pr_name pr_ref pr_oid, or prints the reason and exits 1.
read_head() {
  local line
  line=$(gh pr view "$PR" --json headRepositoryOwner,headRepository,headRefName,headRefOid \
    --jq '[.headRepositoryOwner.login, .headRepository.name, .headRefName, .headRefOid] | @tsv') \
    || { pr_err="Could not read the pull request head from GitHub."; return 1; }
  IFS=$'\t' read -r pr_owner pr_name pr_ref pr_oid <<< "$line"
  if [ -z "$pr_oid" ] || [ -z "$pr_ref" ]; then
    pr_err="Could not read the pull request head (a deleted fork or branch?)."
    return 1
  fi
  if [ "$(printf '%s/%s' "$pr_owner" "$pr_name" | tr '[:upper:]' '[:lower:]')" != "$(printf '%s' "$REPO" | tr '[:upper:]' '[:lower:]')" ]; then
    pr_err="--apply only works when the pull request's branch is in $REPO; this one is from $pr_owner/$pr_name. Nothing was run."
    return 1
  fi
}

if [ "$step" = check ]; then
  read_head || { echo "$pr_err"; exit 1; }
  exit 0
fi

# fail <reason>: make $RESULT an error carrying the reason, keep the agent's output.
fail() {
  jq --arg r "$1" '{is_error: true, result: ("Not pushed: " + $r + "\n\nWhat the agent reported:\n\n" + (.result // ""))}' "$RESULT" > "$RESULT.new" \
    && mv "$RESULT.new" "$RESULT"
  echo "$1"
  exit 1
}
# note <markdown>: append to the agent's final message.
note() {
  jq --arg a "$1" '.result = ((.result // "") + "\n\n---\n" + $a)' "$RESULT" > "$RESULT.new" && mv "$RESULT.new" "$RESULT"
}

: "${RESULT:?RESULT is required}"
rm -f "$tmp/$AGENT-pr-pushed"
read_head || fail "$pr_err"
head=$(git rev-parse HEAD)
if [ "$head" != "$pr_oid" ]; then
  fail "the pull request's head is ${pr_oid:0:7} but the checkout is at ${head:0:7}: the branch moved since checkout (or the agent committed). Re-run the comment on the current head."
fi
if [ -f "$tmp/$AGENT-pr-gitconfig" ] && [ "$(git config --local --list)" != "$(cat "$tmp/$AGENT-pr-gitconfig")" ]; then
  fail "the agent changed the repository's git config."
fi

if [ -z "$(git status --porcelain)" ]; then
  note "No files changed, so nothing was committed or pushed."
  exit 0
fi

: "${PUSH_TOKEN:?PUSH_TOKEN is required}" "${GIT_USER_NAME:?GIT_USER_NAME is required}" "${GIT_USER_EMAIL:?GIT_USER_EMAIL is required}"
msg="$AGENT: /${SKILL_NAME}${SKILL_ARGS:+ $SKILL_ARGS} (requested in #$PR comment)"
git add -A
git -c core.hooksPath=/dev/null -c commit.gpgsign=false -c user.name="$GIT_USER_NAME" -c user.email="$GIT_USER_EMAIL" \
  commit -q --no-verify -m "$msg"
sha=$(git rev-parse HEAD)
stat=$(git diff --stat "$head" "$sha")
# The checkout step left the contents: read token in an http extraheader;
# empty it, and give git the push token through a helper that reads the
# environment, so the token is never in argv or in a file.
server="${GITHUB_SERVER_URL:-https://github.com}"
if ! out=$(git -c core.hooksPath=/dev/null -c "http.$server/.extraheader=" -c credential.helper= \
  -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$PUSH_TOKEN"; }; f' \
  push --no-verify origin "HEAD:refs/heads/$pr_ref" 2>&1); then
  fail "git push was rejected: $(printf '%s' "$out" | tail -n 3 | sed "s/$PUSH_TOKEN/***/g")"
fi
printf '%s\n' "$sha" > "$tmp/$AGENT-pr-pushed"
note "Pushed \`${sha:0:7}\` to \`$pr_ref\`:

\`\`\`
$stat
\`\`\`"
