/** Corpora written to a scratch folder for each test, for the tests of extends, references and uses. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, beforeEach } from 'vitest'

import { validateCorpus } from '../src/validate.ts'

/** The root-file keys a test sets. `level` defaults to 2; null leaves it out. */
export interface Keys {
  level?: 1 | 2 | null
  extends?: Record<string, string>
  references?: Record<string, string>
  uses?: string | string[]
  extra?: string
}

const mapping = (key: string, m: Record<string, string> | undefined): string =>
  m === undefined || Object.keys(m).length === 0
    ? ''
    : `${key}:\n${Object.entries(m)
        .map(([k, v]) => `  ${k}: "${v}"\n`)
        .join('')}`

/** Hooks that make a fresh scratch folder for each test, and helpers that write into it. */
export function scratch(name: string) {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), `corpus-schema-${name}-`))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })
  const at = (rel = ''): string => join(dir, rel)
  const put = (rel: string, text: string): void => {
    mkdirSync(dirname(at(rel)), { recursive: true })
    writeFileSync(at(rel), text)
  }
  const read = (rel: string): string => readFileSync(at(rel), 'utf8')
  /** A root file at `rel`. */
  const root = (rel: string, keys: Keys = {}): void => {
    const level = keys.level === undefined ? 2 : keys.level
    const uses =
      keys.uses === undefined
        ? ''
        : `uses: ${typeof keys.uses === 'string' ? keys.uses : `[${keys.uses.join(', ')}]`}\n`
    put(
      `${rel}/${basename(rel)}.corpus-schema.yaml`,
      `corpus-schema: 0\n${level === null ? '' : `level: ${level}\n`}${keys.extra ?? ''}${mapping('extends', keys.extends)}${mapping('references', keys.references)}${uses}`,
    )
  }
  /** A corpus at `rel` with a `principles` type and one record, `Be Kind`. */
  const org = (rel = 'org'): void => {
    root(rel)
    put(
      `${rel}/principles/principles.schema.yaml`,
      'type: object\nrequired: [statement]\nproperties:\n  statement: { type: string }\n',
    )
    put(`${rel}/principles/Be Kind.md`, '---\nstatement: Care.\n---\n')
  }
  const report = (rel = 'c') => validateCorpus(at(rel))
  const errors = (rel = 'c'): string[] => report(rel).errors
  const warnings = (rel = 'c'): string[] => report(rel).warnings
  return { at, put, read, root, org, report, errors, warnings }
}

export const has = (lines: string[], part: string): boolean => lines.some((l) => l.includes(part))
