#!/bin/sh
# Validates each folder given with this repository's validator, and fails on a
# warning as well as on an error.
#
# usage: sh tools/validate-strict.sh <folder>...
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
. "$repo/tools/validator.sh"
if ! validate --strict "$@"; then
  echo "::error::$* must validate with no errors and no warnings"
  exit 1
fi
