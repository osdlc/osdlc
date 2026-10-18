/**
 * The lifecycle runner (experimental): what a launcher appends between
 * `launched` and the end, behind ports it supplies.
 */

import { describe, expect, test } from 'vitest'

import {
  endSession,
  resolveLineage,
  resolveRun,
  runHeadlessSession,
  runInteractiveSession,
  type HostOpened,
  type InteractiveResult,
  type InteractiveRun,
  type LifecycleEvent,
  type LifecyclePorts,
  type RunContext,
  type SessionRunState,
} from '@osdlc/observe/session'

type Host = 'terminal' | 'tmux'

/** Ports over an in-memory log, where a real launcher appends to the session's events.jsonl. */
function memoryPorts() {
  const log: LifecycleEvent<Host>['kind'][] = []
  let state: SessionRunState | null = 'starting'
  const ports: LifecyclePorts<Host> = {
    emit: (event) => {
      log.push(event.kind)
      if (event.kind === 'state_changed') state = event.to
    },
    state: () => state,
    now: () => new Date().toISOString(),
  }
  return { ports, log }
}

describe('a headless session', () => {
  test('attaches the pid as soon as the process exists, and ends with the exit code', async () => {
    const { ports, log } = memoryPorts()

    const result = await runHeadlessSession(ports, async (onSpawn) => {
      onSpawn(4242) // the agent process started
      return { exitCode: 0 }
    })

    expect(result.exitCode).toBe(0)
    expect(log).toEqual(['host_attached', 'state_changed', 'outcome', 'state_changed', 'ended'])
  })
})

describe('an interactive session', () => {
  test('a host that waits ends the record when the person leaves', () => {
    const { ports, log } = memoryPorts()
    const run: InteractiveRun<Host> = {
      host: 'tmux',
      waits: true,
      beforeLaunch: () => {}, // the launcher writes `launched` here
      open: (beforeLaunch): HostOpened => {
        beforeLaunch()
        return { exitCode: 0, harnessSessionId: 'h-1' }
      },
      presetHarnessSessionId: null,
    }

    const result: InteractiveResult = runInteractiveSession(ports, run)

    expect(result.harnessSessionId).toBe('h-1')
    expect(log.at(-1)).toBe('ended')
  })

  test('endSession writes the end once, whatever a hook already wrote', () => {
    const { ports, log } = memoryPorts()

    endSession(ports, 'running', new Date().toISOString(), 'closed')

    expect(log).toEqual(['state_changed', 'ended'])
  })
})

describe('runs and lineage', () => {
  test('join the run in the environment, or mint one', () => {
    const joined: RunContext = resolveRun({}, null, { OBSERVE_RUN: 'r-PARENT' })
    const minted = resolveRun({}, 'issue-42', {})

    expect(joined).toMatchObject({ run: 'r-PARENT', minted: false })
    expect(minted).toMatchObject({ subject: 'issue-42', minted: true })
  })

  test('record the session that launched this one while it is still live', () => {
    const parent = resolveLineage({
      id: 'child',
      startedAt: '2026-10-17T09:00:00.000Z',
      env: { OBSERVE_SESSION: 'parent' },
      parentRecord: () => ({ endedAt: null }),
      pidAlive: () => false,
    })

    expect(parent).toEqual({ session: 'parent', invocation: null })
  })
})
