#!/bin/sh
# Fails when a folder under packages/profiles/ or packages/corpora/ holds
# private data. The profiles and corpora ship to a public registry, and some
# of their content is carried over from private repos.
#
# A link to a record the corpus does not hold is the validator's check, not
# this one.
#
# usage: sh tools/leak-check.sh
set -eu
cd "$(dirname "$0")/.."

failed=0
# scan <what> <extended regex> <path>...
scan() {
  what=$1
  pattern=$2
  shift 2
  status=0
  hits=$(grep -rnIE --exclude-dir=node_modules "$pattern" "$@") || status=$?
  # A hit counts only if it still matches with the text $not names taken out.
  if [ "$status" -eq 0 ] && [ -n "${not:-}" ]; then
    hits=$(printf '%s\n' "$hits" | sed -E "s/$not//g" | grep -E "$pattern") || status=$?
  fi
  case $status in
    0)
      printf '%s\n' "$hits" | sed "s|^|leak ($what): |"
      failed=1
      ;;
    1) ;;
    *)
      echo "::error::leak check could not scan $* for $what" >&2
      exit 2
      ;;
  esac
}

scan "private repo" 'sksizer/dev([^a-zA-Z0-9_-]|$)' packages/profiles packages/corpora
scan "home path" '/(Users|home)/[A-Za-z0-9_.-]+' packages/profiles packages/corpora
# A git remote in an SSH form, git@host:owner/repo or ssh://git@host/owner/repo,
# is not an address.
not='git@[A-Za-z0-9.-]+[:/]'
scan "email address" '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}' packages/profiles packages/corpora
not=

# packages/profiles/claims/ and packages/corpora/examples/ are exempt: their
# examples are about the config paths of a made-up tool under ~/.
# packages/corpora/harness-reference/ is exempt too: it records where each
# harness keeps its config and skills, such as ~/.claude/.
tilde=
for dir in packages/profiles/*/ packages/corpora/*/; do
  case $dir in
    packages/profiles/claims/ | packages/corpora/examples/ | packages/corpora/harness-reference/) ;;
    *) tilde="$tilde ${dir%/}" ;;
  esac
done
# $tilde is a list of folders without spaces, so it is left unquoted.
# shellcheck disable=SC2086
[ -z "$tilde" ] || scan "home-relative path" '(^|[^A-Za-z0-9_])~/' $tilde

if [ "$failed" -ne 0 ]; then
  echo "::error::private data in a package folder; remove it before publishing"
  exit 1
fi
echo "ok: no private data in packages/profiles/ or packages/corpora/"
