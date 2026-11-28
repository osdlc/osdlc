// Writes schemas/descriptor-1.json from the descriptor schema in
// src/descriptor/schema.ts. Runs on workstation-cleaner's source, which imports no
// workspace package, so nothing needs a build.
// tests/descriptor-schema.test.ts fails when the checked-in file is stale:
// run `pnpm run write:descriptor-schema` and commit it.
import { realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { descriptorJsonSchema } from '../src/descriptor/schema.ts'

/** The text of schemas/descriptor-1.json. */
export const descriptorSchemaText = (): string =>
  `${JSON.stringify(descriptorJsonSchema(), null, 2)}\n`

/** The checked-in file. */
export const DESCRIPTOR_SCHEMA_FILE = fileURLToPath(
  new URL('../schemas/descriptor-1.json', import.meta.url),
)

// Node gives the main module's URL as its real path, but argv[1] as typed.
const main = process.argv[1]
if (main !== undefined && realpathSync(main) === fileURLToPath(import.meta.url)) {
  writeFileSync(DESCRIPTOR_SCHEMA_FILE, descriptorSchemaText())
}
