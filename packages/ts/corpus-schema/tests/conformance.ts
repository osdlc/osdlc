/**
 * The corpus-schema conformance suite, packages/conformance/corpus-schema/suite.json: reading it and
 * running one case. conformance.test.ts runs every case, and conformance-write.ts writes their
 * expected values.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { validateCorpus } from '../src/index.ts'

/** The family's folder: SPEC.md, suite.json and the corpora the cases name. */
export const FAMILY_DIR = join(import.meta.dirname, '../../../conformance/corpus-schema')
// Spelled out in full: the conformance check looks for this path in the tests.
export const SUITE_PATH = join(import.meta.dirname, '../../../conformance/corpus-schema/suite.json')

/** The sections this package runs. */
export const SECTIONS = ['validate']

/** The `<file>: <field>` prefixes of the errors and warnings, each sorted and once. */
export interface Outcome {
  errors: string[]
  warnings: string[]
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

/** Validate one case's corpus. */
export function run(input: Case['input']): Outcome {
  const report = validateCorpus(join(FAMILY_DIR, input.corpus))
  return { errors: prefixes(report.errors), warnings: prefixes(report.warnings) }
}
