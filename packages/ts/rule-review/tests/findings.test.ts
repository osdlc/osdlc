import { describe, expect, test } from 'vitest'

import { exitCodeFor, meetsFloor, mergeFindings, parseFindings } from '../src/findings.ts'
import type { Finding, JobOutcome, RuleSource, ReviewJob } from '../src/types.ts'

function job(id: string, depth: number, files: string[]): ReviewJob {
  const source: RuleSource = {
    id,
    kind: 'instruction',
    path: `${id}/CLAUDE.md`,
    depth,
    patterns: ['**'],
    text: '',
    label: id,
  }
  return { source, files }
}

const JOB = job('root', 0, ['a.ts', 'b.ts'])

function reply(findings: unknown[]): unknown {
  return { findings }
}

describe('parseFindings', () => {
  test('attributes each finding to the judging source', () => {
    const out = parseFindings(
      reply([{ file: 'a.ts', evidence: 'spawn(', why: 'command seam', severity: 'violation' }]),
      JOB,
    )

    expect(out).toEqual([
      {
        sourceId: 'root',
        sourceKind: 'instruction',
        sourcePath: 'root/CLAUDE.md',
        file: 'a.ts',
        evidence: 'spawn(',
        why: 'command seam',
        severity: 'violation',
      },
    ])
  })

  test('keeps a valid line number and omits an invalid one', () => {
    const [withLine, withoutLine] = parseFindings(
      reply([
        { file: 'a.ts', evidence: 'x', why: 'y', severity: 'drift', line: 12 },
        { file: 'b.ts', evidence: 'x', why: 'y', severity: 'drift', line: 0 },
      ]),
      JOB,
    )

    expect(withLine?.line).toBe(12)
    expect(withoutLine).not.toHaveProperty('line')
  })

  test('drops a malformed entry without discarding its siblings', () => {
    const out = parseFindings(
      reply([
        { file: 'a.ts', evidence: 'x', why: 'y', severity: 'nonsense' },
        { file: 'a.ts', why: 'y', severity: 'violation' },
        'not an object',
        { file: 'b.ts', evidence: 'x', why: 'y', severity: 'tension' },
      ]),
      JOB,
    )

    expect(out.map((f) => f.file)).toEqual(['b.ts'])
  })

  test("rejects a finding about a file outside the job's scope", () => {
    // A judge citing a file it was never shown has strayed past its job.
    const out = parseFindings(
      reply([{ file: 'elsewhere.ts', evidence: 'x', why: 'y', severity: 'violation' }]),
      JOB,
    )

    expect(out).toEqual([])
  })

  test('tolerates a reply that is not the expected shape at all', () => {
    expect(parseFindings(undefined, JOB)).toEqual([])
    expect(parseFindings('a string', JOB)).toEqual([])
    expect(parseFindings({ findings: 'not an array' }, JOB)).toEqual([])
    expect(parseFindings([], JOB)).toEqual([])
  })
})

describe('mergeFindings', () => {
  function outcome(id: string, depth: number, findings: Partial<Finding>[]): JobOutcome {
    const j = job(id, depth, [])
    return {
      job: j,
      durationMs: 0,
      promptBytes: 0,
      findings: findings.map((f) => ({
        sourceId: id,
        sourceKind: 'instruction',
        sourcePath: `${id}/CLAUDE.md`,
        file: 'a.ts',
        evidence: 'e',
        why: 'w',
        severity: 'violation',
        ...f,
      })) as Finding[],
    }
  }

  test('orders broad to specific, then by severity, then by location', () => {
    const merged = mergeFindings([
      outcome('deep', 3, [
        { file: 'z.ts', severity: 'drift' },
        { file: 'a.ts', severity: 'violation' },
      ]),
      outcome('root', 0, [
        { file: 'm.ts', severity: 'tension' },
        { file: 'm.ts', severity: 'violation', line: 9 },
        { file: 'm.ts', severity: 'violation', line: 2 },
      ]),
    ])

    expect(merged.map((f) => [f.sourceId, f.severity, f.file, f.line ?? null])).toEqual([
      ['root', 'violation', 'm.ts', 2],
      ['root', 'violation', 'm.ts', 9],
      ['root', 'tension', 'm.ts', null],
      ['deep', 'violation', 'a.ts', null],
      ['deep', 'drift', 'z.ts', null],
    ])
  })

  test('keeps each source together when two sources share a depth', () => {
    const merged = mergeFindings([
      outcome('root-agents', 0, [
        { file: 'b.ts', severity: 'violation' },
        { file: 'd.ts', severity: 'tension' },
      ]),
      outcome('root-claude', 0, [
        { file: 'a.ts', severity: 'violation' },
        { file: 'c.ts', severity: 'tension' },
      ]),
    ])

    expect(merged.map((f) => [f.sourceId, f.file])).toEqual([
      ['root-agents', 'b.ts'],
      ['root-agents', 'd.ts'],
      ['root-claude', 'a.ts'],
      ['root-claude', 'c.ts'],
    ])
  })

  test('a run with no findings merges to an empty list', () => {
    expect(mergeFindings([outcome('root', 0, [])])).toEqual([])
  })
})

describe('meetsFloor', () => {
  test('a floor admits itself and everything more serious', () => {
    expect(meetsFloor('violation', 'tension')).toBe(true)
    expect(meetsFloor('tension', 'tension')).toBe(true)
    expect(meetsFloor('drift', 'tension')).toBe(false)
  })
})

describe('exitCodeFor', () => {
  const violation: Finding[] = [
    {
      sourceId: 'root',
      sourceKind: 'instruction',
      sourcePath: 'CLAUDE.md',
      file: 'a.ts',
      evidence: 'e',
      why: 'w',
      severity: 'violation',
    },
  ]

  test('an advisory run always exits 0, findings or not', () => {
    expect(exitCodeFor(violation, { blocking: false, severityFloor: 'violation' })).toBe(0)
  })

  test('a blocking run fails on a finding at or above the floor', () => {
    expect(exitCodeFor(violation, { blocking: true, severityFloor: 'violation' })).toBe(1)
  })

  test('a blocking run passes when everything is below the floor', () => {
    const drift = violation.map((f) => ({ ...f, severity: 'drift' as const }))

    expect(exitCodeFor(drift, { blocking: true, severityFloor: 'violation' })).toBe(0)
  })

  test('a clean blocking run exits 0', () => {
    expect(exitCodeFor([], { blocking: true, severityFloor: 'drift' })).toBe(0)
  })
})
