/**
 * markdown-db command line (docs/standards/S-GFFY-markdown-db.md). Version 0 defines `validate`.
 *
 *   node src/markdown-db/cli.ts validate [--fix] <folder>
 *
 * Validates every corpus at or below the folder. Exits 1 on any error.
 */
import { existsSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { findCorpora, validateCorpus } from './validate.ts'

const args = process.argv.slice(2)
const fix = args.includes('--fix')
const [verb, dir, ...extra] = args.filter((a) => a !== '--fix')
if (verb !== 'validate' || dir === undefined || extra.length > 0) {
  process.stderr.write('usage: cli.ts validate [--fix] <folder>\n')
  process.exit(2)
}
const base = resolve(dir)
const roots = existsSync(base) && statSync(base).isDirectory() ? findCorpora(base) : []
if (roots.length === 0) {
  process.stderr.write(`${dir}: no markdown-db root file at or below it\n`)
  process.exit(1)
}

let failed = false
const ids = new Map<string, string>()
for (const root of roots) {
  const where = relative(process.cwd(), root) || '.'
  const report = validateCorpus(root, { fix })
  if (roots.length > 1) process.stderr.write(`${where}:\n`)
  for (const f of report.fixed) process.stdout.write(`fixed: ${f}\n`)
  for (const w of report.warnings) process.stderr.write(`warning: ${w}\n`)
  for (const e of report.errors) process.stderr.write(`${e}\n`)
  if (report.id !== undefined) {
    const other = ids.get(report.id)
    if (other !== undefined)
      process.stderr.write(`warning: ${where}: id: "${report.id}" is also ${other}'s id\n`)
    ids.set(report.id, where)
  }
  if (report.errors.length > 0) {
    failed = true
    process.stderr.write(`${report.name}: ${report.errors.length} error(s)\n`)
    continue
  }
  const counts = [...report.records].map(([type, m]) => `${m.size} ${type}`).join(', ')
  process.stdout.write(`ok: ${report.name}: ${counts === '' ? 'no types' : counts}\n`)
}
process.exit(failed ? 1 : 0)
