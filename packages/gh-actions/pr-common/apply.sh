#!/usr/bin/env bash
# The `--apply` half of skill mode, in two jobs so the agent never shares a
# runner with the push token.
#   apply.sh check   agent job, before the agent: refuse a fork head or a head
#                    that is the default or base branch. Prints the reason, exits 1.
#   apply.sh patch   agent job, after the agent: turn the working tree into
#                    $RUNNER_TEMP/$AGENT-pr-apply/{patch,meta.json,result.json}
#                    (patch is `git diff --binary` against the head recorded
#                    before the agent ran). Writes patch=true|false to $GITHUB_OUTPUT.
#   apply.sh push    push job (environment pr-agent, a fresh checkout, nothing
#                    from the agent but the downloaded artifact): refuse unless
#                    the head is unmoved, same repo, not the default or base
#                    branch and the patch touches only allowed paths and modes;
#                    apply, commit and push (never forced) to the PR head branch.
#                    Leaves $RESULT (the artifact's result.json) ready for post.sh.
# Env: AGENT REPO PR REQUEST RUNNER_TEMP; patch: RESULT; push: PUSH_TOKEN,
# GIT_USER_NAME, GIT_USER_EMAIL.
set -e
: "${AGENT:?AGENT is required}" "${REPO:?REPO is required}" "${PR:?PR is required}"
step="${1:?check, patch or push}"
here="$(dirname "$0")"
# shellcheck source=/dev/null
. "$here/skill-request.sh"
parse_skill_request
tmp="${RUNNER_TEMP:-/tmp}"
dir="$tmp/$AGENT-pr-apply"

# Sets pr_owner pr_name pr_ref pr_oid pr_base, or sets pr_err and returns 1.
read_head() {
  local line default
  line=$(gh pr view "$PR" --json headRepositoryOwner,headRepository,headRefName,headRefOid,baseRefName \
    --jq '[.headRepositoryOwner.login, .headRepository.name, .headRefName, .headRefOid, .baseRefName] | @tsv') \
    || { pr_err="Could not read the pull request head from GitHub."; return 1; }
  IFS=$'\t' read -r pr_owner pr_name pr_ref pr_oid pr_base <<< "$line"
  if [ -z "$pr_oid" ] || [ -z "$pr_ref" ]; then
    pr_err="Could not read the pull request head (a deleted fork or branch?)."
    return 1
  fi
  if [ "$(printf '%s/%s' "$pr_owner" "$pr_name" | tr '[:upper:]' '[:lower:]')" != "$(printf '%s' "$REPO" | tr '[:upper:]' '[:lower:]')" ]; then
    pr_err="--apply only works when the pull request's branch is in $REPO; this one is from $pr_owner/$pr_name. Nothing was run."
    return 1
  fi
  default=$(gh repo view "$REPO" --json defaultBranchRef --jq .defaultBranchRef.name) \
    || { pr_err="Could not read the repository's default branch."; return 1; }
  if [ "$pr_ref" = "$default" ] || [ "$pr_ref" = "$pr_base" ]; then
    pr_err="--apply never pushes to the default or base branch, and this pull request's head branch is \`$pr_ref\` (default \`$default\`, base \`$pr_base\`). Nothing was run."
    return 1
  fi
}

if [ "$step" = check ]; then
  read_head || { echo "$pr_err"; exit 1; }
  exit 0
fi

# note <markdown>: append to the agent's final message in $RESULT.
note() {
  jq --arg a "$1" '.result = ((.result // "") + "\n\n---\n" + $a)' "$RESULT" > "$RESULT.new" && mv "$RESULT.new" "$RESULT"
}

if [ "$step" = patch ]; then
  : "${RESULT:?RESULT is required}"
  rm -rf "$dir"
  mkdir -p "$dir"
  export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
  head=$(cat "$tmp/$AGENT-pr-head")
  git -c core.hooksPath=/dev/null add -A
  git diff --cached --binary --full-index --no-ext-diff --no-textconv "$head" > "$dir/patch"
  if [ ! -s "$dir/patch" ]; then
    rm -rf "$dir"
    note "No files changed, so nothing was committed or pushed."
    echo "patch=false" >> "${GITHUB_OUTPUT:-/dev/null}"
    exit 0
  fi
  git diff --cached --name-only -z --no-ext-diff "$head" | jq -Rs '[split("\u0000")[] | select(length > 0)]' > "$dir/paths.json"
  jq -n --arg head "$head" --slurpfile paths "$dir/paths.json" '{head: $head, paths: $paths[0]}' > "$dir/meta.json"
  rm "$dir/paths.json"
  cp "$RESULT" "$dir/result.json"
  echo "patch=true" >> "${GITHUB_OUTPUT:-/dev/null}"
  exit 0
fi

# --- push
RESULT="$dir/result.json"
: "${RESULT:?}"
meta_head=$(jq -r .head "$dir/meta.json")
printf '%s\n' "$meta_head" > "$tmp/$AGENT-pr-head"
rm -f "$tmp/$AGENT-pr-pushed"

# fail <reason>: make $RESULT an error carrying the reason, keep the agent's output.
fail() {
  jq --arg r "$1" '{is_error: true, result: ("Not pushed: " + $r + "\n\nWhat the agent reported:\n\n" + (.result // ""))}' "$RESULT" > "$RESULT.new" \
    && mv "$RESULT.new" "$RESULT"
  echo "$1"
  exit 1
}

if [ -z "${PUSH_TOKEN:-}" ]; then
  fail "no push token. The push job needs the \`pr-agent\` environment with the App secrets (RELEASE_PLZ_APP_ID, RELEASE_PLZ_APP_PRIVATE_KEY) so it can mint a token; see the action's README. The patch is in the run's artifacts."
fi
: "${GIT_USER_NAME:?GIT_USER_NAME is required}" "${GIT_USER_EMAIL:?GIT_USER_EMAIL is required}"
read_head || fail "$pr_err"
if [ "$meta_head" != "$pr_oid" ]; then
  fail "the pull request's head is ${pr_oid:0:7} but the agent ran on ${meta_head:0:7}: the branch moved since. Re-run the comment on the current head."
fi
git fetch -q origin "+refs/heads/$pr_ref:refs/remotes/origin/$pr_ref" || fail "could not fetch $pr_ref."
git checkout -q --detach "$pr_oid" || fail "could not check out ${pr_oid:0:7}."
if [ "$(git rev-parse HEAD)" != "$pr_oid" ]; then fail "the checkout is not at the pull request head."; fi

git -c core.hooksPath=/dev/null apply --index --binary "$dir/patch" || { git reset -q --hard "$pr_oid"; fail "the patch does not apply to the head."; }

# Inspect what was staged: paths, symlinks, submodules and new executable bits.
violation=""
while IFS= read -r -d '' info && IFS= read -r -d '' path; do
  set -- ${info#:}
  oldmode=$1 newmode=$2
  lower=$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')
  case "/$lower/" in
    //*|*/../*|*/./*) violation="path outside the repository: $path" ;;
  esac
  case "$path" in /*) violation="path outside the repository: $path" ;; esac
  IFS=/ read -r -a parts <<< "$lower"
  for p in "${parts[@]}"; do
    case "$p" in .git*) violation="a protected path ($path)" ;; esac
  done
  case "$oldmode$newmode" in
    *120000*) violation="a symlink ($path)" ;;
    *160000*) violation="a submodule ($path)" ;;
  esac
  if [ "$newmode" = 100755 ] && [ "$oldmode" != 100755 ]; then violation="a new executable bit ($path)"; fi
  if [ -n "$violation" ]; then break; fi
done < <(git diff --cached --raw -z --no-renames --no-ext-diff HEAD)
if [ -n "$violation" ]; then
  git reset -q --hard "$pr_oid"
  fail "the patch touches $violation, which --apply does not allow (.github/, .git*, paths outside the repository, symlinks, submodules, new executables)."
fi

msg="$AGENT: /${SKILL_NAME}${SKILL_ARGS:+ $SKILL_ARGS} (requested in #$PR comment)"
git -c core.hooksPath=/dev/null -c commit.gpgsign=false -c user.name="$GIT_USER_NAME" -c user.email="$GIT_USER_EMAIL" \
  commit -q --no-verify -m "$msg" || fail "git commit failed."
sha=$(git rev-parse HEAD)
stat=$(git diff --stat "$pr_oid" "$sha")
# Empty the checkout's read-token header and give git the push token through a
# helper that reads the environment, so it is never in argv or a file.
server="${GITHUB_SERVER_URL:-https://github.com}"
if ! out=$(git -c core.hooksPath=/dev/null -c "http.$server/.extraheader=" -c credential.helper= \
  -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$PUSH_TOKEN"; }; f' \
  push --no-verify origin "HEAD:refs/heads/$pr_ref" 2>&1); then
  fail "git push was rejected: $(printf '%s' "$out" | tail -n 6 | sed "s/$PUSH_TOKEN/***/g")"
fi
printf '%s\n' "$sha" > "$tmp/$AGENT-pr-pushed"
note "Pushed \`${sha:0:7}\` to \`$pr_ref\`:

\`\`\`
$stat
\`\`\`"
