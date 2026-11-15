/**
 * Plan which rules apply to a changeset, select files by scope, and size a
 * prompt — the pure steps a `--dry-run` reports, with no agent and no git.
 */
import { expect, test } from 'vitest'

import {
  DEFAULT_CONFIG,
  estimateTokens,
  formatTokens,
  jobLabel,
  planJobs,
  type PlanResult,
  type RuleSource,
} from '@osdlc/rule-review'

const sources: RuleSource[] = [
  {
    id: 'root',
    kind: 'instruction',
    path: 'CLAUDE.md',
    depth: 0,
    patterns: ['**'],
    text: 'Repo-wide rules.',
    label: 'CLAUDE.md (repo root)',
  },
  {
    id: 'src',
    kind: 'instruction',
    path: 'src/CLAUDE.md',
    depth: 1,
    patterns: ['src/**'],
    text: 'Rules for src.',
    label: 'CLAUDE.md (src)',
  },
  {
    id: 'docs',
    kind: 'instruction',
    path: 'docs/CLAUDE.md',
    depth: 1,
    patterns: ['docs/**'],
    text: 'Rules for docs.',
    label: 'CLAUDE.md (docs)',
  },
]

const changed = ['src/a.ts', 'src/b.ts', 'README.md']

test('planJobs pairs each source with the files it governs, broad first', () => {
  const plan: PlanResult = planJobs(sources, changed, {
    exclude: DEFAULT_CONFIG.exclude,
    maxFilesPerJob: DEFAULT_CONFIG.maxFilesPerJob,
  })

  // root governs everything; src governs the two src files; docs matches nothing.
  expect(plan.jobs.map((j) => j.source.id)).toEqual(['root', 'src'])
  expect(plan.jobs[0]!.files).toEqual(['src/a.ts', 'src/b.ts', 'README.md'])
  expect(plan.jobs[1]!.files).toEqual(['src/a.ts', 'src/b.ts'])
  expect(plan.skipped).toEqual([{ id: 'docs', label: 'CLAUDE.md (docs)' }])
})

test('maxFilesPerJob splits a broad source into numbered shards', () => {
  const plan = planJobs([sources[0]!], ['a', 'b', 'c', 'd', 'e'], {
    exclude: [],
    maxFilesPerJob: 2,
  })

  // Five files at a cap of two spread as 2+2+1 across three shards.
  expect(plan.jobs).toHaveLength(3)
  expect(plan.jobs.map((j) => j.shard)).toEqual([
    { index: 1, of: 3 },
    { index: 2, of: 3 },
    { index: 3, of: 3 },
  ])
  expect(jobLabel(plan.jobs[0]!)).toBe('CLAUDE.md (repo root) (1/3)')
  expect(jobLabel({ source: { label: 'CLAUDE.md (src)' } })).toBe('CLAUDE.md (src)')
})

test('token figures estimate a prompt size for a dry run', () => {
  expect(estimateTokens(4000)).toBe(1000)
  expect(formatTokens(430)).toBe('430')
  expect(formatTokens(8200)).toBe('8.2k')
  expect(formatTokens(55_000)).toBe('55k')
})
