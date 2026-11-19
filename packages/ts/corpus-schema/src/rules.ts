/**
 * Profile rules: the cross-record checks a corpus package ships for the corpora that extend it, which
 * JSON Schema cannot express one record at a time (see "Profile rules" in the corpus-schema spec,
 * packages/conformance/corpus-schema/SPEC.md).
 *
 * A package names its rules module in package.json, as `"corpus-schema": { "rules": "./rules.js" }`,
 * a path inside the package. The module exports `check(corpus: LoadedCorpus): Problem[]`.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CorpusModel, LoadedCorpus } from './load.ts'

/**
 * One problem a rule reports. `file` is relative to the root of the corpus being validated, and
 * `field` is a field name, or a word in parentheses such as `(record)` for a problem in no field.
 *
 * @experimental
 */
export interface Problem {
  /** The file, relative to the corpus root. */
  file: string
  /** The field, or a word in parentheses. */
  field: string
  /** What is wrong. */
  message: string
  /** Defaults to `error`. */
  severity?: 'error' | 'warning'
}

/**
 * The problems the rules reported, one `<file>: <field>: <message>` line each.
 *
 * @experimental
 */
export interface RulesReport {
  /** The problems without `severity: 'warning'`, and each rules module that failed. */
  errors: string[]
  /** The problems with `severity: 'warning'`. */
  warnings: string[]
}

const line = (p: Problem): string => `${p.file}: ${p.field}: ${p.message}`
const isProblem = (v: unknown): v is Problem => {
  const p = v as Partial<Problem> | null
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.file === 'string' &&
    typeof p.field === 'string' &&
    typeof p.message === 'string' &&
    (p.severity === undefined || p.severity === 'error' || p.severity === 'warning')
  )
}

/** The models of every corpus the loaded one extends, at any depth, each once. */
function extended(model: LoadedCorpus): CorpusModel[] {
  const out = new Map<string, CorpusModel>()
  const visit = (m: CorpusModel): void => {
    for (const key of Object.values(m.extends)) {
      const parent = model.corpora[key]
      if (parent === undefined || out.has(key)) continue
      out.set(key, parent)
      visit(parent)
    }
  }
  visit(model)
  return [...out.values()]
}

/** The folder of the package whose package.json is nearest at or above `dir`. */
function packageDir(dir: string): string | undefined {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, 'package.json'))) return d
    if (dirname(d) === d) return undefined
  }
}

/**
 * Run the rules of every corpus `model` extends, transitively. Rules come only from `extends`
 * packages: not from the corpus itself, not from a referenced corpus, and not from a corpus that
 * is in no package. A problem with a rules module is an error, not a thrown exception.
 *
 * Call it once the corpus passes `validateCorpus` with no errors, as the `validate` command does.
 * It imports and runs code from the packages the corpus extends, so it has the trust of installing
 * them (see Trust in the README).
 *
 * @experimental
 */
export async function runRules(model: LoadedCorpus): Promise<RulesReport> {
  const report: RulesReport = { errors: [], warnings: [] }
  const fail = (message: string): void => {
    report.errors.push(`.: (rules): ${message}`)
  }
  const seen = new Set<string>()
  for (const parent of extended(model)) {
    const pkgDir = packageDir(parent.root)
    if (pkgDir === undefined || parent.identity === null) continue
    let rules: unknown
    try {
      const json = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
        'corpus-schema'?: { rules?: unknown }
      }
      rules = json['corpus-schema']?.rules
    } catch {
      continue
    }
    if (rules === undefined) continue
    const who = parent.name
    if (typeof rules !== 'string' || !rules.startsWith('./')) {
      fail(`${who}: "corpus-schema.rules" in package.json must be a path starting ./`)
      continue
    }
    let file: string
    try {
      file = realpathSync(resolve(pkgDir, rules))
    } catch {
      fail(`${who}: rules module ${rules} does not exist`)
      continue
    }
    const inside = relative(realpathSync(pkgDir), file)
    if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      fail(`${who}: rules module ${rules} is outside its package`)
      continue
    }
    if (seen.has(file)) continue
    seen.add(file)
    let problems: unknown
    try {
      const mod = (await import(pathToFileURL(file).href)) as { check?: unknown }
      if (typeof mod.check !== 'function') {
        fail(`${who}: rules module ${rules} exports no check function`)
        continue
      }
      problems = await mod.check(model)
    } catch (e) {
      fail(`${who}: rules module ${rules} failed (${e instanceof Error ? e.message : String(e)})`)
      continue
    }
    if (!Array.isArray(problems) || !problems.every(isProblem)) {
      fail(`${who}: rules module ${rules} must return an array of problems`)
      continue
    }
    for (const p of problems)
      (p.severity === 'warning' ? report.warnings : report.errors).push(line(p))
  }
  return report
}
