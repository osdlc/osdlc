/**
 * Runs the markdown-contract conformance suite's cases against this package.
 *
 * `packages/conformance/markdown-contract/suite.json` is the family's suite,
 * and this package is its reference implementation. `conformance-write.ts`
 * calls {@link run} to write each case's `expect`, and `conformance.test.ts`
 * calls it to check them, so the two cannot drift. `harness.ts` also reads the
 * suite for the documents and expected findings of the fixtures it shares.
 *
 * The package is imported by name, so the generator, which runs under plain
 * `node`, loads the built `dist/`. The tests alias the name to `src/`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Finding } from '@osdlc/markdown-contract'
import { loadContract } from '@osdlc/markdown-contract/declarative'

/** The suite file, by its path in the repository. */
export const SUITE_PATH = join(
  import.meta.dirname,
  '../../../conformance/markdown-contract/suite.json',
)

/** One finding as the suite spells it. `line` and `hint` are left out when the finding has none. */
export interface SuiteFinding {
  id: string
  level: Finding['level']
  line?: number
  hint?: string
}

export interface Case {
  name: string
  input: Record<string, unknown>
  expect: { findings: SuiteFinding[] }
  platforms?: string[]
  skip?: Record<string, string>
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
export const CASE_KEYS = ['name', 'input', 'expect', 'platforms', 'skip']

/** Every section this implementation runs, with the keys its `input` may hold. */
export const INPUT_KEYS: Record<string, string[]> = {
  validate: ['contract', 'source'],
}

/** The path every case validates with. */
const PATH = 'fixture.md'

/**
 * Throws unless `section` is one this implementation runs and `raw` holds
 * exactly the keys that section's `input` may hold, each a string.
 */
export function checkInput(section: string, raw: Record<string, unknown>): void {
  const allowed = INPUT_KEYS[section]
  if (allowed === undefined) {
    throw new Error(`the suite has a section this implementation does not know: ${section}`)
  }
  const unknown = Object.keys(raw).filter((k) => !allowed.includes(k))
  if (unknown.length > 0) throw new Error(`${section}: unknown input keys ${unknown.join(', ')}`)
  for (const key of allowed) {
    if (typeof raw[key] !== 'string') throw new Error(`${section}: input.${key} is not a string`)
  }
}

/** The `expect` a case's input gives. */
export function run(
  section: string,
  raw: Record<string, unknown>,
): { expect: { findings: SuiteFinding[] } } {
  checkInput(section, raw)
  const contract = loadContract(raw['contract'] as string)
  const { findings } = contract.validate(raw['source'] as string, { path: PATH })
  return {
    expect: {
      findings: findings.map((f) => ({
        id: f.id,
        level: f.level,
        ...(f.pos === undefined ? {} : { line: f.pos.line }),
        ...(f.hint === undefined ? {} : { hint: f.hint }),
      })),
    },
  }
}
