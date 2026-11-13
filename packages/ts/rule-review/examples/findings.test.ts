/**
 * Rank severities against a floor and decide the process exit code.
 */
import { expect, test } from 'vitest'

import { exitCodeFor, meetsFloor, SEVERITY_ORDER, type Finding } from '@osdlc/rule-review'

test('SEVERITY_ORDER and meetsFloor rank severities', () => {
  expect([...SEVERITY_ORDER]).toEqual(['violation', 'tension', 'drift'])
  // At or above the floor.
  expect(meetsFloor('violation', 'tension')).toBe(true)
  expect(meetsFloor('drift', 'tension')).toBe(false)
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
