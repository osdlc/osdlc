/**
 * Build the agent-call spec for one job: the read-only, JSON-pinned judgement
 * request, with the rule prose and the in-scope diffs in the prompt.
 */
import { expect, test } from 'vitest'

import {
  buildSpec,
  DEFAULT_CONFIG,
  FINDINGS_SCHEMA,
  type FileDiff,
  type ReviewJob,
} from '@osdlc/rule-review'

const job: ReviewJob = {
  source: {
    id: 'src',
    kind: 'instruction',
    path: 'src/CLAUDE.md',
    depth: 1,
    patterns: ['src/**'],
    text: 'Every export has a doc comment.',
    label: 'CLAUDE.md (src)',
  },
  files: ['src/a.ts'],
}

const diffs: FileDiff[] = [
  { file: 'src/a.ts', diff: '+export function a() {}' },
  { file: 'src/b.ts', diff: '+export function b() {}' }, // out of this job's scope
]

test('buildSpec makes a read-only, JSON judgement call', () => {
  const spec = buildSpec(job, diffs, { ...DEFAULT_CONFIG, model: 'sonnet' }, '/repo')

  expect(spec.permissions).toEqual({ mode: 'read-only' })
  expect(spec.output).toEqual({ format: 'json', schema: FINDINGS_SCHEMA })
  expect(spec.cwd).toBe('/repo')
  expect(spec.model).toBe('sonnet')

  // The rule prose is handed over verbatim, and only the job's own file is in
  // the prompt — the sibling diff is left out.
  expect(spec.prompt).toContain('Every export has a doc comment.')
  expect(spec.prompt).toContain('src/a.ts')
  expect(spec.prompt).not.toContain('src/b.ts')
})

test('FINDINGS_SCHEMA is the wire shape the judge must answer in', () => {
  expect(FINDINGS_SCHEMA['type']).toBe('object')
  expect(FINDINGS_SCHEMA['required']).toEqual(['findings'])
})
