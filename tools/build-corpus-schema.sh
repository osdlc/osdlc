#!/bin/sh
# Installs and builds packages/ts/corpus-schema, this repo's own validator. The plan in
# docs/planning uses `extends`, which @osdlc/corpus-schema 0.2.0 on npm does not know. CI runs
# this, and so can you, from any folder.
#
# The root lockfile does not match the root package.json yet: the root devDependencies wait on
# @osdlc/package-checks and @osdlc/conformance-suites 0.1.0, which are not on npm
# (osdlc/markdown#10). So the install runs with them left out of package.json, and the lockfile
# still pins corpus-schema's dependencies. Drop that step once the lockfile is refreshed.
set -eu
cd "$(dirname "$0")/.."
cp package.json package.json.orig
trap 'mv package.json.orig package.json' EXIT
node -e 'const fs = require("fs"); const p = JSON.parse(fs.readFileSync("package.json")); delete p.devDependencies; fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")'
pnpm install --frozen-lockfile --filter @osdlc/corpus-schema
pnpm --filter @osdlc/corpus-schema run build
