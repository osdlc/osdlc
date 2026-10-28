import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { HOMES, TIER_KINDS, envVars, overrideVars } from '../src/index.ts'
import type { Home } from '../src/index.ts'
import { STUB_BASES, envResolve, readSuite, resolveDir, run, scratchDir } from './conformance.ts'
import type { Case, EnvInput } from './conformance.ts'

/**
 * Runs `packages/conformance/tiered-dirs/suite.json`, the cases this package
 * and the Rust `tiered-dirs` crate must agree on. `conformance.ts` holds the
 * runner, which also writes the suite's expected values. The tests here add
 * what the suite's values cannot say on their own: the joined path, the
 * Windows rule for `env`, and that every axis of the API has a case.
 */

const suite = readSuite()
const sections = suite.sections

/** Whether a case runs on this host. */
function runsHere(c: Case): boolean {
  if (c.skip?.['ts'] !== undefined) return false
  if (c.platforms === undefined) return true
  return c.platforms.includes(process.platform === 'win32' ? 'windows' : 'unix')
}

/** `<base>/<relative>`; an empty `relative` is the base itself. */
function expectedPath(base: string, relative: string): string {
  return relative === '' ? base : join(base, ...relative.split('/'))
}

const KNOWN = ['resolve', 'scratch', 'env', 'convention', 'rejected_segment', 'rejected_convention']

describe('conformance suite', () => {
  test('names no section this implementation does not run', () => {
    expect(Object.keys(sections).filter((s) => !KNOWN.includes(s))).toEqual([])
  })

  for (const [name, section] of Object.entries(sections)) {
    describe(name, () => {
      for (const c of section.cases) {
        test.skipIf(!runsHere(c))(c.name, () => {
          if (name === 'env') {
            // `bases` lists what moved from a bare system's, so a host whose
            // native table differs from Linux's (macOS) still compares.
            // Windows ignores the convention and XDG_*, so there a
            // `windows_native` case resolves as a bare system does.
            const { bases, bare } = envResolve(c.input as unknown as EnvInput)
            const windows = process.platform === 'win32'
            const moved = windows ? {} : (c.expect as { bases: object }).bases
            expect(bases).toEqual({ ...bare, ...moved })
            return
          }
          const got = run(name, c.input)
          expect(got).toEqual(
            c.error === undefined ? { expect: c.expect } : { error: { kind: c.error.kind } },
          )
        })
      }
    })
  }
})

describe('suite coverage', () => {
  type ResolveInput = Parameters<typeof resolveDir>[0]
  const resolves = sections['resolve']!.cases.map((c) => ({
    name: c.name,
    input: c.input as unknown as ResolveInput,
    relative: (c.expect as { relative: string }).relative,
  }))
  const scratches = sections['scratch']!.cases.map((c) => ({
    input: c.input as unknown as Parameters<typeof scratchDir>[0],
    relative: (c.expect as { relative: string }).relative,
  }))

  const shapeOf = (n: { scope_kind: string | null; app: string | null }): string =>
    n.scope_kind !== null
      ? n.app === null
        ? 'scope'
        : 'scope+app'
      : n.app === null
        ? 'plain'
        : 'app'
  const SHAPES = ['plain', 'app', 'scope', 'scope+app']

  test.each(resolves.map((c) => [c.name, c] as const))('path: %s', (_name, c) => {
    expect(resolveDir(c.input).path).toBe(
      expectedPath(STUB_BASES[c.input.home as Home], c.relative),
    )
  })

  test('scratch paths join onto the scratch base', () => {
    for (const c of scratches)
      expect(scratchDir(c.input).path).toBe(expectedPath(STUB_BASES.scratch, c.relative))
  })

  // An invariant, not just a shape. A standalone tool installed in a third
  // party's repository must not write under the vendor's directory, and
  // scratch belongs to no vendor at all.
  test('nothing outside the suite carries the vendor segment', () => {
    for (const c of resolves.filter((x) => x.input.tier === 'standalone')) {
      expect(c.relative).not.toContain(c.input.vendor)
    }
    for (const c of scratches) expect(c.relative).not.toContain(c.input.vendor)
  })

  test('every tier x home pair has a case', () => {
    const covered = new Set(resolves.map((c) => `${c.input.tier}/${c.input.home}`))
    for (const tier of TIER_KINDS)
      for (const home of HOMES) expect(covered.has(`${tier}/${home}`)).toBe(true)
  })

  test('every tier x shape pair has a case', () => {
    const covered = new Set(resolves.map((c) => `${c.input.tier}/${shapeOf(c.input)}`))
    for (const tier of TIER_KINDS)
      for (const shape of SHAPES) expect(covered.has(`${tier}/${shape}`)).toBe(true)
  })

  test('every scratch shape has a case', () => {
    const covered = new Set(scratches.map((c) => shapeOf(c.input)))
    for (const shape of SHAPES) expect(covered.has(shape)).toBe(true)
  })

  test('the suite names exactly the tiers this package builds', () => {
    expect([...new Set(resolves.map((c) => c.input.tier))].sort()).toEqual([...TIER_KINDS].sort())
  })

  test('every override variable has an env case', () => {
    const cases = sections['env']!.cases
    const prefix = (cases[0]!.input as { env_prefix: string }).env_prefix
    const vars = envVars(prefix)
    const covered = new Set(cases.flatMap((c) => Object.keys((c.input as { env: object }).env)))
    for (const name of [...overrideVars(vars), vars.convention])
      expect(covered.has(name)).toBe(true)
  })
})
