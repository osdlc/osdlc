/**
 * The corpus-schema command line, for the corpus-schema spec
 * (packages/conformance/corpus-schema/SPEC.md).
 *
 *   corpus-schema validate [--fix] [--strict] <folder>...
 *   corpus-schema sync [<folder>...]
 *   corpus-schema types [--out <file>] <folder>
 *
 * `validate` checks every corpus at or below each folder. `sync` writes each one's `_references/`
 * copies, the folder defaulting to `.`. Exits 1 on any error, or with `--strict` on any warning,
 * and 2 on bad usage.
 */
import { existsSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { loadCorpus } from './load.ts'
import { namedRoots, syncCorpus } from './sync.ts'
import { generateTypes } from './types.ts'
import { findCorpora, validateCorpus } from './validate.ts'

const USAGE =
  'usage: corpus-schema validate [--fix] [--strict] <folder>...\n       corpus-schema sync [<folder>...]\n       corpus-schema types [--out <file>] <folder>\n'
const usage = (): never => {
  process.stderr.write(USAGE)
  process.exit(2)
}

const parse = () => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: { fix: { type: 'boolean' }, strict: { type: 'boolean' }, out: { type: 'string' } },
    })
  } catch {
    return usage()
  }
}
const parsed = parse()
const fix = parsed.values.fix === true
const strict = parsed.values.strict === true
const [verb, ...args] = parsed.positionals
const out = parsed.values.out
if (verb === 'types') {
  if (args.length !== 1 || fix || strict) usage()
  const [dir] = args as [string]
  const found = existsSync(dir) && statSync(dir).isDirectory() ? findCorpora(dir) : []
  if (found.length !== 1) {
    const how = found.length === 0 ? 'no' : 'more than one'
    process.stderr.write(`${dir}: ${how} corpus root file at or below it\n`)
    process.exit(1)
  }
  const model = loadCorpus(found[0] as string, { bodies: false })
  for (const e of model.errors) process.stderr.write(`${e}\n`)
  const text = generateTypes(model)
  if (model.errors.length > 0) process.exit(1)
  try {
    if (out === undefined) await new Promise((done) => process.stdout.write(text, done))
    else writeFileSync(out, text)
  } catch (e) {
    process.stderr.write(`${out ?? 'stdout'}: cannot write (${(e as Error).message})\n`)
    process.exit(1)
  }
  process.exit(0)
}
if (out !== undefined) usage()
if (verb === 'validate' ? args.length === 0 : verb !== 'sync' || fix || strict) usage()
const dirs = args.length === 0 ? ['.'] : args

let failed = false
const roots = new Set<string>()
for (const dir of dirs) {
  let found: string[] = []
  try {
    found = existsSync(dir) && statSync(dir).isDirectory() ? findCorpora(dir) : []
  } catch (e) {
    // An unreadable folder: findCorpora's message is one line.
    process.stderr.write(`${(e as Error).message}\n`)
    failed = true
    continue
  }
  if (found.length === 0) {
    process.stderr.write(
      `${dir}: no root file (<name>.corpus-schema.md, .yaml or .json) at or below it\n`,
    )
    failed = true
  }
  for (const root of found) roots.add(resolve(root))
}

const where = (root: string): string => relative(process.cwd(), root) || '.'

if (verb === 'sync') {
  // A corpus syncs after the corpora found here that it extends or references, so it reads their
  // fresh copies.
  const byReal = new Map([...roots].map((r) => [realpathSync(r), r]))
  const seen = new Set<string>()
  const order: string[] = []
  const visit = (real: string): void => {
    if (seen.has(real)) return
    seen.add(real)
    for (const p of namedRoots(byReal.get(real) as string)) if (byReal.has(p)) visit(p)
    order.push(real)
  }
  for (const real of byReal.keys()) visit(real)
  for (const root of order.map((r) => byReal.get(r) as string)) {
    const report = syncCorpus(root)
    if (roots.size > 1) process.stderr.write(`${where(root)}:\n`)
    for (const f of report.removed) process.stdout.write(`removed: ${f}\n`)
    for (const f of report.written) process.stdout.write(`wrote: ${f}\n`)
    for (const e of report.errors) process.stderr.write(`${e}\n`)
    if (report.errors.length > 0) {
      failed = true
      process.stderr.write(`${report.name}: ${report.errors.length} error(s)\n`)
      continue
    }
    const { name, written, removed } = report
    process.stdout.write(`synced: ${name}: ${written.length} written, ${removed.length} removed\n`)
  }
} else {
  const ids = new Map<string, string>()
  for (const root of roots) {
    const report = validateCorpus(root, { fix })
    if (roots.size > 1) process.stderr.write(`${where(root)}:\n`)
    for (const f of report.fixed) process.stdout.write(`fixed: ${f}\n`)
    for (const w of report.warnings) process.stderr.write(`warning: ${w}\n`)
    for (const e of report.errors) process.stderr.write(`${e}\n`)
    let warnings = report.warnings.length
    if (report.id !== undefined) {
      const other = ids.get(report.id)
      if (other !== undefined) {
        process.stderr.write(`warning: ${where(root)}: id: "${report.id}" is also ${other}'s id\n`)
        warnings += 1
      }
      ids.set(report.id, where(root))
    }
    if (report.errors.length > 0) {
      failed = true
      process.stderr.write(`${report.name}: ${report.errors.length} error(s)\n`)
      continue
    }
    if (strict && warnings > 0) {
      failed = true
      process.stderr.write(`${report.name}: ${warnings} warning(s), and --strict fails on them\n`)
      continue
    }
    const counts = [...report.records].map(([type, m]) => `${m.size} ${type}`).join(', ')
    process.stdout.write(`ok: ${report.name}: ${counts === '' ? 'no types' : counts}\n`)
  }
}
// Set the code and let stdout drain: process.exit can cut off output to a pipe.
process.exitCode = failed ? 1 : 0
