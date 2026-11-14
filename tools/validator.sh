# shellcheck shell=sh disable=SC2154
# Sourced by scripts that run this repository's validator, after they set
# $repo to the repository root.
#
# corpus_schema <subcommand> <args>... runs packages/ts/corpus-schema, built
# first by tools/build-corpus-schema.sh. Set CORPUS_SCHEMA to the command of
# another validator to run that one instead.
#
# validate <folder>... is corpus_schema validate. tools/validate-strict.sh
# passes it --strict, which @osdlc/corpus-schema has from 0.4.0.
corpus_schema() {
  if [ -n "${CORPUS_SCHEMA:-}" ]; then
    $CORPUS_SCHEMA "$@"
  else
    node "$repo/packages/ts/corpus-schema/bin/corpus-schema.js" "$@"
  fi
}

validate() {
  corpus_schema validate "$@"
}
