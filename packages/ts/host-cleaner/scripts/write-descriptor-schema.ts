// Writes schemas/descriptor-1.json from the descriptor schema in
// src/descriptor/schema.ts. Runs on host-cleaner's source, so host-cleaner
// needs no build, but its workspace dependencies (@osdlc/repo-cleaner and the
// others) must be built, as for the tests.
// tests/descriptor-schema.test.ts fails when the checked-in file is stale:
// run `pnpm run write:descriptor-schema` and commit it.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { descriptorJsonSchema } from '../src/descriptor/schema.ts'

/** The text of schemas/descriptor-1.json. */
export const descriptorSchemaText = (): string =>
  `${JSON.stringify(descriptorJsonSchema(), null, 2)}\n`

/** The checked-in file. */
export const DESCRIPTOR_SCHEMA_FILE = fileURLToPath(
  new URL('../schemas/descriptor-1.json', import.meta.url),
)

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(DESCRIPTOR_SCHEMA_FILE, descriptorSchemaText())
}
