#!/bin/sh
# Installs and builds packages/ts/corpus-schema, this repo's own validator, with the workspace
# packages it uses. The Markdown Ecosystem Plan in docs/planning/markdown uses `extends`, which
# @osdlc/corpus-schema has from 0.4.0; 0.4.0 is on npm, and this builds the repo's own source. CI runs
# this, and so can you, from any folder.
set -eu
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile --filter '@osdlc/corpus-schema...'
pnpm --filter '@osdlc/corpus-schema...' run build
