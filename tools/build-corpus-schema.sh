#!/bin/sh
# Installs and builds packages/ts/corpus-schema, this repo's own validator, with the workspace
# packages it uses. The Markdown Ecosystem Plan in docs/planning/markdown uses `extends`, which
# @osdlc/corpus-schema has from 0.3.0; npm has 0.2.1, and 0.3.0 publishes from this repo. CI runs
# this, and so can you, from any folder.
set -eu
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile --filter '@osdlc/corpus-schema...'
pnpm --filter '@osdlc/corpus-schema...' run build
