/**
 * The repair presets and their prompt. No test starts a real agent: a preset is
 * planned (agent-call's `planCall`, which only builds the command line) or run
 * against a fake `callAgent`.
 */

import { describe, expect, test } from 'vitest'

import type { AgentResult } from '@osdlc/agent-call'

import {
  REPAIR_AGENTS,
  agentRepair,
  planRepair,
  repairCallSpec,
  type CallAgent,
} from '../src/repair/agents.ts'
import { repairPrompt } from '../src/repair/prompt.ts'
import type { RepairRequest } from '../src/ports.ts'

const request = (patch: Partial<RepairRequest> = {}): RepairRequest => ({
  kind: 'conflict',
  pr: 7,
  base: 'main',
  head: 'topic',
  worktree: '/work/tree',
  paths: ['a.ts', 'b/c.ts'],
  reason: 'unclaimed conflicts: a.ts (no resolver claims it)',
  ...patch,
})

describe('repairPrompt', () => {
  test('names the PR, the branches, the paths and the reason', () => {
    const text = repairPrompt(request())
    expect(text).toContain('#7')
    expect(text).toContain('`topic`')
    expect(text).toContain('`main`')
    expect(text).toContain('- a.ts')
    expect(text).toContain('- b/c.ts')
    expect(text).toContain('no resolver claims it')
  })

  test('states the contract the executor checks', () => {
    const text = repairPrompt(request())
    expect(text).toMatch(/Do not commit/)
    expect(text).toMatch(/push/)
    expect(text).toMatch(/Leave no conflict markers/)
    expect(text).toMatch(/git diff --check/)
  })

  test('a failed verify gets its own task, not the merge one', () => {
    const text = repairPrompt(request({ kind: 'verify-failed', reason: 'verify `test` failed' }))
    expect(text).toContain('checks that must pass')
    expect(text).not.toContain('conflict markers and')
    expect(text).toContain('Files the update changed:')
  })
})

describe('the presets, planned and not run', () => {
  const expected: Record<(typeof REPAIR_AGENTS)[number], { binary: string; has: string[] }> = {
    claude: { binary: 'claude', has: ['--permission-mode', 'acceptEdits'] },
    codex: { binary: 'codex', has: ['exec', '--sandbox', 'workspace-write'] },
    cursor: { binary: 'agent', has: ['-p', '--trust'] },
    pi: { binary: 'pi', has: ['--tools', 'read,grep,find,ls,edit,write'] },
  }

  test.each([...REPAIR_AGENTS])(
    'AC-6: %s plans one edit-allowed, no-prompt call in the worktree',
    (agent) => {
      const planned = planRepair(agent, request(), { model: 'some-model', timeoutSeconds: 90 })
      const want = expected[agent]
      expect(planned.argv[0]).toBe(want.binary)
      for (const arg of want.has) expect(planned.argv).toContain(arg)
      // Never a bypass posture: edits, no shell, no prompts.
      expect(planned.argv.join(' ')).not.toMatch(/dangerously|bypass|--force|yolo/)
      expect(planned.cwd).toBe('/work/tree')
      expect(planned.argv).toContain('some-model')
      expect(planned.spec.timeoutMs).toBe(90_000)
      // The prompt travels to the CLI (stdin for all four), and it is the shared one.
      expect(planned.stdin).toBe(repairPrompt(request()))
    },
  )

  test('no model and no timeout leave both unset', () => {
    const spec = repairCallSpec(request())
    expect(spec.model).toBeUndefined()
    expect(spec.timeoutMs).toBeUndefined()
    expect(spec.permissions).toEqual({ mode: 'edits' })
  })
})

describe('agentRepair result mapping', () => {
  const result = (patch: Partial<AgentResult>): AgentResult =>
    ({
      ok: true,
      text: '',
      exitCode: 0,
      durationMs: 1,
      ...patch,
    }) as AgentResult

  const run = (res: AgentResult) => {
    const calls: { name: string; cwd: string | undefined }[] = []
    const fake: CallAgent = async (adapter, spec) => {
      calls.push({ name: adapter.name, cwd: spec.cwd })
      return res
    }
    return { repair: agentRepair('claude', {}, fake), calls }
  }

  test('a clean exit is ok, and the last line of the final text is the note', async () => {
    const { repair, calls } = run(
      result({ text: 'Looked at it.\n\nResolved a.ts by keeping both.\n' }),
    )
    expect(await repair(request())).toEqual({ ok: true, note: 'Resolved a.ts by keeping both.' })
    expect(calls).toEqual([{ name: 'claude', cwd: '/work/tree' }])
  })

  test('a failed call is not ok, and says why when the agent said nothing', async () => {
    const { repair } = run(
      result({ ok: false, error: { reason: 'timeout', detail: 'killed after 90s' } }),
    )
    const res = await repair(request())
    expect(res.ok).toBe(false)
    expect(res.note).toContain('timeout')
  })

  test('a failed call keeps what the agent last said', async () => {
    const { repair } = run(result({ ok: false, text: 'I cannot resolve this.' }))
    expect(await repair(request())).toEqual({ ok: false, note: 'I cannot resolve this.' })
  })

  test('a call agent-call refuses to plan reads as giving up, not a throw', async () => {
    const repair = agentRepair('codex', {}, async () => {
      throw new Error('cannot plan')
    })
    const res = await repair(request())
    expect(res.ok).toBe(false)
    expect(res.note).toContain('cannot plan')
  })
})
