#!/bin/sh
# Validates each folder given with this repository's validator, and fails on a
# warning as well as on an error. The validator must know `validate --strict`.
#
# usage: sh tools/validate-strict.sh <folder>...
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
. "$repo/tools/validator.sh"
status=0
validate --strict "$@" || status=$?
# 1 is a corpus with an error or a warning. Any other code, such as 2 for bad usage, is passed on.
if [ "$status" -eq 1 ]; then
  echo "::error::$* must validate with no errors and no warnings"
fi
exit "$status"
