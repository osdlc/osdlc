/**
 * cmux 0.64.17 host tests. Provenance (S-0014, docs/planning/research/cmux.md):
 * - OBSERVED: the `--help` flag spellings used in the argv builders; the
 *   `cmux sessions list --json` envelope (`sessions`, `stores`, ...; the
 *   hook store was empty); "Access denied" from the socket for outside callers.
 * - DOCS-ONLY (synthetic fixtures below): the field names inside a
 *   `sessions` row and inside `workspace list --json`. Confirm with a capture
 *   from inside cmux before trusting them.
 */

import { mkdtempSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

import {
  cmuxCloseArgv,
  cmuxCreateArgv,
  cmuxFocusArgv,
  cmuxReadScreenArgv,
  cmuxSendArgv,
  cmuxSendEnterArgv,
  makeCmuxHost,
  parseCmuxSessions,
  parseCmuxWorkspaces,
} from '../src/hosts/cmux.ts'

const ok = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const denied: CommandResult = {
  exitCode: 1,
  stdout: '',
  stderr: 'Error: ERROR: Access denied — only processes started inside cmux can connect',
}

function scripted(handler: (argv: string[]) => CommandResult): {
  runner: CommandRunner
  calls: string[][]
} {
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run(argv) {
        calls.push([...argv])
        return handler(argv)
      },
    },
  }
}

const sessionsJson = JSON.stringify({
  sessions: [
    { agent: 'claude', cwd: '/w', workspace_id: 'W1', surface_id: 'S1' },
    { agent: 'codex', cwd: '/other', workspace_id: 'W2', surface_id: 'S2' },
    { agent: 'mystery', cwd: '/w', workspace_id: 'W3' },
  ],
  stores: [],
})

describe('cmux argv', () => {
  test('create is unfocused', () => {
    expect(cmuxCreateArgv({ cwd: '/w', argv: ['claude'], title: 'T' })).toEqual([
      'workspace',
      'create',
      '--name',
      'T',
      '--cwd',
      '/w',
      '--command',
      'claude',
      '--focus',
      'false',
    ])
  })
  test('send, enter, focus, read-screen target explicitly', () => {
    expect(cmuxSendArgv('W1/S1', '-x')).toEqual([
      'send',
      '--workspace',
      'W1',
      '--surface',
      'S1',
      '--',
      '-x',
    ])
    expect(cmuxSendEnterArgv('W1')).toEqual(['send-key', '--workspace', 'W1', '--', 'enter'])
    expect(cmuxFocusArgv('W1/S1')).toEqual(['workspace', 'select', 'W1'])
    expect(cmuxReadScreenArgv('W1/S1')).toEqual([
      'read-screen',
      '--workspace',
      'W1',
      '--surface',
      'S1',
    ])
  })
})

describe('cmux parsing (docs-only fixtures)', () => {
  test('sessions: exact cwd, harness from agent, handle workspace/surface', () => {
    expect(parseCmuxSessions(sessionsJson, '/w')).toEqual([
      { cwd: '/w', harness: 'claude', alive: true, lastOutputAt: null, handle: 'W1/S1' },
      { cwd: '/w', harness: null, alive: true, lastOutputAt: null, handle: 'W3' },
    ])
    expect(parseCmuxSessions('not json', '/w')).toEqual([])
    expect(parseCmuxSessions('{"sessions":[]}', '/w')).toEqual([])
  })
  test('workspaces', () => {
    const out = JSON.stringify([
      { ref: 'workspace:2', cwd: '/w' },
      { ref: 'workspace:3', cwd: '/x' },
    ])
    expect(parseCmuxWorkspaces(out, '/w').map((f) => f.handle)).toEqual(['workspace:2'])
  })
})

describe('cmux host', () => {
  test('session create failure surfaces stderr', () => {
    const { runner } = scripted(() => ({ exitCode: 2, stdout: '', stderr: 'socket down' }))
    expect(() =>
      makeCmuxHost({ runner }).session!({
        cwd: '/w',
        harness: 'claude',
        binary: 'claude',
        prompt: 'p',
        title: 't',
      }),
    ).toThrow(/socket down/)
  })

  test('send: types then enter, ack false', () => {
    const { runner, calls } = scripted((argv) => (argv[0] === 'sessions' ? ok(sessionsJson) : ok()))
    expect(makeCmuxHost({ runner }).send!({ cwd: '/w', text: 'hi' })).toEqual({
      accepted: true,
      ack: false,
    })
    expect(calls.map((c) => c[0])).toEqual(['sessions', 'send', 'send-key'])
  })

  test('send: a failed Enter after the text was typed is accepted-uncertain, never retyped', () => {
    const { runner } = scripted((argv) =>
      argv[0] === 'sessions' ? ok(sessionsJson) : argv[0] === 'send-key' ? denied : ok(),
    )
    expect(makeCmuxHost({ runner }).send!({ cwd: '/w', text: 'hi' })).toEqual({
      accepted: true,
      ack: false,
      uncertain: true,
    })
  })

  test('send refuses text that cmux would type as Enter or Tab', () => {
    const { runner, calls } = scripted(() => ok(sessionsJson))
    const host = makeCmuxHost({ runner })
    for (const text of ['a\nb', 'a\rb', 'a\\nb', 'a\\tb']) {
      expect(host.send!({ cwd: '/w', text })).toEqual({ accepted: false, ack: false })
    }
    expect(calls).toHaveLength(0)
  })

  test('cwd compares by realpath', () => {
    const real = realpathSync(tmpdir())
    const link = join(mkdtempSync(join(real, 'cmx-')), 'link')
    symlinkSync(real, link)
    const out = JSON.stringify([{ ref: 'workspace:2', cwd: link }])
    expect(parseCmuxWorkspaces(out, real).map((f) => f.handle)).toEqual(['workspace:2'])
  })

  test('socket denied: find still answers from the store; send/focus/capture degrade quietly', () => {
    const { runner } = scripted((argv) => (argv[0] === 'sessions' ? ok(sessionsJson) : denied))
    const host = makeCmuxHost({ runner })
    expect(host.find!({ cwd: '/w' })).toHaveLength(2)
    expect(host.send!({ cwd: '/w', text: 'hi' })).toEqual({ accepted: false, ack: false })
    expect(host.focus!({ cwd: '/w' })).toBe(false)
    expect(host.capture!({ cwd: '/w' })).toBeNull()
  })

  test('no store entry and socket denied: nothing found, nothing throws', () => {
    const { runner } = scripted((argv) => (argv[0] === 'sessions' ? ok('{"sessions":[]}') : denied))
    const host = makeCmuxHost({ runner })
    expect(host.find!({ cwd: '/w' })).toEqual([])
    expect(host.send!({ cwd: '/w', text: 'x' }).accepted).toBe(false)
  })

  test('send never types into a workspace found only by cwd (no agent in the store)', () => {
    const list = JSON.stringify([{ ref: 'workspace:2', cwd: '/w' }])
    const { runner, calls } = scripted((argv) =>
      argv[0] === 'sessions' ? ok('{"sessions":[]}') : ok(list),
    )
    const host = makeCmuxHost({ runner })
    expect(host.find!({ cwd: '/w' })).toHaveLength(1)
    expect(host.send!({ cwd: '/w', text: 'hi' })).toEqual({ accepted: false, ack: false })
    expect(calls.some((c) => c[0] === 'send' || c[0] === 'send-key')).toBe(false)
  })

  test('send skips a store row with no known agent and uses the one that names it', () => {
    const rows = JSON.stringify({
      sessions: [
        { agent: 'mystery', cwd: '/w', workspace_id: 'W3' },
        { agent: 'claude', cwd: '/w', workspace_id: 'W1', surface_id: 'S1' },
      ],
    })
    const { runner, calls } = scripted((argv) => (argv[0] === 'sessions' ? ok(rows) : ok()))
    expect(makeCmuxHost({ runner }).send!({ cwd: '/w', text: 'hi' }).accepted).toBe(true)
    expect(calls.find((c) => c[0] === 'send')).toEqual(cmuxSendArgv('W1/S1', 'hi'))
  })

  test('send narrows to the requested harness and refuses unless exactly one agent row matches', () => {
    const rows = JSON.stringify({
      sessions: [
        { agent: 'claude', cwd: '/w', workspace_id: 'W1', surface_id: 'S1' },
        { agent: 'codex', cwd: '/w', workspace_id: 'W2', surface_id: 'S2' },
      ],
    })
    const toCodex = scripted((argv) => (argv[0] === 'sessions' ? ok(rows) : ok()))
    expect(
      makeCmuxHost({ runner: toCodex.runner }).send!({ cwd: '/w', text: 'hi', harness: 'codex' })
        .accepted,
    ).toBe(true)
    expect(toCodex.calls.find((c) => c[0] === 'send')).toEqual(cmuxSendArgv('W2/S2', 'hi'))
    const twoAgents = scripted((argv) => (argv[0] === 'sessions' ? ok(rows) : ok()))
    expect(makeCmuxHost({ runner: twoAgents.runner }).send!({ cwd: '/w', text: 'hi' })).toEqual({
      accepted: false,
      ack: false,
    })
    expect(twoAgents.calls.some((c) => c[0] === 'send')).toBe(false)
  })

  test('find falls back to the workspace list when the store is empty', () => {
    const list = JSON.stringify([{ ref: 'workspace:2', cwd: '/w' }])
    const { runner } = scripted((argv) =>
      argv[0] === 'sessions' ? ok('{"sessions":[]}') : ok(list),
    )
    expect(makeCmuxHost({ runner }).find!({ cwd: '/w' })[0]?.handle).toBe('workspace:2')
  })

  test('capture and focus use the resolved handle', () => {
    const { runner, calls } = scripted((argv) =>
      argv[0] === 'sessions' ? ok(sessionsJson) : ok('screen text'),
    )
    const host = makeCmuxHost({ runner })
    expect(host.capture!({ cwd: '/w' })).toBe('screen text')
    expect(host.focus!({ cwd: '/w' })).toBe(true)
    expect(calls.some((c) => c[0] === 'workspace' && c[1] === 'select' && c[2] === 'W1')).toBe(true)
  })

  test('close: closes the one workspace at the cwd; refuses when several are there or none', () => {
    expect(cmuxCloseArgv('W1/S1')).toEqual(['workspace', 'close', 'W1'])
    const one = JSON.stringify({
      sessions: [{ agent: 'claude', cwd: '/w', workspace_id: 'W1', surface_id: 'S1' }],
    })
    const single = scripted((argv) => (argv[0] === 'sessions' ? ok(one) : ok()))
    expect(makeCmuxHost({ runner: single.runner }).close!({ cwd: '/w', sessionId: 's-1' })).toBe(
      true,
    )
    expect(single.calls.at(-1)).toEqual(['workspace', 'close', 'W1'])
    // sessionsJson has two rows at /w, in two workspaces: any pick could close another session's.
    const several = scripted((argv) => (argv[0] === 'sessions' ? ok(sessionsJson) : ok()))
    expect(makeCmuxHost({ runner: several.runner }).close!({ cwd: '/w' })).toBe(false)
    expect(several.calls.some((c) => c[0] === 'workspace' && c[1] === 'close')).toBe(false)
    const none = scripted((argv) => (argv[0] === 'sessions' ? ok('{"sessions":[]}') : denied))
    expect(makeCmuxHost({ runner: none.runner }).close!({ cwd: '/w' })).toBe(false)
  })

  test('a session id changes nothing: cmux cannot bind a pane to one, so it resolves by cwd', () => {
    const { runner } = scripted((argv) => (argv[0] === 'sessions' ? ok(sessionsJson) : ok()))
    const host = makeCmuxHost({ runner })
    expect(host.find!({ cwd: '/w', sessionId: 's-1' })).toEqual(host.find!({ cwd: '/w' }))
  })
})
