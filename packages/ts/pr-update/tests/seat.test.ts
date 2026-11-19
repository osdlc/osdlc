/**
 * The attended repair modes. No test starts a real agent or tmux: the inherited-stdio runner
 * and the host are fakes that record what they were asked to run.
 */

import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Host, SessionRequest } from '@osdlc/agent-seat'

import { prUpdateConfigSchema } from '../src/config.ts'
import type { RepairRequest } from '../src/ports.ts'
import { seatRepair } from '../src/repair/seat.ts'
import { forwarded } from './support-signal.ts'

vi.mock('@osdlc/command-seam', async (original) =>
  (await import('./support-signal.ts')).mockForwarding(original),
)

afterEach(() => {
  forwarded.signal = undefined
})

const request: RepairRequest = {
  kind: 'conflict',
  pr: 7,
  base: 'main',
  head: 'topic',
  worktree: '/work/tree',
  paths: ['a.ts'],
  reason: 'unclaimed conflicts: a.ts',
}

function fakeHost(exitCode: number, available = true) {
  const sessions: SessionRequest[] = []
  const host = {
    name: 'tmux',
    platforms: 'all',
    available: () => available,
    session: (req: SessionRequest) => {
      sessions.push(req)
      return { exitCode, harnessSessionId: null }
    },
  } as unknown as Host
  return { host, sessions }
}

describe('interactive mode', () => {
  test('runs the agent CLI in the worktree with the repair prompt as its first message', async () => {
    const run = vi.fn(() => 0)
    const res = await seatRepair('claude', 'interactive', { timeoutSeconds: 60 }, { run })(request)
    expect(res.ok).toBe(true)
    const [binary, argv, opts] = run.mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string; timeoutMs: number },
    ]
    expect(binary).toBe('claude')
    expect(argv.at(-1)).toContain('repairing pull request #7')
    expect(opts).toEqual({ cwd: '/work/tree', timeoutMs: 60_000 })
  })

  test('a session that exits non-zero is a repair that gave up', async () => {
    const res = await seatRepair('codex', 'interactive', {}, { run: () => 3 })(request)
    expect(res).toEqual({ ok: false, note: 'codex: interactive session exited 3' })
  })

  test('a signal during the session is not committed', async () => {
    const res = await seatRepair(
      'claude',
      'interactive',
      {},
      {
        run: () => {
          forwarded.signal = 'SIGINT'
          return 0
        },
      },
    )(request)
    expect(res).toEqual({ ok: false, note: 'claude: interrupted' })
  })
})

describe('terminal mode', () => {
  test('opens a waiting session without host tokens and says where to attach', async () => {
    const { host, sessions } = fakeHost(0)
    const notice = vi.fn()
    const res = await seatRepair('claude', 'terminal', { model: 'opus' }, { host, notice })(request)
    expect(res.ok).toBe(true)
    expect(sessions[0]).toMatchObject({
      cwd: '/work/tree',
      harness: 'claude',
      model: 'opus',
      focus: false,
      wait: { runId: `pr-update-7-${process.pid}` },
    })
    expect(sessions[0]!.env?.GH_TOKEN).toBe('')
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('tmux attach -t sd-pr-update-7-'))
  })

  test('the exit code of the session decides ok', async () => {
    const res = await seatRepair('claude', 'terminal', {}, { host: fakeHost(124).host })(request)
    expect(res).toEqual({ ok: false, note: 'claude: terminal session exited 124' })
  })

  test('no tmux gives a note, not a throw', async () => {
    const res = await seatRepair(
      'claude',
      'terminal',
      {},
      { host: fakeHost(0, false).host },
    )(request)
    expect(res.ok).toBe(false)
    expect(res.note).toContain('needs tmux')
  })
})

describe('repair.mode config', () => {
  test('defaults to headless and accepts the attended modes', () => {
    expect(prUpdateConfigSchema.parse({}).repair.mode).toBe('headless')
    expect(
      prUpdateConfigSchema.parse({ repair: { agent: 'claude', mode: 'terminal' } }).repair.mode,
    ).toBe('terminal')
  })

  test('refuses an unknown mode and a mode with repair.command', () => {
    expect(prUpdateConfigSchema.safeParse({ repair: { mode: 'tv' } }).success).toBe(false)
    expect(
      prUpdateConfigSchema.safeParse({ repair: { command: 'x', mode: 'interactive' } }).success,
    ).toBe(false)
  })
})
