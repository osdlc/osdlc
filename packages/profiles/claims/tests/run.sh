#!/bin/sh
# Checks that the claims schemas reject what they should.
#
# Each folder in cases/ holds one record that breaks one rule, laid out as in a
# corpus, and one of two files:
#
# - expected-error.txt: the validator must exit 1, report exactly one error,
#   and print this text.
# - expected-warning.txt: a known gap that the validator only warns about. It
#   must exit 0 and print this text.
#
# For each case the script copies the example corpus, adds the record, and runs
# the validator built from packages/ts/corpus-schema in this checkout. Build it
# first: pnpm --filter @osdlc/corpus-schema build.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
cli="$here/../../../packages/ts/corpus-schema/bin/corpus-schema.js"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

failed=0
for case_dir in "$here"/cases/*/; do
  name=$(basename "$case_dir")
  corpus="$work/$name"
  cp -R "$here/../example" "$corpus"
  cp -R "$case_dir." "$corpus/"
  rm -f "$corpus/expected-error.txt" "$corpus/expected-warning.txt"

  status=0
  out=$(node "$cli" validate "$corpus" 2>&1) || status=$?

  # The copy keeps example.corpus-schema.md, so the corpus is named example.
  if [ -f "$case_dir/expected-error.txt" ]; then
    expected=$(cat "$case_dir/expected-error.txt")
    want_status=1
    summary="example: 1 error(s)"
  else
    expected=$(cat "$case_dir/expected-warning.txt")
    want_status=0
    summary="ok: example:"
  fi

  if [ "$status" -eq "$want_status" ] &&
    printf '%s\n' "$out" | grep -qF "$summary" &&
    printf '%s\n' "$out" | grep -qF "$expected"; then
    echo "ok: $name"
  else
    echo "FAIL: $name (exit $status), expected: $expected"
    printf '%s\n' "$out" | sed 's/^/  /'
    failed=1
  fi
done

exit "$failed"
