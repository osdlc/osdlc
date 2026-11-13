# shellcheck shell=sh disable=SC2154
# Sourced by scripts that run this repository's validator, after they set
# $repo to the repository root.
#
# validate <folder>... runs packages/ts/corpus-schema, built first by
# tools/build-corpus-schema.sh. Set CORPUS_SCHEMA to the command of another
# validator to run that one instead. tools/validate-strict.sh passes it
# --strict, which @osdlc/corpus-schema has from 0.3.0.
validate() {
  if [ -n "${CORPUS_SCHEMA:-}" ]; then
    $CORPUS_SCHEMA validate "$@"
  else
    node "$repo/packages/ts/corpus-schema/bin/corpus-schema.js" validate "$@"
  fi
}
