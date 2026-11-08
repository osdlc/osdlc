/**
 * The examples in docs/guide/, run through the package name. A recording command runner stands
 * in for tmux, so no app is needed.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'
import { describe, expect, test } from 'vitest'

import {
  HOST_NAMES,
  HostPartMissing,
  WAIT_TIMEOUT_EXIT,
  hostCanWait,
  hostRegistry,
  makeTmuxHost,
  requirePart,
  supportsPlatform,
  type Host,
  type HostRegistry,
} from '@osdlc/agent-seat'

const runtimeDir = () => mkdtempSync(join(tmpdir(), 'agent-seat-guide-'))
const ok = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' })

/** A tmux stand-in: records each call and knows which sessions exist. */
function fakeTmux(live: string[] = []) {
  const sessions = new Set(live)
  const calls: string[][] = []
  const runner: CommandRunner = {
    run: (argv) => {
      calls.push(argv)
      const target = argv[argv.indexOf('-t') + 1]?.replace(/^=/, '').replace(/:$/, '')
      if (argv[0] === 'new-session') sessions.add(argv[argv.indexOf('-s') + 1]!)
      if (argv[0] === 'has-session') return sessions.has(target!) ? ok() : { ...ok(), exitCode: 1 }
      if (argv[0] === 'kill-session') sessions.delete(target!)
      if (argv[0] === 'capture-pane') return ok(`screen of ${target}`)
      return ok()
    },
  }
  return { runner, calls, sessions }
}

describe('getting started', () => {
  test('a missing part is a named error', () => {
    const hosts = hostRegistry({ runtimeDir: runtimeDir() })
    try {
      requirePart(hosts.vscode, 'capture')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(HostPartMissing)
      const missing = e as HostPartMissing
      expect(missing.message).toBe("host 'vscode' cannot read the recent screen text of a session")
      expect([missing.host, missing.part]).toEqual(['vscode', 'capture'])
    }
  })

  test('open a claude session in tmux, bound to an id', () => {
    const { runner, calls } = fakeTmux()
    const tmux = makeTmuxHost({ runner, available: () => true })
    expect(tmux.available()).toBe(true)
    const { exitCode, harnessSessionId } = requirePart(
      tmux,
      'session',
    )({
      cwd: '/work/my-repo',
      harness: 'claude',
      binary: 'claude',
      prompt: 'Read TODO.md and fix the first item.',
      title: 'todo 1',
      sessionId: 'todo-1',
    })
    expect(exitCode).toBe(0)
    expect(harnessSessionId).toBeNull()
    expect(calls[0]).toEqual([
      'new-session',
      '-d',
      '-s',
      'sd-todo-1-d7071d09',
      '-c',
      '/work/my-repo',
      '--',
      'claude',
      '--',
      'Read TODO.md and fix the first item.',
    ])
  })

  test('every built-in host is in the registry, and supportsPlatform reads its platforms', () => {
    const hosts = hostRegistry({ runtimeDir: runtimeDir() })
    expect(HOST_NAMES.every((name) => hosts[name].name === name)).toBe(true)
    expect(supportsPlatform(hosts.terminal)).toBe(true)
    expect(supportsPlatform(hosts.cmux, 'linux')).toBe(false)
    expect(hosts.tmux.platformHint?.win32).toBe('run inside WSL')
  })
})

describe('working with open sessions', () => {
  const query = { cwd: '/work/my-repo', sessionId: 'todo-1' }

  test('send types into the bound session; tmux cannot confirm, so ack is false', () => {
    const { runner, calls } = fakeTmux(['sd-todo-1-d7071d09'])
    const tmux = makeTmuxHost({ runner })
    const receipt = requirePart(
      tmux,
      'send',
    )({
      ...query,
      text: 'The tests in auth.test.ts fail; please fix them.',
    })
    expect(receipt).toEqual({ accepted: true, ack: false })
    expect(tmux.acksSend).toBeFalsy()
    expect(calls.map((c) => c[0])).toEqual([
      'has-session',
      'load-buffer',
      'paste-buffer',
      'send-keys',
    ])
  })

  test('send to no session is not accepted, and never throws', () => {
    const tmux = makeTmuxHost({ runner: fakeTmux().runner })
    expect(requirePart(tmux, 'send')({ ...query, text: 'hi' })).toEqual({
      accepted: false,
      ack: false,
    })
  })

  test('find, capture and close', () => {
    const { runner, sessions } = fakeTmux(['sd-todo-1-d7071d09'])
    const tmux = makeTmuxHost({ runner, inside: () => false })
    expect(requirePart(tmux, 'find')(query)).toEqual([
      {
        cwd: '/work/my-repo',
        harness: null,
        alive: true,
        lastOutputAt: null,
        handle: 'sd-todo-1-d7071d09',
      },
    ])
    expect(requirePart(tmux, 'capture')(query)).toBe('screen of sd-todo-1-d7071d09')
    // focus switches the current tmux client, so outside tmux there is nothing to switch.
    expect(requirePart(tmux, 'focus')(query)).toBe(false)
    expect(requirePart(tmux, 'close')(query)).toBe(true)
    expect(sessions.has('sd-todo-1-d7071d09')).toBe(false)
    expect(requirePart(tmux, 'close')(query)).toBe(false)
  })

  test('a waited launch is named after the run', () => {
    expect(hostCanWait('tmux')).toBe(true)
    expect(hostCanWait('wezterm')).toBe(false)
    expect(WAIT_TIMEOUT_EXIT).toBe(124)
    const { runner, calls } = fakeTmux()
    // The pane reports itself dead with status 0 on the first poll.
    const waiting: CommandRunner = {
      run: (argv, o) => (argv[0] === 'display-message' ? ok('1 0\n') : runner.run(argv, o)),
    }
    const tmux = makeTmuxHost({ runner: waiting, sleep: () => {} })
    const { exitCode } = requirePart(
      tmux,
      'session',
    )({
      cwd: '/work/my-repo',
      harness: 'codex',
      binary: 'codex',
      prompt: 'Run the nightly dependency check.',
      title: 'nightly',
      wait: { runId: 'nightly-2026-11-07', timeoutMs: 30 * 60_000 },
    })
    expect(exitCode).toBe(0)
    expect(calls[0]?.slice(0, 4)).toEqual(['new-session', '-d', '-s', 'sd-nightly-2026-11-07'])
  })
})

describe('testing', () => {
  test('a fake host carries only the parts a test needs', () => {
    const sent: string[] = []
    const fake: Host = {
      name: 'tmux',
      platforms: 'all',
      available: () => true,
      send: (req) => {
        sent.push(req.text)
        return { accepted: true, ack: false }
      },
    }
    const hosts: HostRegistry = { ...hostRegistry({ runtimeDir: runtimeDir() }), tmux: fake }
    expect(requirePart(hosts.tmux, 'send')({ cwd: '/w', text: 'go' })).toEqual({
      accepted: true,
      ack: false,
    })
    expect(sent).toEqual(['go'])
    expect(() => requirePart(hosts.tmux, 'capture')).toThrow(HostPartMissing)
  })
})
