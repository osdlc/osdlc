// Writes schema/config.json from the built config schema. Run after `tsc`;
// tests/config-schema.test.ts fails when the checked-in file is stale.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { configJsonSchema } from '../dist/config.js'

const out = fileURLToPath(new URL('../schema/config.json', import.meta.url))
writeFileSync(out, `${JSON.stringify(configJsonSchema(), null, 2)}\n`)
