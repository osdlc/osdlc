/**
 * The corpus-schema conformance suite, packages/conformance/corpus-schema/suite.json: reading it and
 * running one case. conformance.test.ts runs every case, and conformance-write.ts writes their
 * expected values.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { validateCorpus } from '../src/index.ts'

/** The family's folder: SPEC.md, suite.json and the corpora the cases name. */
export const FAMILY_DIR = join(import.meta.dirname, '../../../conformance/corpus-schema')
// Spelled out in full: the conformance check looks for this path in the tests.
export const SUITE_PATH = join(import.meta.dirname, '../../../conformance/corpus-schema/suite.json')

/** The sections this package runs. */
export const SECTIONS = ['validate', 'strict', 'fix']

/** The `<file>: <field>` prefixes of the errors and warnings, each sorted and once. */
export interface Outcome {
  errors: string[]
  warnings: string[]
  /** In the strict section only: whether `validate --strict` passes the corpus. */
  passes?: boolean
  /** In the fix section only: the files `validate --fix` rewrote, sorted. */
  fixed?: string[]
}

export interface Case {
  name: string
  /** `corpus` is a folder relative to FAMILY_DIR. */
  input: { corpus: string }
  expect?: Outcome
}

export interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

export const readSuite = (): Suite => JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite

// The spec fixes the `<file>: <field>` prefix of a problem, not its message text or order.
const prefix = (line: string): string => line.split(': ', 2).join(': ')
const prefixes = (lines: string[]): string[] => [...new Set(lines.map(prefix))].sort()

/** Validate one case's corpus, as the section says. `fix` rewrites a copy, never the case. */
export function run(section: string, input: Case['input']): Outcome {
  if (section === 'fix') {
    const dir = mkdtempSync(join(tmpdir(), 'corpus-schema-fix-'))
    try {
      cpSync(join(FAMILY_DIR, input.corpus), dir, { recursive: true })
      const report = validateCorpus(dir, { fix: true })
      return {
        errors: prefixes(report.errors),
        warnings: prefixes(report.warnings),
        fixed: [...report.fixed].sort(),
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const report = validateCorpus(join(FAMILY_DIR, input.corpus))
  const outcome: Outcome = { errors: prefixes(report.errors), warnings: prefixes(report.warnings) }
  // `--strict` fails on a warning as on an error.
  if (section === 'strict')
    outcome.passes = report.errors.length === 0 && report.warnings.length === 0
  return outcome
}
