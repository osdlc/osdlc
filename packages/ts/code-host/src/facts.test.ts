import { describe, expect, test } from 'vitest'

import { assemblePrFacts } from './facts.ts'
import type { CodeHostPr } from './types.ts'
import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

function pr(overrides: Partial<CodeHostPr> = {}): CodeHostPr {
  return {
    number: 1,
    url: 'https://github.com/o/r/pull/1',
    title: 't',
    state: 'open',
    isDraft: false,
    author: null,
    baseRef: 'main',
    headRef: 'task/x',
    headIsFork: false,
    headSha: null,
    mergedAt: null,
    mergeable: 'mergeable',
    checks: { rollup: 'none', failing: [], failingUrls: [], blocked: [] },
    reviewDecision: null,
    activity: [],
    ...overrides,
  }
}

function scriptedGit(result: CommandResult): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  return { calls, runner: { run: (argv) => (calls.push([...argv]), result) } }
}

describe('assemblePrFacts', () => {
  test('measures behind/ahead against origin/<base>...origin/<head>', () => {
    const { runner, calls } = scriptedGit({ exitCode: 0, stdout: '3\t5\n', stderr: '' })
    const facts = assemblePrFacts(pr(), '/repo', runner)
    expect(facts.behind).toBe(3)
    expect(facts.ahead).toBe(5)
    expect(calls[0]).toEqual(['rev-list', '--left-right', '--count', 'origin/main...origin/task/x'])
  })

  test('a ref this checkout never fetched is unknown, not zero', () => {
    const { runner } = scriptedGit({ exitCode: 128, stdout: '', stderr: 'unknown revision' })
    const facts = assemblePrFacts(pr(), '/repo', runner)
    expect(facts.behind).toBeNull()
    expect(facts.ahead).toBeNull()
  })

  test('carries every other CodeHostPr field through unchanged', () => {
    const { runner } = scriptedGit({ exitCode: 0, stdout: '0\t0\n', stderr: '' })
    const input = pr({ number: 7, title: 'my pr' })
    const facts = assemblePrFacts(input, '/repo', runner)
    expect(facts.number).toBe(7)
    expect(facts.title).toBe('my pr')
  })
})
