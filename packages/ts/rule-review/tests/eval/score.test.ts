/**
 * The scoring rules, asserted without a model.
 *
 * Every test here builds `Finding[]` by hand. That is the point of splitting
 * scoring from running: the rules that decide whether a judge did well are
 * themselves code, and code that grades other code should be the part you
 * trust most.
 */
import { describe, expect, test } from 'vitest'

import type { Finding } from '../../src/types.ts'
import { gatingFailures, scoreCase, type EvalCase } from './score.ts'

function finding(over: Partial<Finding> = {}): Finding {
  return {
    sourceId: 'root',
    sourceKind: 'instruction',
    sourcePath: 'CLAUDE.md',
    file: 'src/parse.ts',
    evidence: 'input: any',
    why: 'the `any` type is forbidden',
    severity: 'violation',
    ...over,
  }
}

const CASE: EvalCase = {
  name: 't',
  expected: [{ file: 'src/parse.ts', severity: 'violation', evidence: 'any' }],
  clean: ['src/clean.ts'],
}

describe('scoreCase — matching', () => {
  test('a finding that meets every constraint satisfies the expectation', () => {
    const score = scoreCase([finding()], CASE)

    expect(score.matched).toHaveLength(1)
    expect(score.missed).toEqual([])
    expect(score.recall).toBe(1)
    expect(score.precision).toBe(1)
  })

  test('the right breach on the wrong file does not count', () => {
    const score = scoreCase([finding({ file: 'src/other.ts' })], CASE)

    expect(score.matched).toEqual([])
    expect(score.missed).toHaveLength(1)
    // Not spurious — the case never claimed src/other.ts was clean, so this is
    // an unasserted finding, not an invented one.
    expect(score.extra).toHaveLength(1)
    expect(score.spurious).toEqual([])
  })

  test('a severity outside the accepted set does not satisfy', () => {
    const score = scoreCase([finding({ severity: 'drift' })], CASE)
    expect(score.missed).toHaveLength(1)
  })

  test('severity omitted from an expectation accepts any grade', () => {
    const loose: EvalCase = { name: 't', expected: [{ file: 'src/parse.ts' }], clean: [] }
    expect(scoreCase([finding({ severity: 'drift' })], loose).matched).toHaveLength(1)
  })

  test('evidence matches on substring, case-insensitively', () => {
    const c: EvalCase = {
      name: 't',
      expected: [{ file: 'src/parse.ts', evidence: 'CHILD_process' }],
      clean: [],
    }
    expect(scoreCase([finding({ evidence: 'node:child_process' })], c).matched).toHaveLength(1)
  })

  test('an expectation consumes at most one finding', () => {
    // Two findings, one expectation: the surplus is reported as `extra`
    // rather than silently satisfying the expectation twice.
    const score = scoreCase([finding(), finding({ evidence: 'any again' })], CASE)

    expect(score.matched).toHaveLength(1)
    expect(score.extra).toHaveLength(1)
  })

  test('a restated breach does not cost precision', () => {
    // Nested rule sources judge the same file independently and by design, so
    // one breach can be reported more than once. Charging the judge for the
    // second report would penalise the fan-out, not a mistake.
    const score = scoreCase([finding(), finding({ evidence: 'any again' })], CASE)

    expect(score.precision).toBe(1)
  })

  test('a finding satisfies at most one expectation', () => {
    const two: EvalCase = {
      name: 't',
      expected: [{ file: 'src/parse.ts' }, { file: 'src/parse.ts' }],
      clean: [],
    }
    const score = scoreCase([finding()], two)

    expect(score.matched).toHaveLength(1)
    expect(score.missed).toHaveLength(1)
    expect(score.recall).toBe(0.5)
  })
})

describe('scoreCase — the near-miss set', () => {
  test('a finding on a file declared clean is spurious, not extra', () => {
    const score = scoreCase([finding({ file: 'src/clean.ts' })], CASE)

    expect(score.spurious).toHaveLength(1)
    expect(score.extra).toEqual([])
  })

  test('precision falls for an invented finding even when the real one was found', () => {
    const score = scoreCase([finding(), finding({ file: 'src/clean.ts' })], CASE)

    expect(score.recall).toBe(1)
    expect(score.precision).toBe(0.5)
  })

  test('reporting nothing is vacuously precise but scores no recall', () => {
    const score = scoreCase([], CASE)

    expect(score.precision).toBe(1)
    expect(score.recall).toBe(0)
  })
})

describe('gatingFailures', () => {
  test('a missed expectation gates, and names what was missed', () => {
    const failures = gatingFailures(scoreCase([], CASE))

    expect(failures).toHaveLength(1)
    // The whole reason for per-case gating: the message has to say what broke,
    // not that a number moved.
    expect(failures[0]).toContain('src/parse.ts')
    expect(failures[0]).toContain('missed')
  })

  test('an aspirational expectation is tracked but does not gate', () => {
    const stretch: EvalCase = {
      name: 't',
      expected: [{ file: 'src/subtle.ts', aspirational: true }],
      clean: [],
    }
    const score = scoreCase([], stretch)

    expect(score.missed).toHaveLength(1)
    expect(score.recall).toBe(0)
    expect(gatingFailures(score)).toEqual([])
  })

  test('a spurious finding always gates — nothing about it is aspirational', () => {
    const failures = gatingFailures(scoreCase([finding(), finding({ file: 'src/clean.ts' })], CASE))

    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('spurious')
    expect(failures[0]).toContain('src/clean.ts')
  })

  test('an unasserted finding does not gate', () => {
    // The case made no claim about this file. It may be a real breach the
    // author missed; failing on it would punish the judge for the case's gaps.
    const failures = gatingFailures(
      scoreCase([finding(), finding({ file: 'src/unknown.ts' })], CASE),
    )
    expect(failures).toEqual([])
  })
})
