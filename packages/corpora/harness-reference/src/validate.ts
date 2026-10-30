/**
 * Validate the harness reference bundle (OKF v0.2).
 *
 *   node src/validate.ts                  check bundle/ and that schema/*.json is current
 *   node src/validate.ts --write-schema   rewrite schema/*.json from src/schema.ts
 *
 * Exits 1 on any error.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'

import { BUNDLE, ROOT, load } from './load.ts'
import { JSON_SCHEMAS } from './schema.ts'

function schemaText(schema: z.ZodType): string {
  return `${JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2)}\n`
}

/** Write schema/*.json, or report each one that differs from src/schema.ts. */
export function checkSchemas(schemaDir: string, write: boolean): string[] {
  const errors: string[] = []
  for (const [name, schema] of Object.entries(JSON_SCHEMAS)) {
    const path = join(schemaDir, name)
    const want = schemaText(schema)
    if (write) {
      writeFileSync(path, want)
      continue
    }
    // Compared as data, so a formatter's whitespace never reads as stale.
    let have: unknown = null
    try {
      have = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      // reported below as stale
    }
    if (JSON.stringify(have) !== JSON.stringify(JSON.parse(want)))
      errors.push(`schema/${name} is stale: run \`node src/validate.ts --write-schema\``)
  }
  return errors
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { 'write-schema': { type: 'boolean' } } })
  const errors = checkSchemas(join(ROOT, 'schema'), values['write-schema'] === true)
  const { dataset, errors: dataErrors } = load(BUNDLE)
  errors.push(...dataErrors)

  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`${e}\n`)
    process.stderr.write(`\n${errors.length} error(s)\n`)
    process.exit(1)
  }
  if (dataset) {
    const observations = dataset.facts.reduce((n, f) => n + f.observations.length, 0)
    process.stdout.write(
      `ok: ${dataset.harnesses.length} harnesses, ${dataset.subjects.length} subjects, ${dataset.facts.length} facts, ${observations} observations\n`,
    )
  }
}
