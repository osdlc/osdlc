import { describe, expect, test } from 'vitest'

import { adapterFor, planCall } from '@osdlc/agent-call'

import { buildSpec, FINDINGS_SCHEMA, type FileDiff } from '../src/prompt.ts'
import { DEFAULT_CONFIG, type RuleSource, type ReviewJob } from '../src/types.ts'

const SOURCE: RuleSource = {
  id: 'instruction:packages/core/lib/CLAUDE.md',
  kind: 'instruction',
  path: 'packages/core/lib/CLAUDE.md',
  depth: 3,
  patterns: ['packages/core/lib/**'],
  text: 'Entity reads go through readEntity, never hand-rolled parsing.',
  label: 'CLAUDE.md (packages/core/lib)',
}

const JOB: ReviewJob = {
  source: SOURCE,
  files: ['packages/core/lib/model/read.ts'],
}

const DIFFS: FileDiff[] = [
  { file: 'packages/core/lib/model/read.ts', diff: '+ const x = 1;' },
  { file: 'apps/pumice/src/main.rs', diff: '+ fn main() {}' },
]

const CONFIG = { ...DEFAULT_CONFIG, model: 'claude-haiku-4-5-20251001' }

describe('buildSpec', () => {
  test('sends only the files this job governs', () => {
    const prompt = buildSpec(JOB, DIFFS, CONFIG, '/repo').prompt

    expect(prompt).toContain('packages/core/lib/model/read.ts')
    expect(prompt).not.toContain('apps/pumice/src/main.rs')
    expect(prompt).toContain('# The changed files (1)')
  })

  test('carries the rule text verbatim', () => {
    // Paraphrasing the rules would change what is actually enforced.
    expect(buildSpec(JOB, DIFFS, CONFIG, '/repo').prompt).toContain(SOURCE.text)
  })

  test("names only this source's rules, so jobs stay independent", () => {
    const prompt = buildSpec(JOB, DIFFS, CONFIG, '/repo').prompt

    expect(prompt).toContain(SOURCE.path)
    expect(prompt).toContain('the complete and only ruleset')
  })

  test('requests read-only permissions and a non-persisted session', () => {
    const spec = buildSpec(JOB, DIFFS, CONFIG, '/repo')

    expect(spec.permissions?.mode).toBe('read-only')
    expect(spec.session?.persist).toBe(false)
    expect(spec.cwd).toBe('/repo')
    expect(spec.timeoutMs).toBe(DEFAULT_CONFIG.timeoutMs)
  })

  test('pins the reply shape to the findings schema', () => {
    expect(buildSpec(JOB, DIFFS, CONFIG, '/repo').output?.schema).toBe(FINDINGS_SCHEMA)
  })

  test('omits model entirely when none is configured', () => {
    const spec = buildSpec(JOB, DIFFS, DEFAULT_CONFIG, '/repo')

    expect(spec).not.toHaveProperty('model')
  })

  test('carries the configured effort, and omits it when none is', () => {
    expect(buildSpec(JOB, DIFFS, { ...CONFIG, effort: 'low' }, '/repo').effort).toBe('low')
    expect(buildSpec(JOB, DIFFS, CONFIG, '/repo')).not.toHaveProperty('effort')
  })
})

describe('the planned invocation', () => {
  test('claude runs read-only with the configured model and no mutation flags', () => {
    const planned = planCall(adapterFor('claude'), buildSpec(JOB, DIFFS, CONFIG, '/repo'))

    expect(planned.argv[0]).toBe('claude')
    expect(planned.argv).toContain('claude-haiku-4-5-20251001')
    // Nothing that could let a review edit the tree.
    const argv = planned.argv.join(' ')
    expect(argv).not.toContain('--dangerously-skip-permissions')
    expect(argv).not.toContain('bypassPermissions')
    expect(argv).not.toContain('acceptEdits')
  })

  test('the prompt travels over stdin, not argv', () => {
    // A whole changeset on the command line risks E2BIG on a wide diff.
    const planned = planCall(adapterFor('claude'), buildSpec(JOB, DIFFS, CONFIG, '/repo'))

    expect(planned.stdin).toContain(SOURCE.text)
    expect(planned.argv.join(' ')).not.toContain(SOURCE.text)
  })

  test("codex takes a local model's launch mode ahead of the prompt", () => {
    const local = {
      ...CONFIG,
      model: 'gemma3:4b',
      extraArgs: ['--oss', '--local-provider', 'ollama'],
    }
    const planned = planCall(adapterFor('codex'), buildSpec(JOB, DIFFS, local, '/repo'))

    const argv = planned.argv.join(' ')
    expect(argv).toContain('--model gemma3:4b')
    expect(argv.endsWith('--oss --local-provider ollama -')).toBe(true)
  })

  test('the spec survives translation to a second engine', () => {
    // rule-review must not quietly depend on claude-specific behavior.
    const planned = planCall(adapterFor('codex'), buildSpec(JOB, DIFFS, CONFIG, '/repo'))

    expect(planned.argv[0]).toBe('codex')
    // Every field that did not map 1:1 is recorded rather than dropped silently.
    for (const note of planned.notes) {
      expect(typeof note.field).toBe('string')
      expect(typeof note.detail).toBe('string')
    }
  })
})

test('FINDINGS_SCHEMA and SEVERITY_ORDER are frozen, all the way down', async () => {
  const { FINDINGS_SCHEMA } = await import('../src/prompt.ts')
  const { SEVERITY_ORDER } = await import('../src/types.ts')
  const items = (
    (FINDINGS_SCHEMA['properties'] as Record<string, Record<string, unknown>>)[
      'findings'
    ] as Record<string, unknown>
  )['items']
  expect(Object.isFrozen(FINDINGS_SCHEMA)).toBe(true)
  expect(Object.isFrozen(items)).toBe(true)
  expect(Object.isFrozen(SEVERITY_ORDER)).toBe(true)
})
