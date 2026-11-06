/**
 * Validate the alpha corpus (an OKF v0.2 bundle).
 *
 *   node src/alpha/validate.ts                  check corpora/alpha/ and that schema/alpha/*.json is current
 *   node src/alpha/validate.ts --write-schema   rewrite schema/alpha/*.json from src/alpha/schema.ts
 *
 * Exits 1 on any error.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'

import { CORPUS, ROOT, load } from './load.ts'
import { JSON_SCHEMAS } from './schema.ts'

function schemaText(schema: z.ZodType): string {
  return `${JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2)}\n`
}

/** Write schema/alpha/*.json, or report each one that differs from src/alpha/schema.ts. */
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
      errors.push(
        `schema/alpha/${name} is stale: run \`node src/alpha/validate.ts --write-schema\``,
      )
  }
  return errors
}

// `import.meta.main` exists only from Node 24.2, so compare the entry path instead.
if (import.meta.filename === process.argv[1]) {
  const { values } = parseArgs({ options: { 'write-schema': { type: 'boolean' } } })
  const errors = checkSchemas(join(ROOT, 'schema', 'alpha'), values['write-schema'] === true)
  const { dataset, errors: dataErrors } = load(CORPUS)
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
