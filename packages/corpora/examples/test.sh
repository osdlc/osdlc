#!/bin/sh
# Checks that the validator catches what the example pair's CI relies on.
#
# The script copies examples/, with fernlog's installed node_modules/, to a
# temporary folder, breaks one thing at a time, and runs the validator on
# fernlog. Each case must fail with its one expected error. Install fernlog's
# dependencies and build the validator first. Set CORPUS_SCHEMA to run another
# validator (see tools/validator.sh).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/.." && pwd)
. "$repo/tools/validator.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

failed=0
# Copies examples/ to $work/$1, runs the edit in $2 there, validates fernlog,
# and passes when it reports one error that holds $3.
check() {
  copy="$work/$1"
  cp -R "$here" "$copy"
  (cd "$copy" && eval "$2")
  status=0
  out=$(validate "$copy/fernlog" 2>&1) || status=$?
  if [ "$status" -eq 1 ] &&
    printf '%s\n' "$out" | grep -qF "fernlog: 1 error(s)" &&
    printf '%s\n' "$out" | grep -qF "$3"; then
    echo "ok: $1"
  else
    echo "FAIL: $1 (exit $status), expected: $3"
    printf '%s\n' "$out" | sed 's/^/  /'
    failed=1
  fi
}

check stale-copy \
  'echo "One more line." >>"org-principles/principles/Write decisions down.md"' \
  '_references/org/principles/Write decisions down.md: (copy): differs from the installed corpus; run corpus-schema sync'

check follows-a-document \
  'sed "s#\.\./_references/org/principles/Write%20decisions%20down\.md#../documents/fernlog%20README.md#" \
    "fernlog/decisions/Read config from the XDG folder.md" >decision.md &&
    mv decision.md "fernlog/decisions/Read config from the XDG folder.md"' \
  'follows: documents/fernlog README.md is not a record of type org/principles'

# The claims profile is in extends, which gives types only, so a link into it
# is an error.
check link-into-profile \
  'printf "\nSee [the profile](../_references/claims/corpus-schema.md).\n" \
    >>"fernlog/decisions/Read config from the XDG folder.md"' \
  'claims is in extends, which gives types only; name the corpus in references to link to its files'

check checked-by-a-document \
  'sed "s#\.\./statements/fernlog%20config%20path\.md#../documents/fernlog%20README.md#" \
    "fernlog/decisions/Read config from the XDG folder.md" >decision.md &&
    mv decision.md "fernlog/decisions/Read config from the XDG folder.md"' \
  'checkedBy: documents/fernlog README.md is not a record of type claims/statements'

exit "$failed"
