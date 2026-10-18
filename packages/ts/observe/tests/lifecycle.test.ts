import { describe, expect, test } from 'vitest'

import {
  endSession,
  resolveLineage,
  resolveRun,
  runHeadlessSession,
  runInteractiveSession,
  type LifecycleEvent,
  type LifecyclePorts,
} from '../lifecycle.ts'
import type { SessionRunState } from '../model.ts'

type Host = 'terminal' | 'tmux'

/** Ports over an in-memory log; the state follows the `state_changed` events, as the reducer would. */
function fakePorts(initial: SessionRunState | null = 'starting') {
  const events: { event: LifecycleEvent<Host>; ts: string | undefined }[] = []
  const ends: { outcome: string; at: string }[] = []
  let state = initial
  let clock = 0
  const ports: LifecyclePorts<Host> = {
    emit: (event, ts) => {
      events.push({ event, ts })
      if (event.kind === 'state_changed') state = event.to
    },
    state: () => state,
    now: () => `t${++clock}`,
    onEnd: (outcome, at) => ends.push({ outcome, at }),
  }
  return {
    ports,
    events,
    ends,
    kinds: () => events.map((e) => e.event.kind),
    setState: (s: SessionRunState | null) => (state = s),
  }
}

describe('endSession', () => {
  test('moves from the current state to ended, then writes ended', () => {
    const f = fakePorts('running')
    endSession(f.ports, 'starting', 'T', 'exit')
    expect(f.events).toEqual([
      { event: { kind: 'state_changed', from: 'running', to: 'ended', cause: 'exit' }, ts: 'T' },
      { event: { kind: 'ended' }, ts: 'T' },
    ])
  })

  test('writes no second state_changed when a hook already ended the session', () => {
    const f = fakePorts('ended')
    endSession(f.ports, 'starting', 'T', 'exit')
    expect(f.kinds()).toEqual(['ended'])
  })

  test('falls back when the record cannot be read', () => {
    const f = fakePorts(null)
    endSession(f.ports, 'idle', 'T', 'exit')
    expect(f.events[0]!.event).toMatchObject({ from: 'idle', to: 'ended' })
  })
})

describe('runHeadlessSession', () => {
  test('attaches the pid on spawn, runs afterExit before the outcome, and ends', async () => {
    const f = fakePorts()
    const order: string[] = []
    const result = await runHeadlessSession(
      f.ports,
      async (onSpawn) => {
        onSpawn(4242)
        return { exitCode: 0, stdout: 'out' }
      },
      (r, endedAt) => {
        order.push(`afterExit ${r.stdout} ${endedAt}`)
        f.ports.emit({ kind: 'state_changed', from: 'running', to: 'idle', cause: 'hook' })
      },
    )
    expect(result.exitCode).toBe(0)
    expect(order).toEqual(['afterExit out t1'])
    expect(f.events.map((e) => e.event)).toEqual([
      { kind: 'host_attached', host: null, harnessSessionId: null, pid: 4242 },
      { kind: 'state_changed', from: 'starting', to: 'running', cause: 'spawn' },
      { kind: 'state_changed', from: 'running', to: 'idle', cause: 'hook' },
      { kind: 'outcome', outcome: 'ok', exitCode: 0 },
      { kind: 'state_changed', from: 'idle', to: 'ended', cause: 'exit' },
      { kind: 'ended' },
    ])
    expect(f.ends).toEqual([{ outcome: 'ok', at: 't1' }])
  })

  test('a non-zero exit is a failed outcome', async () => {
    const f = fakePorts()
    await runHeadlessSession(f.ports, async () => ({ exitCode: 3 }))
    expect(f.events.find((e) => e.event.kind === 'outcome')!.event).toEqual({
      kind: 'outcome',
      outcome: 'failed',
      exitCode: 3,
    })
    expect(f.ends[0]!.outcome).toBe('failed')
  })

  test('a timed-out result ends the record with outcome timeout and onEnd failed', async () => {
    const f = fakePorts()
    await runHeadlessSession(f.ports, async () => ({ exitCode: 1, timedOut: true }))
    expect(f.events.find((e) => e.event.kind === 'outcome')!.event).toEqual({
      kind: 'outcome',
      outcome: 'timeout',
      exitCode: 1,
    })
    expect(f.ends[0]!.outcome).toBe('failed')
  })

  test('an afterExit that throws still ends the record with the exit code, then rethrows', async () => {
    const f = fakePorts()
    const boom = new Error('usage parse')
    await expect(
      runHeadlessSession(
        f.ports,
        async () => ({ exitCode: 0 }),
        () => {
          throw boom
        },
      ),
    ).rejects.toBe(boom)
    expect(f.events.map((e) => e.event.kind)).toEqual(['outcome', 'state_changed', 'ended'])
    expect(f.ends).toEqual([{ outcome: 'ok', at: 't1' }])
  })

  test('a spawn that throws ends the record failed, then rethrows', async () => {
    const f = fakePorts()
    const boom = new Error('no binary')
    await expect(
      runHeadlessSession(f.ports, async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(f.events.map((e) => e.event)).toEqual([
      { kind: 'outcome', outcome: 'failed', exitCode: null },
      { kind: 'state_changed', from: 'starting', to: 'ended', cause: 'spawn_failed' },
      { kind: 'ended' },
    ])
    expect(f.ends).toEqual([{ outcome: 'failed', at: 't1' }])
  })
})

describe('runInteractiveSession', () => {
  const opened = { exitCode: 0, harnessSessionId: 'host-id' }

  test('a waiting host ends the record with the exit code', () => {
    const f = fakePorts(null)
    const r = runInteractiveSession(f.ports, {
      host: 'terminal',
      waits: true,
      open: (before) => {
        before()
        return { exitCode: 2, harnessSessionId: null }
      },
      beforeLaunch: () => f.setState('starting'),
      presetHarnessSessionId: 'preset',
    })
    expect(r).toEqual({ exitCode: 2, harnessSessionId: 'preset', endedAt: 't1' })
    expect(f.events.map((e) => e.event)).toEqual([
      { kind: 'host_attached', host: 'terminal', harnessSessionId: 'preset', pid: null },
      { kind: 'state_changed', from: 'starting', to: 'running', cause: 'host_returned' },
      { kind: 'outcome', outcome: 'failed', exitCode: 2 },
      { kind: 'state_changed', from: 'running', to: 'ended', cause: 'exit' },
      { kind: 'ended' },
    ])
    expect(f.ends).toEqual([{ outcome: 'failed', at: 't1' }])
  })

  test('a hands-off host leaves the session running, with the host id and afterAttach', () => {
    const f = fakePorts(null)
    const attached: string[] = []
    const r = runInteractiveSession(f.ports, {
      host: 'tmux',
      waits: false,
      open: (before) => {
        before()
        return opened
      },
      beforeLaunch: () => f.setState('starting'),
      presetHarnessSessionId: null,
      afterAttach: (o) => attached.push(o.harnessSessionId!),
    })
    expect(r).toEqual({ exitCode: 0, harnessSessionId: 'host-id', endedAt: null })
    expect(attached).toEqual(['host-id'])
    expect(f.kinds()).toEqual(['host_attached', 'state_changed'])
    expect(f.ends).toEqual([])
  })

  test('a hook that already moved the session is not moved back', () => {
    const f = fakePorts(null)
    runInteractiveSession(f.ports, {
      host: 'tmux',
      waits: false,
      open: (before) => {
        before()
        return opened
      },
      beforeLaunch: () => f.setState('waiting_for_input'),
      presetHarnessSessionId: null,
    })
    expect(f.kinds()).toEqual(['host_attached'])
  })

  test('a host that fails before the record exists writes nothing', () => {
    const f = fakePorts(null)
    expect(() =>
      runInteractiveSession(f.ports, {
        host: 'tmux',
        waits: false,
        open: () => {
          throw new Error('host not available')
        },
        beforeLaunch: () => f.setState('starting'),
        presetHarnessSessionId: null,
      }),
    ).toThrow('host not available')
    expect(f.events).toEqual([])
  })

  test('a host that fails after the record exists ends it failed', () => {
    const f = fakePorts(null)
    expect(() =>
      runInteractiveSession(f.ports, {
        host: 'tmux',
        waits: false,
        open: (before) => {
          before()
          throw new Error('pane died')
        },
        beforeLaunch: () => f.setState('starting'),
        presetHarnessSessionId: null,
      }),
    ).toThrow('pane died')
    expect(f.kinds()).toEqual(['outcome', 'state_changed', 'ended'])
    expect(f.ends[0]!.outcome).toBe('failed')
  })
})

describe('resolveRun', () => {
  test('mints a run when neither the caller nor the environment has one', () => {
    const r = resolveRun({}, 'issue-12', {})
    expect(r.run).toMatch(/^r-/)
    expect(r).toMatchObject({ subject: 'issue-12', minted: true, parentRun: null })
  })

  test("joins the environment's run without minting", () => {
    const r = resolveRun({}, null, { OBSERVE_RUN: 'r-ENV', OBSERVE_SUBJECT: 'PR-1' })
    expect(r).toEqual({ run: 'r-ENV', subject: 'PR-1', minted: false, parentRun: null })
  })

  test("a caller's different run nests under the environment's", () => {
    const r = resolveRun({ run: 'r-MINE', subject: 'S' }, null, { OBSERVE_RUN: 'r-ENV' })
    expect(r).toEqual({ run: 'r-MINE', subject: 'S', minted: true, parentRun: 'r-ENV' })
  })

  test('reads the legacy SDLC_ run and subject tags', () => {
    const r = resolveRun({}, null, { SDLC_RUN: 'r-OLD', SDLC_SUBJECT: 'PR-2' })
    expect(r).toEqual({ run: 'r-OLD', subject: 'PR-2', minted: false, parentRun: null })
  })

  test("a caller's run equal to the environment's is the same run", () => {
    const r = resolveRun({ run: 'r-ENV' }, null, { OBSERVE_RUN: 'r-ENV' })
    expect(r).toMatchObject({ minted: false, parentRun: null })
  })
})

describe('resolveLineage', () => {
  const base = {
    id: 'child',
    startedAt: '2026-10-09T10:00:00Z',
    pidAlive: (pid: number) => pid === 100,
  }

  test('is null with no parent in the environment', () => {
    expect(resolveLineage({ ...base, parentRecord: () => null, env: {} })).toBeNull()
  })

  test('keeps a parent session that has a record and had not ended', () => {
    const env = { OBSERVE_SESSION: 'parent' }
    expect(resolveLineage({ ...base, parentRecord: () => ({ endedAt: null }), env })).toEqual({
      session: 'parent',
      invocation: null,
    })
  })

  test('drops a parent that ended before this start, or has no record', () => {
    const env = { OBSERVE_SESSION: 'parent' }
    const ended = () => ({ endedAt: '2026-10-09T09:00:00Z' })
    expect(resolveLineage({ ...base, parentRecord: ended, env })).toBeNull()
    expect(resolveLineage({ ...base, parentRecord: () => null, env })).toBeNull()
  })

  test('never looks up an unsafe session id', () => {
    const asked: string[] = []
    const env = { OBSERVE_SESSION: '../etc' }
    const parentRecord = (s: string) => (asked.push(s), { endedAt: null })
    expect(resolveLineage({ ...base, parentRecord, env })).toBeNull()
    expect(asked).toEqual([])
  })

  test('keeps an invocation only while its process is alive', () => {
    const live = { OBSERVE_INVOCATION: 'i-1', OBSERVE_INVOCATION_PID: '100' }
    const dead = { OBSERVE_INVOCATION: 'i-1', OBSERVE_INVOCATION_PID: '999' }
    const group = { OBSERVE_INVOCATION: 'i-1', OBSERVE_INVOCATION_PID: '0' }
    const lineage = (env: Record<string, string>) =>
      resolveLineage({ ...base, parentRecord: () => null, env })
    expect(lineage(live)).toEqual({ session: null, invocation: 'i-1' })
    expect(lineage(dead)).toBeNull()
    expect(lineage(group)).toBeNull()
  })

  test('reads the legacy SDLC_ session and invocation tags', () => {
    const env = { SDLC_SESSION: 'parent', SDLC_INVOCATION: 'i-1', SDLC_INVOCATION_PID: '100' }
    expect(resolveLineage({ ...base, parentRecord: () => ({ endedAt: null }), env })).toEqual({
      session: 'parent',
      invocation: 'i-1',
    })
  })

  test('ignores its own id as a parent', () => {
    const env = { OBSERVE_SESSION: 'child' }
    expect(resolveLineage({ ...base, parentRecord: () => ({ endedAt: null }), env })).toBeNull()
  })
})
