#!/bin/sh
# Validates each folder given with this repository's validator, and fails on a
# warning as well as on an error. The validator prints warnings on stderr and
# still exits 0, so the script keeps stderr and checks it.
#
# usage: sh tools/validate-strict.sh <folder>...
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
. "$repo/tools/validator.sh"
err=$(mktemp)
trap 'rm -f "$err"' EXIT

status=0
validate "$@" 2>"$err" || status=$?
cat "$err" >&2
if [ "$status" -ne 0 ]; then exit "$status"; fi
if grep -q '^warning:' "$err"; then
  echo "::error::$* must validate with no warnings"
  exit 1
fi
