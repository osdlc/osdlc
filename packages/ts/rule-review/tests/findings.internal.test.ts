/**
 * Turn a judge's structured reply into findings, then merge and order them:
 * the internal steps `review` runs on each reply.
 */
import { expect, test } from 'vitest'

import { type Finding, type JobOutcome, type Severity, type ReviewJob } from '../src/index.ts'
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
