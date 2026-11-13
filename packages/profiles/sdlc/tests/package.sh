#!/bin/sh
# Checks the sdlc profile and the sdlc starter corpus as npm ships them.
#
# The script packs both packages with pnpm, as the release does, and unpacks
# each tarball into a temporary node_modules/@osdlc/. The starter names the
# profile by its package name, and downstream/ names both, so the validator
# finds them as Node finds a package, through the "corpus" field.
#
# Checks:
#
# - each tarball holds its corpus and no tests;
# - the profile's corpus validates with no warnings;
# - the starter validates with no warnings;
# - a starter principle with an unknown state fails, a rule of the profile's type;
# - a starter principle with two principle/<category> tags fails, a pack rule
#   the profile carries as `contains`;
# - downstream/, a corpus that references the starter and cites a starter
#   principle as [[P-0002]], fails until sync writes its copy of the starter,
#   then validates with no warnings. Its principle's file name carries a slug,
#   and its decision is a record folder, D-0101-<slug>/README.md;
# - downstream/ fails when it cites a principle the starter does not hold.
#
# The validator is the corpus-schema the repository root installs. Set
# CORPUS_SCHEMA to run another one (see tools/validator.sh).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
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

# Pack $1 (a folder of this repo) and unpack it as node_modules/$2.
install() {
  mkdir -p "$work/tgz/$2" "$work/node_modules/$2"
  (cd "$repo/$1" && pnpm pack --pack-destination "$work/tgz/$2" >/dev/null)
  tar -xzf "$work/tgz/$2"/*.tgz -C "$work/node_modules/$2" --strip-components=1
}
install profiles/sdlc @osdlc/corpus-profile-sdlc
install corpora/sdlc-starter @osdlc/corpus-sdlc-starter
profile="$work/node_modules/@osdlc/corpus-profile-sdlc"
starter="$work/node_modules/@osdlc/corpus-sdlc-starter"

for p in "$profile" "$starter"; do
  if [ -f "$p/corpus/$(basename "$p" | sed 's/^corpus-profile-//; s/^corpus-//').corpus-schema.md" ] && [ ! -e "$p/tests" ]; then
    pass "the $(basename "$p") tarball holds corpus/ and no tests"
  else
    fail "the $(basename "$p") tarball's files:"
    (cd "$p" && find . -type f | sort | sed 's/^/  /')
  fi
done

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

check "$profile/corpus" 0 "" "the installed profile validates"
check "$starter/corpus" 0 "" "the installed starter validates"

cp -R "$starter/corpus" "$work/starter"
p2="$work/starter/principles/P-0002.md"
cp "$p2" "$work/p2.md"
sed 's|^state: open/draft$|state: open/someday|' "$work/p2.md" >"$p2"
check "$work/starter" 1 "principles/$(basename "$p2"): state: must be equal to one of the allowed values" \
  "the profile's state enum applies"
sed 's|^  - principle/technical$|  - principle/technical\
  - principle/product|' "$work/p2.md" >"$p2"
check "$work/starter" 1 "principles/$(basename "$p2"): tags: must contain at least 1 and no more than 1 valid item(s)" \
  "the profile's principle/<category> rule applies"

# A wikilink to a referenced corpus's record is a link into its copy,
# _references/osdlc/, which sync writes.
cp -R "$here/downstream" "$work/downstream"
check "$work/downstream" 1 "_references/osdlc: (copy): missing" \
  "a corpus that cites a starter principle needs the starter's copy"
corpus_schema sync "$work/downstream" >/dev/null
check "$work/downstream" 0 "" "a corpus that cites a starter principle validates"

p101="$work/downstream/principles/P-0101-check-before-review.md"
sed 's|\[\[P-0002\]\]|[[P-0099]]|' "$here/downstream/principles/$(basename "$p101")" >"$p101"
check "$work/downstream" 1 "principles/$(basename "$p101"): related: \"P-0099\" is not the id of a record of type sdlc/principles" \
  "a citation of a principle the starter does not hold fails"

exit "$failed"
