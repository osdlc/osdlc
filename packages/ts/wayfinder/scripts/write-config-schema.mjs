// Writes schema/config.json from the built config schema, and its URL into the
// configuration guide's `$schema` line. Needs `dist/`. The URL follows
// package.json's version, which dist/ reads at run time, so a version bump
// needs no rebuild before this runs. The root `version-packages` script runs
// it after `changeset version`; the version job in
// .github/workflows/packages-publish.yml runs that script.
// tests/config-schema.test.ts fails when either file is stale.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { CONFIG_SCHEMA_URL, configJsonSchema } from '../dist/config.js'

const file = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))

// Check the guide first, so a failure writes neither file.
const guide = file('docs/guide/configuration.md')
const text = readFileSync(guide, 'utf8')
const line = /^([ \t]*"\$schema": )".*"/m
if (!line.test(text)) throw new Error(`${guide}: no "$schema" line to update`)

writeFileSync(file('schema/config.json'), `${JSON.stringify(configJsonSchema(), null, 2)}\n`)
writeFileSync(
  guide,
  text.replace(line, (_, lead) => `${lead}"${CONFIG_SCHEMA_URL}"`),
)
