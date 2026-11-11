#!/bin/sh
# Checks the profile as npm ships it.
#
# The script packs the package with pnpm, as the release does, unpacks the
# tarball into a temporary node_modules/@osdlc/corpus-profile-claims/, and
# copies package/fixture/ beside it. The fixture names the profile by its package name, so the
# validator finds it as Node finds a package, through the "corpus" field.
#
# Checks:
#
# - the tarball holds the profile's corpus and no example or tests;
# - the profile's corpus validates with no warnings;
# - the fixture validates with no warnings;
# - a fixture document without `title` fails, a rule of the profile's type;
# - a fixture document without `publisher` fails, a rule the fixture adds.
#
# The validator is this repository's corpus-schema, built first. Set
# CORPUS_SCHEMA to run another one (see tools/validator.sh).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
package_dir=$(cd "$here/.." && pwd)
repo=$(cd "$here/../../.." && pwd)
. "$repo/tools/validator.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

failed=0
pass() { echo "ok: $1"; }
fail() {
  echo "FAIL: $1"
  failed=1
}

# Pack and unpack.
(cd "$package_dir" && pnpm pack --pack-destination "$work" >/dev/null)
installed="$work/node_modules/@osdlc/corpus-profile-claims"
mkdir -p "$installed"
tar -xzf "$work"/*.tgz -C "$installed" --strip-components=1

if [ -f "$installed/corpus/corpus-schema.md" ] &&
  [ ! -e "$installed/example" ] && [ ! -e "$installed/tests" ]; then
  pass "the tarball holds corpus/ and no example or tests"
else
  fail "the tarball's files:"
  (cd "$installed" && find . -type f | sort | sed 's/^/  /')
fi

# Runs the validator on $1 and passes when it exits $2 and its output holds
# $3, as its one error. With no $3, it runs with --strict, so a warning fails.
check() {
  status=0
  if [ -z "$3" ]; then
    out=$(validate --strict "$1" 2>&1) || status=$?
  else
    out=$(validate "$1" 2>&1) || status=$?
  fi
  if [ "$status" -ne "$2" ]; then
    fail "$4 (exit $status, expected $2)"
  elif [ -n "$3" ] && ! { printf '%s\n' "$out" | grep -qF "$3" &&
    printf '%s\n' "$out" | grep -qF "$(basename "$1"): 1 error(s)"; }; then
    fail "$4 (expected one error: $3)"
  else
    pass "$4"
    return 0
  fi
  printf '%s\n' "$out" | sed 's/^/  /'
}

check "$installed/corpus" 0 "" "the installed profile validates"

cp -R "$here/package/fixture" "$work/fixture"
check "$work/fixture" 0 "" "the fixture validates"

doc="$work/fixture/documents/fernlog README.md"
cp "$doc" "$work/doc.md"
grep -v '^title:' "$work/doc.md" >"$doc"
check "$work/fixture" 1 "documents/fernlog README.md: title: required" \
  "the profile's rule applies"

grep -v '^publisher:' "$work/doc.md" >"$doc"
check "$work/fixture" 1 "documents/fernlog README.md: publisher: required" \
  "the fixture's rule applies"

exit "$failed"
