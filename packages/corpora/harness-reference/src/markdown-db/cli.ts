/**
 * markdown-db command line. Only `validate` is defined in spec version 0.
 *
 *   node src/markdown-db/cli.ts validate <corpus-dir>
 */
import { resolve } from 'node:path'
import { validateCorpus } from './validate.ts'

const [verb, dir] = process.argv.slice(2)
if (verb !== 'validate' || dir === undefined) {
  process.stderr.write('usage: cli.ts validate <corpus-dir>\n')
  process.exit(2)
}
const { entries, errors } = validateCorpus(resolve(dir))
if (errors.length > 0) {
  for (const e of errors) process.stderr.write(`${e}\n`)
  process.stderr.write(`\n${errors.length} error(s)\n`)
  process.exit(1)
}
const counts = [...entries].map(([type, m]) => `${m.size} ${type}`).join(', ')
process.stdout.write(`ok: ${counts}\n`)
