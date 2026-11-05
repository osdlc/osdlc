/**
 * Render the alpha corpus into static HTML pages.
 *
 *   node src/alpha/generate.ts [--out <dir>]    write the site (default: dist/)
 *
 * See render.ts for the pages. Exits 1, leaving any earlier output in place,
 * when the corpus does not validate.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

import { ROOT, load } from './load.ts'
import { renderSite } from './render.ts'

const { values } = parseArgs({ options: { out: { type: 'string' } } })
const OUT = values.out ?? join(ROOT, 'dist')

const { dataset, errors } = load()
if (errors.length > 0 || dataset === null) {
  for (const e of errors) process.stderr.write(`${e}\n`)
  process.stderr.write('\nThe alpha corpus does not validate; run `node src/alpha/validate.ts`.\n')
  process.exit(1)
}

// Only the default output is cleared, so a stale page never survives a rename.
if (values.out === undefined) rmSync(OUT, { recursive: true, force: true })
for (const [rel, content] of renderSite(dataset)) {
  const full = join(OUT, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
process.stdout.write(`wrote ${OUT}\n`)
