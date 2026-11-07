/**
 * Review a changeset against one rule source, with the agent call stubbed.
 *
 * Shows the whole library flow end to end without spawning an agent: build a
 * RuleSource, hand it and the changed files to `review`, inject a `dispatch`
 * that returns a canned judgement, and read the ReviewRun back.
 */
import { expect, test } from 'vitest'

import {
  DEFAULT_CONFIG,
  discoverSources,
  FINDINGS_SCHEMA,
  review,
  type Dispatch,
  type DiscoveryContext,
  type FileDiff,
  type JobOutcome,
  type RuleSource,
  type RuleSourceProvider,
  type ReviewConfig,
  type ReviewOptions,
  type ReviewRun,
  type AgentCallSpec,
  type AgentResult,
} from '@osdlc/rule-review'

const source: RuleSource = {
  id: 'instruction:src/CLAUDE.md',
  kind: 'instruction',
  path: 'src/CLAUDE.md',
  depth: 1,
  patterns: ['src/**'],
  text: 'Every exported function has a doc comment.',
  label: 'CLAUDE.md (src)',
}

const diffs: FileDiff[] = [
  { file: 'src/a.ts', diff: '+export function a() {}' },
  { file: 'docs/readme.md', diff: '+notes' },
]

const config: ReviewConfig = { ...DEFAULT_CONFIG, blocking: true }

// A dispatch that always answers with one violation against the first file.
// It records each spec so the test can check, after `review` returns, that the
// call was read-only JSON. An `expect` inside the stub would be swallowed by
// the run and show up as a failed job instead.
// Only the findings and timing fields matter to review (see runJob in run.ts);
// the rest fills AgentResult's type.
const seen: AgentCallSpec[] = []
const dispatch: Dispatch = async (spec): Promise<AgentResult> => {
  seen.push(spec)
  return {
    ok: true,
    exitCode: 0,
    durationMs: 5,
    text: '',
    structured: {
      findings: [
        {
          file: 'src/a.ts',
          line: 1,
          evidence: 'export function a() {}',
          why: 'a() has no doc comment',
          severity: 'violation',
        },
      ],
    },
    planned: {
      agent: 'claude',
      argv: [],
      env: {},
      outputFormat: 'json',
      notes: [],
      spec,
      tempFiles: [],
    },
    raw: { stdout: '', stderr: '', exitCode: 0, durationMs: 5, timedOut: false },
  }
}

test('review judges only the files a source governs', async () => {
  const settled: JobOutcome[] = []
  const options: ReviewOptions = {
    projectRoot: '/repo',
    sources: [source],
    changedFiles: ['src/a.ts', 'docs/readme.md'],
    diffs,
    config,
    dispatch,
    onJobSettled: (o) => settled.push(o),
  }
  const run: ReviewRun = await review(options)

  // One job: the source governs src/** and src/a.ts is the only match. The
  // docs file never reached an agent.
  expect(run.jobs).toHaveLength(1)
  expect(run.jobs[0]!.files).toEqual(['src/a.ts'])
  expect(settled).toHaveLength(1)

  // The judgement came back as one violation.
  expect(run.findings).toHaveLength(1)
  expect(run.findings[0]!.severity).toBe('violation')
  expect(run.findings[0]!.sourceId).toBe('instruction:src/CLAUDE.md')

  expect(run.outcomes[0]!.error).toBeUndefined()
  expect(seen[0]!.permissions).toEqual({ mode: 'read-only' })
  expect(seen[0]!.output).toEqual({ format: 'json', schema: FINDINGS_SCHEMA })

  expect(run.degraded).toBe(false)
  expect(run.dryRun).toBe(false)
})

test('discoverSources collects every provider, in registration order', async () => {
  const provider = (id: string, source: RuleSource): RuleSourceProvider => ({
    id,
    discover: async (_ctx: DiscoveryContext) => [source],
  })
  const other: RuleSource = { ...source, id: 'standard:no-any', label: 'no-any' }

  const ctx: DiscoveryContext = { projectRoot: '/repo', changedFiles: ['src/a.ts'] }
  const sources = await discoverSources(
    [provider('instruction-files', source), provider('standards', other)],
    ctx,
  )

  expect(sources.map((s) => s.id)).toEqual(['instruction:src/CLAUDE.md', 'standard:no-any'])
})

test('a dry run plans and measures but calls no agent', async () => {
  let called = false
  const run = await review({
    projectRoot: '/repo',
    sources: [source],
    changedFiles: ['src/a.ts'],
    diffs,
    config,
    dryRun: true,
    dispatch: async () => {
      called = true
      throw new Error('dispatch must not run in a dry run')
    },
  })

  expect(called).toBe(false)
  expect(run.dryRun).toBe(true)
  expect(run.jobs).toHaveLength(1)
  // The prompt size is measured even though nothing was dispatched.
  expect(run.outcomes[0]!.promptBytes).toBeGreaterThan(0)
  expect(run.findings).toHaveLength(0)
})

test('a source that matches nothing is skipped, not dispatched', async () => {
  const run = await review({
    projectRoot: '/repo',
    sources: [source],
    changedFiles: ['docs/readme.md'],
    diffs,
    config,
    dispatch: async () => {
      throw new Error('should not dispatch a skipped source')
    },
  })

  expect(run.jobs).toHaveLength(0)
  expect(run.skipped).toEqual([{ id: 'instruction:src/CLAUDE.md', label: 'CLAUDE.md (src)' }])
})
