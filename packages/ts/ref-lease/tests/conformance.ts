/**
 * Runs the ref-lease conformance suite's cases against this package.
 *
 * `packages/conformance/ref-lease/suite.json` is the family's suite, and this
 * package is its reference implementation. `conformance-write.ts` calls
 * {@link run} to write each case's `expect`, and `conformance.test.ts` calls it
 * to check them, so the two cannot drift.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { canonicalJson } from '../src/canonical-json.ts'
import { fetchFailure, pushOutcome } from '../src/classify.ts'

/** The suite file, by its path in the repository. */
export const SUITE_PATH = join(import.meta.dirname, '../../../conformance/ref-lease/suite.json')

export interface Case {
  name: string
  input: Record<string, unknown>
  expect: Record<string, unknown>
}

export interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

export function readSuite(): Suite {
  return JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite
}

/** The keys a case may set. */
export const CASE_KEYS = ['name', 'input', 'expect']

/** Every section this implementation runs, with the keys its `input` may hold. */
export const INPUT_KEYS: Record<string, string[]> = {
  push_outcome: ['flag', 'rejection', 'keepsSha'],
  fetch_failure: ['stderr'],
  canonical_json: ['value'],
}

/**
 * Throws unless `section` is one this implementation runs and `raw` holds
 * exactly the keys that section's `input` may hold.
 */
export function checkInput(section: string, raw: Record<string, unknown>): void {
  const allowed = INPUT_KEYS[section]
  if (allowed === undefined) {
    throw new Error(`the suite has a section this implementation does not know: ${section}`)
  }
  const keys = Object.keys(raw).sort()
  if (JSON.stringify(keys) !== JSON.stringify([...allowed].sort())) {
    throw new Error(`${section}: input keys are ${keys.join(', ')}, not ${allowed.join(', ')}`)
  }
}

type Flag = Parameters<typeof pushOutcome>[0]['flag']
type Rejection = NonNullable<Parameters<typeof pushOutcome>[0]['rejection']>

/** What a case gives: its `expect`. */
export function run(section: string, input: Record<string, unknown>): Record<string, unknown> {
  checkInput(section, input)
  switch (section) {
    case 'push_outcome': {
      const rejection = input['rejection'] as string | null
      const ref = {
        flag: input['flag'] as Flag,
        ...(rejection === null ? {} : { rejection: rejection as Rejection }),
      }
      return { outcome: pushOutcome(ref, input['keepsSha'] as boolean) }
    }
    case 'fetch_failure':
      return { failure: fetchFailure(input['stderr'] as string) }
    case 'canonical_json':
      return { json: canonicalJson(input['value']) }
    default:
      throw new Error(`unknown section ${section}`)
  }
}
