# shellcheck shell=sh disable=SC2154
# Sourced by run.sh and package.sh, after they set $here to this folder.
#
# validate <folder> runs this repository's corpus-schema, built first. Set
# CORPUS_SCHEMA to the command of another validator to run that one instead.
validate() {
  if [ -n "${CORPUS_SCHEMA:-}" ]; then
    $CORPUS_SCHEMA validate "$1"
  else
    node "$here/../../../packages/ts/corpus-schema/bin/corpus-schema.js" validate "$1"
  fi
}
