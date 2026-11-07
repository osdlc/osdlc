/**
 * Turn a judge's structured reply into findings, merge and order them, and
 * decide the process exit code against a severity floor.
 */
import { expect, test } from 'vitest'

import {
  exitCodeFor,
  meetsFloor,
  SEVERITY_ORDER,
  type Finding,
  type JobOutcome,
  type Severity,
  type ReviewJob,
} from '../src/index.ts'
// Internal: the steps `review` runs on each reply.
import { mergeFindings, parseFindings } from '../src/findings.ts'

const job: ReviewJob = {
  source: {
    id: 'src',
    kind: 'instruction',
    path: 'src/CLAUDE.md',
    depth: 1,
    patterns: ['src/**'],
    text: 'Rules.',
    label: 'CLAUDE.md (src)',
  },
  files: ['src/a.ts'],
}

test('parseFindings validates the reply and attributes it to the job', () => {
  const reply = {
    findings: [
      { file: 'src/a.ts', line: 3, evidence: 'any', why: 'no any', severity: 'violation' },
      // Dropped: a file outside the job's scope, and a bad severity.
      { file: 'other.ts', evidence: 'x', why: 'y', severity: 'violation' },
      { file: 'src/a.ts', evidence: 'x', why: 'y', severity: 'bogus' },
    ],
  }
  const findings = parseFindings(reply, job)

  expect(findings).toHaveLength(1)
  expect(findings[0]!.file).toBe('src/a.ts')
  expect(findings[0]!.line).toBe(3)
  expect(findings[0]!.sourceId).toBe('src')
})

test('SEVERITY_ORDER and meetsFloor rank severities', () => {
  expect([...SEVERITY_ORDER]).toEqual(['violation', 'tension', 'drift'])
  // At or above the floor.
  expect(meetsFloor('violation', 'tension')).toBe(true)
  expect(meetsFloor('drift', 'tension')).toBe(false)
})

test('mergeFindings orders broad-to-specific, then by severity', () => {
  const finding = (sourceId: string, file: string, severity: Severity): Finding => ({
    sourceId,
    sourceKind: 'instruction',
    sourcePath: `${sourceId}/CLAUDE.md`,
    file,
    evidence: 'x',
    why: 'y',
    severity,
  })
  const outcomes: JobOutcome[] = [
    {
      job: { ...job, source: { ...job.source, id: 'deep', depth: 2 } },
      findings: [finding('deep', 'src/x/a.ts', 'violation')],
      durationMs: 1,
      promptBytes: 10,
    },
    {
      job: { ...job, source: { ...job.source, id: 'root', depth: 0 } },
      findings: [finding('root', 'a.ts', 'drift'), finding('root', 'a.ts', 'violation')],
      durationMs: 1,
      promptBytes: 10,
    },
  ]
  const merged = mergeFindings(outcomes)

  // Depth 0 first (root), its violation before its drift; then the depth-2 one.
  expect(merged.map((f) => [f.sourceId, f.severity])).toEqual([
    ['root', 'violation'],
    ['root', 'drift'],
    ['deep', 'violation'],
  ])
})

test('exitCodeFor fails only when blocking and a finding meets the floor', () => {
  const findings: Finding[] = [
    {
      sourceId: 'src',
      sourceKind: 'instruction',
      sourcePath: 'src/CLAUDE.md',
      file: 'src/a.ts',
      evidence: 'x',
      why: 'y',
      severity: 'tension',
    },
  ]
  expect(exitCodeFor(findings, { blocking: false, severityFloor: 'drift' })).toBe(0)
  expect(exitCodeFor(findings, { blocking: true, severityFloor: 'violation' })).toBe(0)
  expect(exitCodeFor(findings, { blocking: true, severityFloor: 'tension' })).toBe(1)
})
