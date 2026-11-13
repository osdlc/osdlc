import { describe, expect, test } from 'vitest'

import type { Finding } from '../../src/types.ts'
import { type EvalCase, scoreCase } from './score.ts'
import { fingerprint, renderScoreboard, type RunOutcome } from './scoreboard.ts'

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
  name: 'case',
  expected: [
    { file: 'src/parse.ts', evidence: 'any' },
    { file: 'src/hard.ts', aspirational: true },
  ],
  clean: ['src/clean.ts'],
}

function outcome(findings: Finding[], evalCase: EvalCase = CASE): RunOutcome {
  return {
    case: evalCase,
    score: scoreCase(findings, evalCase),
    durationMs: 1500,
    engine: 'claude',
  }
}

const ALL = [finding(), finding({ file: 'src/hard.ts', evidence: 'x' })]

describe('renderScoreboard — mark', () => {
  test('✓ when every expectation is met', () => {
    expect(renderScoreboard([outcome(ALL)])).toContain('✓ case')
  })

  test('△ when only an aspirational expectation is missed', () => {
    expect(renderScoreboard([outcome([finding()])])).toContain('△ case')
  })

  test('✗ when a gating expectation is missed', () => {
    const board = renderScoreboard([outcome([])])
    expect(board).toContain('✗ case')
    expect(board).toContain('missed: src/parse.ts')
  })

  test('✗ when a clean file draws a finding', () => {
    expect(renderScoreboard([outcome([...ALL, finding({ file: 'src/clean.ts' })])])).toContain(
      '✗ case',
    )
  })

  test('extra findings are listed as unscored', () => {
    const board = renderScoreboard([outcome([...ALL, finding({ file: 'src/other.ts' })])])
    expect(board).toContain('unscored 1')
    expect(board).toContain('note: unscored violation on src/other.ts')
  })
})

describe('renderScoreboard — stability', () => {
  test('omitted for a single run', () => {
    expect(renderScoreboard([outcome(ALL)])).not.toContain('stability')
  })

  test('identical when repeated runs agree', () => {
    const board = renderScoreboard([outcome(ALL), outcome(ALL)])
    expect(board).toContain('case: 2 runs, found [2, 2], spurious [0, 0] — identical')
  })

  test('DIVERGENT when repeated runs disagree', () => {
    const board = renderScoreboard([outcome(ALL), outcome([finding()])])
    expect(board).toContain('case: 2 runs, found [2, 1], spurious [0, 0] — DIVERGENT')
  })
})

describe('fingerprint', () => {
  test('ignores the judge wording', () => {
    const a = outcome([finding({ why: 'one phrasing' })])
    const b = outcome([finding({ why: 'another phrasing' })])
    expect(fingerprint(a)).toBe(fingerprint(b))
  })

  test('differs when a different file draws a spurious finding', () => {
    const evalCase: EvalCase = { ...CASE, clean: ['src/clean.ts', 'src/also-clean.ts'] }
    const a = outcome([finding({ file: 'src/clean.ts' })], evalCase)
    const b = outcome([finding({ file: 'src/also-clean.ts' })], evalCase)
    expect(fingerprint(a)).not.toBe(fingerprint(b))
  })
})
