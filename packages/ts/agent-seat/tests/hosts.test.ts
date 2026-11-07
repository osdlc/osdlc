import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import {
  shellJoin,
  type CommandResult,
  type CommandRunner,
  type StreamRunner,
} from '@osdlc/command-seam'

import type {
  CommandRequest,
  FindQuery,
  FoundSession,
  SendRequest,
  SessionRequest,
} from '../src/contract.ts'
import {
  codexSessionsDir,
  findCodexSessionId,
  harnessArgv,
  harnessAvailable,
  harnessNativeSend,
  newestRolloutSessionIdSince,
  parseRolloutMeta,
  ROLLOUT_CREATED_MARGIN_MS,
  sessionViaTerminal,
  withEnv,
  wrapperSession,
} from '../src/harness.ts'
import {
  makeOrcaHost,
  orcaCreateArgv,
  orcaFindArgv,
  orcaSendArgv,
  orcaSwitchArgv,
  parseOrcaFindResponse,
  parseOrcaSendResponse,
  orcaCloseArgv,
  parseOrcaCreatedHandle,
  resolveOrcaHandle,
} from '../src/hosts/orca.ts'
import { makeTerminalHost, terminalHost } from '../src/hosts/terminal.ts'
import {
  makeTmuxHost,
  tmuxAttachArgv,
  tmuxCapturePaneArgv,
  tmuxCreateArgv,
  tmuxHasSessionArgv,
  tmuxIdSessionName,
  tmuxKillSessionArgv,
  tmuxLoadBufferArgv,
  tmuxPasteBufferArgv,
  tmuxRunSessionName,
  tmuxSendEnterArgv,
  tmuxSessionName,
  tmuxSwitchClientArgv,
} from '../src/hosts/tmux.ts'
import { HostPartMissing, requirePart, supportsPlatform, type Host } from '../src/index.ts'
import { rolloutFileName } from './fixtures/codex-rollout.ts'
import { RUNTIME } from './fixtures/runtime.ts'

// A host's `session` part takes no codex home, so `homedir()` points at a temp dir:
// no test here reads or writes the real `~/.codex`.
const home = vi.hoisted(() => ({ dir: '' }))
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>()
  const homedir = () => home.dir
  return { ...os, homedir, default: { ...os, homedir } }
})
beforeAll(() => {
  home.dir = mkdtempSync(join(tmpdir(), 'hosts-test-home-'))
})
afterAll(() => rmSync(home.dir, { recursive: true, force: true }))

const sendReq: SendRequest = { cwd: '/w', text: "feedback: fix it's typo" }
const findQuery: FindQuery = { cwd: '/w' }

const session: SessionRequest = {
  cwd: '/w',
  harness: 'claude',
  binary: 'claude',
  prompt: "Review it's #1",
  title: 'PR #1',
}
const req: CommandRequest = {
  cwd: '/w',
  argv: harnessArgv(session.harness, session.binary, session.prompt),
  title: 'PR #1',
}

function recorder(replies: CommandResult[]): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      return replies.shift() ?? { exitCode: 0, stdout: '', stderr: '' }
    },
  }
  return { runner, calls }
}

/**
 * Puts a throwaway no-op executable named `bin` on PATH for the duration of
 * `fn`, restoring PATH after — used by the `terminal host` tests below,
 * which exercise `makeTerminalHost`'s REAL default runner (`streamRunner`,
 * `@osdlc/command-seam`) end to end rather than an injected fake (see its own
 * fake-injection describe block further down for that), and by the AC-1
 * tests further down, to prove a harness spawns via the real PATH lookup
 * without ever invoking a real interactive `claude`/`codex`/`cursor-agent`.
 */
function withFakeBinaryOnPath<T>(bin: string, fn: (cwd: string) => T): T {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'sdlc-host-test-'))
  writeFileSync(join(dir, bin), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  const oldPath = process.env['PATH']
  process.env['PATH'] = `${dir}:${oldPath ?? ''}`
  try {
    return fn(dir)
  } finally {
    process.env['PATH'] = oldPath
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('harness argv', () => {
  test('the bare CLI, `--`-guarded, with the prompt as first message', () => {
    expect(harnessArgv('claude', 'claude', 'hi')).toEqual(['claude', '--', 'hi'])
    expect(harnessArgv('codex', 'codex', 'hi')).toEqual(['codex', '--', 'hi'])
    expect(harnessArgv('cursor', 'cursor-agent', 'hi')).toEqual(['cursor-agent', '--', 'hi'])
    expect(harnessArgv('pi', 'pi', 'hi')).toEqual(['pi', '--', 'hi'])
    const claude = {
      appendSystemPrompt: 'sys',
      plugins: { dirs: ['/p'], disable: ['sdlc@osdlc'] },
    }
    expect(harnessArgv('claude', 'claude', 'hi', claude)).toEqual([
      'claude',
      '--plugin-dir',
      '/p',
      '--settings',
      '{"enabledPlugins":{"sdlc@osdlc":false}}',
      '--append-system-prompt',
      'sys',
      '--',
      'hi',
    ])
    expect(harnessArgv('codex', 'codex', 'hi', claude)).toEqual(['codex', '--', 'hi'])
  })
  test('shellJoin survives single quotes and spaces', () => {
    expect(shellJoin(['claude', "it's a test"])).toBe(`claude 'it'\\''s a test'`)
  })
})

describe('harnessAvailable (AC-2)', () => {
  test('true when the harness binary is on PATH', () => {
    withFakeBinaryOnPath('pi', () => {
      expect(harnessAvailable('pi', 'pi')).toBe(true)
    })
  })
  test('false when the harness binary is not on PATH', () => {
    // Restricted to the base system directories, same technique as the
    // `terminal host` describe block's own "not on PATH" test below.
    const oldPath = process.env['PATH']
    process.env['PATH'] = '/usr/bin:/bin'
    try {
      expect(harnessAvailable('pi', 'pi')).toBe(false)
    } finally {
      process.env['PATH'] = oldPath
    }
  })
})

describe('sessionViaTerminal', () => {
  test("runs the host it is called on through that host's own terminal", () => {
    const seen: CommandRequest[] = []
    const host = {
      terminal(r: CommandRequest): number {
        seen.push(r)
        return 7
      },
      session: sessionViaTerminal,
    }
    expect(host.session(session).exitCode).toBe(7)
    expect(seen).toHaveLength(1)
  })

  test('a host with no terminal part throws instead of starting nothing', () => {
    expect(() => sessionViaTerminal.call({}, session)).toThrow(/no terminal part/)
  })
})

describe('wrapperSession', () => {
  test('runs harnessArgv(req.harness, req.prompt) through the given runTerminal and returns its exit code', () => {
    const seen: CommandRequest[] = []
    const runTerminal = (r: CommandRequest): number => {
      seen.push(r)
      return 5
    }
    const result = wrapperSession(runTerminal, session)
    expect(result.exitCode).toBe(5)
    expect(seen).toEqual([
      {
        cwd: session.cwd,
        argv: harnessArgv(session.harness, session.binary, session.prompt),
        title: session.title,
      },
    ])
  })

  test('req.env prefixes the terminal argv with `env K=V`', () => {
    const seen: CommandRequest[] = []
    wrapperSession(
      (r) => {
        seen.push(r)
        return 0
      },
      { ...session, env: { SDLC_SESSION: 's1' } },
    )
    expect(seen[0]!.argv.slice(0, 3)).toEqual(['env', 'SDLC_SESSION=s1', 'claude'])
    expect(seen[0]!.argv.slice(2)).toEqual(
      harnessArgv(session.harness, session.binary, session.prompt),
    )
  })

  test('withEnv unsets an undefined var with -u before setting the rest', () => {
    expect(withEnv(['claude'], { A: '1', B: undefined })).toEqual([
      'env',
      '-u',
      'B',
      'A=1',
      'claude',
    ])
  })

  test('withEnv on win32 sets the vars in a powershell command, never an `env` prefix', () => {
    const argv = withEnv(['claude', "it's"], { A: "o'k", B: undefined }, 'win32')
    expect(argv.slice(0, 3)).toEqual(['powershell', '-NoProfile', '-Command'])
    expect(argv).toHaveLength(4)
    expect(argv[3]).toBe(
      "$env:A = 'o''k'; Remove-Item -ErrorAction SilentlyContinue 'Env:B'; & claude 'it''s'",
    )
    expect(argv).not.toContain('env')
  })
  test('withEnv on win32 refuses a variable name that is not a plain identifier', () => {
    expect(() => withEnv(['claude'], { 'A; calc': '1' }, 'win32')).toThrow(/invalid environment/)
    expect(() => withEnv(['claude'], { 'A B': undefined }, 'win32')).toThrow(/invalid environment/)
  })
  test('withEnv leaves argv alone when there is nothing to set', () => {
    expect(withEnv(['claude'], undefined)).toEqual(['claude'])
    expect(withEnv(['claude'], {})).toEqual(['claude'])
  })

  test('a harness with no session-id resolver (claude, cursor, pi) always reports harnessSessionId: null', () => {
    const cursorSession: SessionRequest = { ...session, harness: 'cursor', binary: 'cursor-agent' }
    const piSession: SessionRequest = { ...session, harness: 'pi', binary: 'pi' }
    expect(wrapperSession(() => 0, session).harnessSessionId).toBeNull()
    expect(wrapperSession(() => 0, cursorSession).harnessSessionId).toBeNull()
    expect(wrapperSession(() => 0, piSession).harnessSessionId).toBeNull()
  })
})

describe('a harness can open in more than one host via the same registry (AC-1)', () => {
  test('codex is not hardcoded into any one host: orca and terminal both dispatch harnessArgv("codex", prompt)', () => {
    const codexSession: SessionRequest = { ...session, harness: 'codex', binary: 'codex' }
    const expectedArgv = harnessArgv('codex', 'codex', codexSession.prompt)
    expect(expectedArgv).toEqual(['codex', '--', codexSession.prompt])

    // orca: the argv ends up shell-quoted inside its own `--command` string. Orca
    // returns before codex starts, so its session part would poll for the rollout;
    // the same body runs here with no wait.
    const { runner, calls } = recorder([{ exitCode: 0, stdout: '', stderr: '' }])
    const orcaHost = makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner })
    expect(wrapperSession((r) => orcaHost.terminal!(r), codexSession, { waitMs: 0 })).toEqual({
      exitCode: 0,
      harnessSessionId: null,
    })
    expect(calls[0]?.[7]).toBe(shellJoin(expectedArgv))

    // terminal: the same argv is spawned directly (raw, no shell quoting) —
    // proven end to end via a throwaway `codex` binary on PATH against the
    // production `terminalHost` (a fake-injection equivalent lives in the
    // `terminal host` describe block below).
    withFakeBinaryOnPath('codex', (cwd) => {
      expect(terminalHost.session!({ ...codexSession, cwd })).toEqual({
        exitCode: 0,
        harnessSessionId: null,
      })
    })
  })

  test('codex harnessSessionId resolves through wrapperSession when opened via the plain terminal host, not a bespoke codex host', () => {
    // The host's session part injects no `codexHome`, as a real launch does, so the
    // fixture goes under `codexSessionsDir()`: the mocked home directory above.
    expect(codexSessionsDir().startsWith(home.dir)).toBe(true)
    const dayDir = join(codexSessionsDir(), '2099', '12', '31')
    mkdirSync(dayDir, { recursive: true })
    const cwd = mkdtempSync(join(realpathSync(tmpdir()), 'sdlc-wrapper-session-codex-'))
    // Named for now: within the margin of `wrapperSession`'s `sinceMs`, taken moments later.
    const matchPath = join(dayDir, rolloutFileName(Date.now(), `t${process.pid}`))
    try {
      writeFileSync(
        matchPath,
        `${JSON.stringify({ payload: { session_id: 'terminal-codex-id', cwd } })}\n`,
      )

      withFakeBinaryOnPath('codex', () => {
        const codexSession: SessionRequest = { ...session, harness: 'codex', binary: 'codex', cwd }
        expect(terminalHost.session!(codexSession)).toEqual({
          exitCode: 0,
          harnessSessionId: 'terminal-codex-id',
        })
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('orca host', () => {
  test('argv', () => {
    expect(orcaCreateArgv(req)).toEqual([
      'terminal',
      'create',
      '--worktree',
      'path:/w',
      '--title',
      'PR #1',
      '--command',
      `claude -- 'Review it'\\''s #1'`,
      '--focus',
      '--json',
    ])
  })

  test('a miss registers the repo and retries once', () => {
    const { runner, calls } = recorder([
      { exitCode: 1, stdout: '', stderr: 'unknown worktree' },
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 0, stdout: '{}', stderr: '' },
    ])
    const host = makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner, repoRoot: '/repo' })
    expect(host.session!(session)).toEqual({ exitCode: 0, harnessSessionId: null })
    expect(calls.map((c) => c.slice(0, 2))).toEqual([
      ['terminal', 'create'],
      ['repo', 'add'],
      ['terminal', 'create'],
    ])
    expect(calls[1]).toEqual(['repo', 'add', '--path', '/repo'])
  })

  test('a second miss surfaces stderr', () => {
    const { runner } = recorder([
      { exitCode: 1, stdout: '', stderr: 'nope' },
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: 'still nope' },
    ])
    const host = makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner, repoRoot: '/repo' })
    expect(() => host.terminal!(req)).toThrow(/still nope/)
  })

  test('no binary means unavailable', () => {
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: null }).available()).toBe(false)
  })

  test('send argv addresses a handle and waits in seconds (AC-1)', () => {
    expect(orcaSendArgv('term_abc', 'hi')).toEqual([
      'terminal',
      'send',
      '--terminal',
      'term_abc',
      '--text',
      'hi',
      '--enter',
      '--wait-submit',
      '10',
      '--json',
    ])
  })

  /** An `orca terminal list --json` reply in its real envelope. */
  function listReply(terminals: Record<string, unknown>[]): CommandResult {
    return { exitCode: 0, stdout: JSON.stringify({ ok: true, result: { terminals } }), stderr: '' }
  }

  /** An `orca terminal send --json` reply in its real envelope. */
  function sendReply(stages: string[]): CommandResult {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        ok: true,
        result: { send: { accepted: true, prompt: { stages } } },
      }),
      stderr: '',
    }
  }

  const liveAgent = { handle: 'term_a', agentIdentity: 'claude', writable: true }

  test('send: resolves the live writable agent handle, then sends to it', () => {
    const { runner, calls } = recorder([
      listReply([
        { handle: 'term_shell', writable: true },
        { handle: 'term_ro', agentIdentity: 'claude', writable: false },
        liveAgent,
      ]),
      sendReply(['input_accepted', 'turn_started']),
    ])
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(sendReq)).toEqual({
      accepted: true,
      ack: true,
    })
    expect(calls[0]).toEqual(orcaFindArgv(findQuery))
    expect(calls[1]).toEqual(orcaSendArgv('term_a', sendReq.text))
  })

  test('send: with a harness, targets the one matching terminal and ignores other harnesses', () => {
    const { runner, calls } = recorder([
      listReply([{ handle: 'term_codex', agentIdentity: 'codex', writable: true }, liveAgent]),
      sendReply(['input_accepted', 'turn_started']),
    ])
    const req: SendRequest = { ...sendReq, harness: 'claude' }
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(req).accepted).toBe(
      true,
    )
    expect(calls[1]).toEqual(orcaSendArgv('term_a', sendReq.text))
  })

  test('send: two matching terminals refuse and run no send', () => {
    const { runner, calls } = recorder([
      listReply([liveAgent, { handle: 'term_b', agentIdentity: 'claude', writable: true }]),
    ])
    const req: SendRequest = { ...sendReq, harness: 'claude' }
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(req)).toEqual({
      accepted: false,
      ack: false,
    })
    expect(calls.filter((c) => c[1] === 'send')).toHaveLength(0)
  })

  test('send: with a harness and no terminal of that harness, refuses and runs no send', () => {
    const { runner, calls } = recorder([
      listReply([{ handle: 'term_codex', agentIdentity: 'codex', writable: true }]),
    ])
    const req: SendRequest = { ...sendReq, harness: 'claude' }
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(req).accepted).toBe(
      false,
    )
    expect(calls.filter((c) => c[1] === 'send')).toHaveLength(0)
  })

  test('send: without a harness, several live terminals refuse and run no send', () => {
    const { runner, calls } = recorder([
      listReply([liveAgent, { handle: 'term_b', agentIdentity: 'claude', writable: true }]),
    ])
    expect(
      makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(sendReq).accepted,
    ).toBe(false)
    expect(calls.filter((c) => c[1] === 'send')).toHaveLength(0)
  })

  test('send: accepted with no turn_started stage maps to ack: false', () => {
    const { runner } = recorder([listReply([liveAgent]), sendReply(['input_accepted'])])
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(sendReq)).toEqual({
      accepted: true,
      ack: false,
      uncertain: true,
    })
  })

  test('send: no live writable terminal returns not-accepted and never sends (AC-3)', () => {
    const { runner, calls } = recorder([
      listReply([
        { handle: 'term_shell', writable: true },
        { handle: 'term_ro', agentIdentity: 'claude', writable: false },
      ]),
    ])
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(sendReq)).toEqual({
      accepted: false,
      ack: false,
    })
    expect(calls.filter((c) => c[1] === 'send')).toHaveLength(0)
  })

  const stale: CommandResult = {
    exitCode: 1,
    stdout: JSON.stringify({ ok: false, error: { code: 'terminal_handle_stale' } }),
    stderr: '',
  }

  test('send: a stale handle re-lists and sends once more with the new handle (AC-4)', () => {
    const { runner, calls } = recorder([
      listReply([liveAgent]),
      stale,
      listReply([{ ...liveAgent, handle: 'term_b' }]),
      sendReply(['input_accepted', 'turn_started']),
    ])
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(sendReq)).toEqual({
      accepted: true,
      ack: true,
    })
    const sends = calls.filter((c) => c[1] === 'send')
    expect(sends).toHaveLength(2)
    expect(sends[1]).toEqual(orcaSendArgv('term_b', sendReq.text))
  })

  test('send: a second stale reply is not retried again', () => {
    const { runner, calls } = recorder([
      listReply([liveAgent]),
      stale,
      listReply([liveAgent]),
      stale,
    ])
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(sendReq)).toEqual({
      accepted: false,
      ack: false,
    })
    expect(calls.filter((c) => c[1] === 'send')).toHaveLength(2)
  })

  test('send: a non-stale failure is not retried', () => {
    const { runner, calls } = recorder([
      listReply([liveAgent]),
      {
        exitCode: 1,
        stdout: JSON.stringify({ ok: false, error: { code: 'timeout' } }),
        stderr: '',
      },
    ])
    expect(
      makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).send!(sendReq).accepted,
    ).toBe(false)
    expect(calls).toHaveLength(2)
  })

  test('send: a non-zero exit or unparseable stdout both degrade to accepted: false, never a throw', () => {
    const { runner: failRunner } = recorder([
      listReply([liveAgent]),
      { exitCode: 1, stdout: '', stderr: 'no such terminal' },
    ])
    expect(
      makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner: failRunner }).send!(sendReq),
    ).toEqual({
      accepted: false,
      ack: false,
    })
    expect(parseOrcaSendResponse('not json')).toEqual({ accepted: false, ack: false })
    expect(parseOrcaSendResponse('null')).toEqual({ accepted: false, ack: false })
  })

  test('send: no binary on PATH degrades to accepted: false rather than throwing', () => {
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: null }).send!(sendReq)).toEqual({
      accepted: false,
      ack: false,
    })
  })

  test('focus: switches to the handle from the list reply (AC-1)', () => {
    const { runner, calls } = recorder([
      listReply([{ handle: 'term_shell', agentIdentity: null, writable: true }, liveAgent]),
      { exitCode: 0, stdout: '{"ok":true}', stderr: '' },
    ])
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).focus!(findQuery)).toBe(
      true,
    )
    expect(calls).toEqual([orcaFindArgv(findQuery), orcaSwitchArgv('term_a')])
    expect(orcaSwitchArgv('term_a')).toEqual([
      'terminal',
      'switch',
      '--terminal',
      'term_a',
      '--json',
    ])
  })

  test('focus: no live terminal returns false and makes no switch call (AC-2)', () => {
    const { runner, calls } = recorder([
      listReply([{ handle: 'term_shell', agentIdentity: null, writable: true }]),
    ])
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).focus!(findQuery)).toBe(
      false,
    )
    expect(calls).toEqual([orcaFindArgv(findQuery)])
  })

  test('focus: a failed switch returns false', () => {
    const { runner } = recorder([listReply([liveAgent]), { exitCode: 1, stdout: '', stderr: 'x' }])
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).focus!(findQuery)).toBe(
      false,
    )
  })

  test('resolveOrcaHandle: a failed list resolves to null', () => {
    const { runner } = recorder([{ exitCode: 1, stdout: '', stderr: 'no such worktree' }])
    expect(resolveOrcaHandle(runner, '/w')).toBeNull()
  })

  test('find argv ([[T-UU2N]])', () => {
    expect(orcaFindArgv(findQuery)).toEqual(['terminal', 'list', '--worktree', 'path:/w', '--json'])
  })

  test('parseOrcaFindResponse: agentIdentity present -> alive with the matching Harness and handle', () => {
    const stdout = JSON.stringify([
      { handle: 'h1', agentIdentity: 'claude', lastOutputAt: '2026-09-27T00:00:00Z' },
    ])
    expect(parseOrcaFindResponse(stdout, '/w')).toEqual([
      {
        cwd: '/w',
        harness: 'claude',
        alive: true,
        lastOutputAt: '2026-09-27T00:00:00Z',
        handle: 'h1',
      },
    ])
  })

  test('parseOrcaFindResponse: epoch-millisecond lastOutputAt becomes an ISO timestamp', () => {
    const stdout = JSON.stringify([{ handle: 'h1', agentIdentity: 'claude', lastOutputAt: 0 }])
    expect(parseOrcaFindResponse(stdout, '/w')[0]?.lastOutputAt).toBe('1970-01-01T00:00:00.000Z')
  })

  test('parseOrcaFindResponse: no agentIdentity (plain shell) -> not alive, harness null', () => {
    const stdout = JSON.stringify([
      { handle: 'h1', agentIdentity: null, lastOutputAt: null },
      { handle: 'h2' },
    ])
    expect(parseOrcaFindResponse(stdout, '/w')).toEqual([
      { cwd: '/w', harness: null, alive: false, lastOutputAt: null, handle: 'h1' },
      { cwd: '/w', harness: null, alive: false, lastOutputAt: null, handle: 'h2' },
    ])
  })

  test('parseOrcaFindResponse: an unrecognized agentIdentity string is alive but harness: null', () => {
    const stdout = JSON.stringify([{ agentIdentity: 'some-other-agent' }])
    expect(parseOrcaFindResponse(stdout, '/w')).toEqual([
      { cwd: '/w', harness: null, alive: true, lastOutputAt: null, handle: null },
    ])
  })

  test('parseOrcaFindResponse: non-JSON, a non-array, or a non-object entry all degrade to [] / skip', () => {
    expect(parseOrcaFindResponse('not json', '/w')).toEqual([])
    expect(parseOrcaFindResponse(JSON.stringify({ not: 'an array' }), '/w')).toEqual([])
    expect(parseOrcaFindResponse(JSON.stringify([null, 'nope']), '/w')).toEqual([])
  })

  test('parseOrcaFindResponse: reads handles from the bare-array and result.terminals envelopes (AC-2)', () => {
    const entry = { handle: 'h1', agentIdentity: 'claude', lastOutputAt: null }
    const expected: FoundSession[] = [
      { cwd: '/w', harness: 'claude', alive: true, lastOutputAt: null, handle: 'h1' },
    ]
    expect(parseOrcaFindResponse(JSON.stringify([entry]), '/w')).toEqual(expected)
    expect(
      parseOrcaFindResponse(JSON.stringify({ ok: true, result: { terminals: [entry] } }), '/w'),
    ).toEqual(expected)
    expect(parseOrcaFindResponse(JSON.stringify({ terminals: [entry] }), '/w')).toEqual(expected)
  })

  test('find: a non-zero exit degrades to [] rather than throwing', () => {
    const { runner } = recorder([{ exitCode: 1, stdout: '', stderr: 'no such worktree' }])
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: 'orca', runner }).find!(findQuery)).toEqual(
      [],
    )
  })

  test('find: no binary on PATH degrades to [] rather than throwing', () => {
    expect(makeOrcaHost({ runtimeDir: RUNTIME, binary: null }).find!(findQuery)).toEqual([])
  })
})

describe('tmux host', () => {
  test('argv', () => {
    expect(tmuxCreateArgv(req)).toEqual([
      'new-session',
      '-d',
      '-s',
      tmuxSessionName('/w'),
      '-c',
      '/w',
      '--',
      'claude',
      '--',
      "Review it's #1",
    ])
  })

  test("argv: a command with an argument ending in ';' goes as one shell string, so tmux does not split it", () => {
    const argv = tmuxCreateArgv({
      cwd: '/w',
      argv: ['env', 'A=x;', 'claude', '--', 'run find . -exec ls {} \\;'],
      title: 't',
    })
    const command = ['env', 'A=x;', 'claude', '--', 'run find . -exec ls {} \\;']
    expect(argv.slice(argv.indexOf('--') + 1)).toEqual([`exec ${shellJoin(command)}`])
  })

  test('argv: a command with no argument ending in ; is passed as separate arguments', () => {
    const argv = tmuxCreateArgv({
      cwd: '/w',
      argv: ['claude', '--', 'fix it; then test'],
      title: 't',
    })
    expect(argv.slice(argv.indexOf('--') + 1)).toEqual(['claude', '--', 'fix it; then test'])
  })

  test('tmuxSessionName is deterministic for a given cwd, stable across calls, and matches [A-Za-z0-9_-]', () => {
    expect(tmuxSessionName('/w')).toBe(tmuxSessionName('/w'))
    expect(tmuxSessionName('/w')).not.toBe(tmuxSessionName('/other'))
    expect(tmuxSessionName('/w')).toMatch(/^sd-[0-9a-f]{12}$/)
  })

  test("available(): the injectable override, not a real onPath('tmux') check", () => {
    expect(makeTmuxHost({ available: () => true }).available()).toBe(true)
    expect(makeTmuxHost({ available: () => false }).available()).toBe(false)
  })

  test('failure surfaces stderr', () => {
    const { runner } = recorder([{ exitCode: 1, stdout: '', stderr: 'duplicate session: sd-abc' }])
    expect(() => makeTmuxHost({ runner }).session!(session)).toThrow(/duplicate session/)
  })

  test('a successful launch returns the {exitCode, harnessSessionId} shape, harnessSessionId null for a claude session', () => {
    // Same AC-1-style contract-shape pin the `orca`/`cmux` describe blocks
    // apply above: tmux's own `new-session` call carries no session identity
    // back either, and claude has no session-id resolver — see
    // `harness.ts`'s `SESSION_ID_RESOLVERS` doc.
    const { runner } = recorder([{ exitCode: 0, stdout: '', stderr: '' }])
    expect(makeTmuxHost({ runner }).session!(session)).toEqual({
      exitCode: 0,
      harnessSessionId: null,
    })
  })

  test('send argv: load-buffer (stdin), paste-buffer, then a separate Enter (AC-1, revised for embedded-newline safety)', () => {
    const name = tmuxSessionName('/w')
    const buf = `${name}-buf`
    expect(tmuxLoadBufferArgv(name)).toEqual(['load-buffer', '-b', buf, '-'])
    expect(tmuxPasteBufferArgv(name)).toEqual([
      'paste-buffer',
      '-p',
      '-d',
      '-b',
      buf,
      '-t',
      `=${name}:`,
    ])
    expect(tmuxSendEnterArgv(name)).toEqual(['send-keys', '-t', `=${name}:`, 'Enter'])
  })

  /** A stateful fake tmux server: `sessions` are the live session names; every call is logged. */
  function fakeTmux(sessions: string[], failing: string[] = []) {
    const live = new Set(sessions)
    const calls: { argv: string[]; input: string | undefined }[] = []
    const runner: CommandRunner = {
      run(argv, opts) {
        calls.push({ argv: [...argv], input: opts.input })
        const verb = argv[0]!
        // `=name` / `=name:` are exact-match session and pane targets.
        const target = argv[argv.indexOf('-t') + 1]?.replace(/^=/, '').replace(/:$/, '')
        if (failing.includes(verb)) return { exitCode: 1, stdout: '', stderr: 'boom' }
        if (verb === 'new-session') {
          const name = argv[argv.indexOf('-s') + 1]!
          if (live.has(name))
            return { exitCode: 1, stdout: '', stderr: `duplicate session: ${name}` }
          live.add(name)
          return { exitCode: 0, stdout: '', stderr: '' }
        }
        if (verb === 'load-buffer') return { exitCode: 0, stdout: '', stderr: '' }
        if (verb === 'list-sessions') {
          return { exitCode: 0, stdout: [...live].map((n) => `${n}\n`).join(''), stderr: '' }
        }
        if (target === undefined || !live.has(target)) {
          return { exitCode: 1, stdout: '', stderr: `can't find session: ${target}` }
        }
        if (verb === 'kill-session') live.delete(target)
        return {
          exitCode: 0,
          stdout: verb === 'capture-pane' ? `screen of ${target}` : '',
          stderr: '',
        }
      },
    }
    return { runner, calls, live }
  }
  const verbs = (calls: { argv: string[] }[]) => calls.map((c) => c.argv[0])

  test('send: text goes over stdin (load-buffer), never as an argv element', () => {
    const name = tmuxSessionName('/w')
    const { runner, calls } = fakeTmux([name])
    expect(makeTmuxHost({ runner }).send!(sendReq)).toEqual({ accepted: true, ack: false })
    expect(calls).toEqual([
      { argv: tmuxHasSessionArgv(name), input: undefined },
      { argv: tmuxLoadBufferArgv(name), input: sendReq.text },
      { argv: tmuxPasteBufferArgv(name), input: undefined },
      { argv: tmuxSendEnterArgv(name), input: undefined },
    ])
  })

  test('send: no live session means accepted: false and nothing typed', () => {
    const { runner, calls } = fakeTmux([])
    expect(makeTmuxHost({ runner }).send!(sendReq)).toEqual({ accepted: false, ack: false })
    expect(verbs(calls)).toEqual(['has-session'])
  })

  test('send: the load-buffer call failing short-circuits before paste/Enter, and reports accepted: false', () => {
    const { runner, calls } = fakeTmux([tmuxSessionName('/w')], ['load-buffer'])
    expect(makeTmuxHost({ runner }).send!(sendReq)).toEqual({ accepted: false, ack: false })
    expect(verbs(calls)).toEqual(['has-session', 'load-buffer'])
  })

  test('send: paste-buffer failing short-circuits before Enter, and reports accepted: false', () => {
    const { runner, calls } = fakeTmux([tmuxSessionName('/w')], ['paste-buffer'])
    expect(makeTmuxHost({ runner }).send!(sendReq)).toEqual({ accepted: false, ack: false })
    // Enter never sent once paste-buffer itself failed; the named buffer is deleted instead.
    expect(verbs(calls)).toEqual(['has-session', 'load-buffer', 'paste-buffer', 'delete-buffer'])
  })

  test('send: load-buffer and paste-buffer succeeding but the Enter call failing still reports accepted: false', () => {
    const { runner } = fakeTmux([tmuxSessionName('/w')], ['send-keys'])
    expect(makeTmuxHost({ runner }).send!(sendReq)).toEqual({ accepted: false, ack: false })
  })

  test('find argv: has-session ([[T-UU2N]])', () => {
    expect(tmuxHasSessionArgv('sd-x')).toEqual(['has-session', '-t', '=sd-x'])
  })

  test('find: an existing session reports one alive match with harness/lastOutputAt null (tmux cannot tell) and its name as handle', () => {
    const name = tmuxSessionName('/w')
    const { runner, calls } = fakeTmux([name])
    expect(makeTmuxHost({ runner }).find!(findQuery)).toEqual([
      { cwd: '/w', harness: null, alive: true, lastOutputAt: null, handle: name },
    ])
    expect(calls.map((c) => c.argv)).toEqual([tmuxHasSessionArgv(name)])
  })

  test('find: no session reports no matches', () => {
    const { runner } = fakeTmux([])
    expect(makeTmuxHost({ runner }).find!(findQuery)).toEqual([])
  })

  test('capture: capture-pane -p -t <name> returns stdout; failure returns null', () => {
    const name = tmuxSessionName('/w')
    const ok = fakeTmux([name])
    expect(makeTmuxHost({ runner: ok.runner }).capture!(findQuery)).toBe(`screen of ${name}`)
    expect(ok.calls.map((c) => c.argv)).toEqual([
      tmuxHasSessionArgv(name),
      tmuxCapturePaneArgv(name),
    ])
    expect(tmuxCapturePaneArgv(name)).toEqual(['capture-pane', '-p', '-t', `=${name}:`])
    expect(makeTmuxHost({ runner: fakeTmux([]).runner }).capture!(findQuery)).toBeNull()
  })

  describe('addressing by session id', () => {
    const idA = 'aaaaaaaa-1111-4222-8333-444444444444'
    const idB = 'bbbbbbbb-1111-4222-8333-444444444444'

    test('tmuxIdSessionName: sd-, the first 12 characters and a hash of the id, valid for tmux', () => {
      expect(tmuxIdSessionName(idA)).toBe('sd-aaaaaaaa-111-5ef00c0f')
      expect(tmuxIdSessionName(idA)).toMatch(/^sd-[A-Za-z0-9_-]+$/)
      expect(tmuxIdSessionName('a.b:c d e f g h')).toBe('sd-a_b_c_d_e_f_-daa9d69e')
      expect(tmuxIdSessionName(idA)).not.toBe(tmuxIdSessionName(idB))
    })

    test('tmuxIdSessionName: ids that share 12 characters or differ only where rewritten stay apart', () => {
      for (const [a, b] of [
        ['build-step-001', 'build-step-002'],
        ['a.b', 'a_b'],
      ] as const) {
        expect(tmuxIdSessionName(a)).not.toBe(tmuxIdSessionName(b))
        expect(tmuxRunSessionName('r', a)).not.toBe(tmuxRunSessionName('r', b))
        expect(tmuxIdSessionName(a)).toMatch(/^sd-[A-Za-z0-9_-]+$/)
      }
    })

    test('two sessions in one cwd launch as two tmux sessions (no duplicate-session collision)', () => {
      const { runner, live } = fakeTmux([])
      const host = makeTmuxHost({ runner })
      expect(host.session!({ ...session, cwd: '/w', sessionId: idA }).exitCode).toBe(0)
      expect(host.session!({ ...session, cwd: '/w', sessionId: idB }).exitCode).toBe(0)
      expect([...live].sort()).toEqual([tmuxIdSessionName(idA), tmuxIdSessionName(idB)])
    })

    test('without an id two launches in one cwd still collide on the cwd name, verbatim', () => {
      const { runner } = fakeTmux([])
      const host = makeTmuxHost({ runner })
      host.session!({ ...session, cwd: '/w' })
      expect(() => host.session!({ ...session, cwd: '/w' })).toThrow(/duplicate session/)
    })

    test('send, find, capture, focus and close each reach the pane bound to the id', () => {
      const { runner, calls, live } = fakeTmux([tmuxIdSessionName(idA), tmuxIdSessionName(idB)])
      const host = makeTmuxHost({ runner, inside: () => true })
      const q = { cwd: '/w', sessionId: idB }
      const target = tmuxIdSessionName(idB)
      expect(host.send!({ ...q, text: 'hi' })).toEqual({ accepted: true, ack: false })
      expect(host.find!(q)[0]?.handle).toBe(target)
      expect(host.capture!(q)).toBe(`screen of ${target}`)
      expect(host.focus!(q)).toBe(true)
      expect(host.close!(q)).toBe(true)
      // every call that names a tmux session names B's, never A's
      const named = calls.flatMap((c) =>
        c.argv.includes('-t')
          ? [c.argv[c.argv.indexOf('-t') + 1]!.replace(/^=/, '').replace(/:$/, '')]
          : [],
      )
      expect(new Set(named)).toEqual(new Set([target]))
      expect([...live]).toEqual([tmuxIdSessionName(idA)])
    })

    test('a session opened before ids were bound (cwd-hash name) is still reached from its id', () => {
      const legacy = tmuxSessionName('/w')
      const { runner, live } = fakeTmux([legacy])
      const host = makeTmuxHost({ runner })
      const q = { cwd: '/w', sessionId: idA }
      expect(host.find!(q)[0]?.handle).toBe(legacy)
      expect(host.send!({ ...q, text: 'hi' }).accepted).toBe(true)
      // close is stricter: see the next test.
      expect(live.size).toBe(1)
    })

    test("a waited run's session (named after the run) is reached from its id", () => {
      const run = tmuxRunSessionName('run-1', idA)
      const { runner, live } = fakeTmux([tmuxRunSessionName('run-2', idB), run])
      const host = makeTmuxHost({ runner })
      const q = { cwd: '/w', sessionId: idA }
      expect(host.find!(q)[0]?.handle).toBe(run)
      expect(host.send!({ ...q, text: 'hi' }).accepted).toBe(true)
      expect(host.capture!(q)).toBe(`screen of ${run}`)
      expect(host.close!(q)).toBe(true)
      expect([...live]).toEqual([tmuxRunSessionName('run-2', idB)])
    })

    test('a session whose own pane is gone does not fall onto another id-named session in the same cwd', () => {
      const { runner } = fakeTmux([tmuxIdSessionName(idB)])
      const host = makeTmuxHost({ runner })
      const q = { cwd: '/w', sessionId: idA }
      expect(host.find!(q)).toEqual([])
      expect(host.send!({ ...q, text: 'hi' }).accepted).toBe(false)
      expect(host.close!(q)).toBe(false)
    })

    test('close never falls back to the cwd-hash name for a session id (send/find/focus still do)', () => {
      const legacy = tmuxSessionName('/w')
      const { runner, live, calls } = fakeTmux([legacy])
      const host = makeTmuxHost({ runner })
      expect(host.close!({ cwd: '/w', sessionId: idA })).toBe(false)
      expect(live.has(legacy)).toBe(true)
      expect(verbs(calls)).not.toContain('kill-session')
      // Without an id the cwd's name is the only one there is.
      expect(host.close!({ cwd: '/w' })).toBe(true)
      expect(live.size).toBe(0)
    })

    test('close: kill-session on the resolved name; false when there is none or tmux fails', () => {
      expect(tmuxKillSessionArgv('sd-x')).toEqual(['kill-session', '-t', '=sd-x'])
      expect(makeTmuxHost({ runner: fakeTmux([]).runner }).close!({ cwd: '/w' })).toBe(false)
      const failing = fakeTmux([tmuxSessionName('/w')], ['kill-session'])
      expect(makeTmuxHost({ runner: failing.runner }).close!({ cwd: '/w' })).toBe(false)
    })
  })

  test('platforms: tmux is darwin+linux and off-platform it is unavailable', () => {
    const h = makeTmuxHost({})
    expect(h.platforms).toEqual(['darwin', 'linux'])
    expect(supportsPlatform(h, 'win32')).toBe(false)
    expect(supportsPlatform(h, 'linux')).toBe(true)
    expect(supportsPlatform(terminalHost, 'win32')).toBe(true)
  })

  test('focus: inside tmux, switch-client -t <name> (AC-3)', () => {
    const name = tmuxSessionName('/w')
    const { runner, calls } = fakeTmux([name])
    expect(makeTmuxHost({ runner, inside: () => true }).focus!(findQuery)).toBe(true)
    expect(calls.map((c) => c.argv)).toEqual([tmuxHasSessionArgv(name), tmuxSwitchClientArgv(name)])
    expect(tmuxSwitchClientArgv(name)).toEqual(['switch-client', '-t', `=${name}`])
  })

  test('focus: outside tmux returns false and runs nothing (AC-3)', () => {
    const { runner, calls } = fakeTmux([])
    expect(makeTmuxHost({ runner, inside: () => false }).focus!(findQuery)).toBe(false)
    expect(calls).toEqual([])
  })

  test('attach argv: attach-session -t <name> (session attach falls back to this for a still-open tmux session)', () => {
    expect(tmuxAttachArgv('sd-x')).toEqual(['attach-session', '-t', '=sd-x'])
  })
})

describe('send: AC-2 — a host with no send part is reported via requirePart, not a silent no-op', () => {
  test('terminal lacks a send part', () => {
    expect(() => requirePart(terminalHost, 'send')).toThrow(HostPartMissing)
    expect(() => requirePart(terminalHost, 'send')).toThrow(
      /cannot deliver a message into an already-open session/,
    )
  })
})

describe('find: a host with no find part is reported via requirePart, not a silent no-op ([[T-UU2N]])', () => {
  test('terminal lacks a find part', () => {
    expect(() => requirePart(terminalHost, 'find')).toThrow(HostPartMissing)
    expect(() => requirePart(terminalHost, 'find')).toThrow(/cannot find live sessions at a cwd/)
  })
})

describe('focus: terminal has no focus part', () => {
  test('requirePart names the missing part', () => {
    expect(() => requirePart(terminalHost, 'focus')).toThrow(/cannot bring a session forward/)
  })
})

describe('harnessNativeSend (AC-3): a harness-level native send, callable independently of any Host', () => {
  test('codex: argv sent through the command seam, never a real process', () => {
    const { runner, calls } = recorder([{ exitCode: 0, stdout: '', stderr: '' }])
    expect(harnessNativeSend('codex', 'thread-123', 'hi', { runner })).toEqual({
      accepted: true,
      ack: false, // a clean exit only proves the daemon ACCEPTED the queue request
    })
    expect(calls).toEqual([['queue', '--thread', 'thread-123', '--message', 'hi']])
  })

  test('codex: a non-zero exit maps to accepted: false', () => {
    const { runner } = recorder([{ exitCode: 1, stdout: '', stderr: 'no such thread' }])
    expect(harnessNativeSend('codex', 'thread-123', 'hi', { runner })).toEqual({
      accepted: false,
      ack: false,
    })
  })

  test('claude/cursor/pi have no known native-send mechanism: null, not a throw', () => {
    expect(harnessNativeSend('claude', 'x', 'hi')).toBeNull()
    expect(harnessNativeSend('cursor', 'x', 'hi')).toBeNull()
    expect(harnessNativeSend('pi', 'x', 'hi')).toBeNull()
  })
})

describe('a tmux-hosted pi session opens end to end, no real tmux/pi process started (AC-3)', () => {
  test('composed harness argv, the exact tmux new-session invocation including the derived tag, and harnessSessionId: null (no resolver for pi)', () => {
    const piSession: SessionRequest = { ...session, harness: 'pi', binary: 'pi' }
    const expectedHarnessArgv = harnessArgv('pi', 'pi', piSession.prompt)
    expect(expectedHarnessArgv).toEqual(['pi', '--', piSession.prompt])

    const { runner, calls } = recorder([{ exitCode: 0, stdout: '', stderr: '' }])
    const tmuxHost = makeTmuxHost({ runner })
    expect(tmuxHost.session!(piSession)).toEqual({ exitCode: 0, harnessSessionId: null })
    expect(calls).toEqual([
      [
        'new-session',
        '-d',
        '-s',
        tmuxSessionName(piSession.cwd),
        '-c',
        piSession.cwd,
        '--',
        ...expectedHarnessArgv,
      ],
    ])
  })
})

describe('terminal host', () => {
  // `makeTerminalHost({streamRunner})` (`hosts/terminal.ts`) takes an
  // injectable runner FACTORY — the streaming door's own shape, since
  // `req.argv[0]` names a different binary on every call — with a
  // fake-injection test in its own describe block below. The two tests here
  // instead prove the REAL default (`streamRunner`, `@osdlc/command-seam`) end
  // to end by putting a throwaway `claude` binary on PATH for the duration
  // of the test, ahead of any real `claude`/`codex`/`cursor-agent` install —
  // never invoking a real interactive harness.

  test('session(): spawns the harness in the current terminal and returns {exitCode, harnessSessionId: null} for claude (no resolver)', () => {
    withFakeBinaryOnPath('claude', (cwd) => {
      // `session`'s own `cwd: '/w'` is fine for the fake-runner tests above
      // (nothing ever really spawns there) but a REAL `spawnSync` needs a
      // `cwd` that actually exists on disk — the fresh temp dir stands in.
      expect(terminalHost.session!({ ...session, cwd })).toEqual({
        exitCode: 0,
        harnessSessionId: null,
      })
    })
  })

  test('a harness binary not on PATH throws', () => {
    // Restricting PATH to just the base system directories (which still
    // resolve system tools) but not any real
    // claude/codex/cursor-agent install.
    const oldPath = process.env['PATH']
    process.env['PATH'] = '/usr/bin:/bin'
    try {
      expect(() => terminalHost.session!(session)).toThrow(/'claude' is not on PATH/)
    } finally {
      process.env['PATH'] = oldPath
    }
  })
})

describe('terminal host — fake injection (AC-3: makeTerminalHost)', () => {
  test('terminal() runs through the injected runner factory, never a real process', () => {
    const calls: Array<{ bin: string; argv: string[]; cwd: string }> = []
    const fakeFactory = (bin: string): StreamRunner => ({
      run(argv, opts) {
        calls.push({ bin, argv: [...argv], cwd: opts.cwd })
        return { exitCode: 0 }
      },
    })
    // `onPath('sh')` still runs for real (a tiny `command -v` probe through
    // the CAPTURE door, `contract.ts`'s own seam-routed helper — not the
    // thing under test here) — `sh` is always on PATH, so this needs no
    // throwaway-binary fixture the way the real-default tests above do.
    const host = makeTerminalHost({ streamRunner: fakeFactory })
    const req: CommandRequest = { cwd: '/w', argv: ['sh', '-c', 'echo hi'], title: 'x' }
    expect(host.terminal!(req)).toBe(0)
    expect(calls).toEqual([{ bin: 'sh', argv: ['-c', 'echo hi'], cwd: '/w' }])
  })

  test('a non-zero exit from the fake surfaces unchanged', () => {
    const host = makeTerminalHost({ streamRunner: () => ({ run: () => ({ exitCode: 9 }) }) })
    const req: CommandRequest = { cwd: '/w', argv: ['sh', '-c', 'exit 9'], title: 'x' }
    expect(host.terminal!(req)).toBe(9)
  })
})

describe('codex session-id discovery (harness.ts)', () => {
  describe('codexSessionsDir', () => {
    test('defaults under ~/.codex/sessions', () => {
      expect(codexSessionsDir()).toMatch(/\.codex\/sessions$/)
    })
    test('honors an injected codexHome', () => {
      expect(codexSessionsDir('/fake-home/.codex')).toBe('/fake-home/.codex/sessions')
    })
  })

  describe('parseRolloutMeta (shape confirmed against a real rollout file)', () => {
    test('extracts cwd + session_id from a session_meta first line', () => {
      const line = JSON.stringify({
        type: 'session_meta',
        payload: { session_id: '019f34d7-4649-7882-a168-22a340f1f0c7', cwd: '/work/repo' },
      })
      expect(parseRolloutMeta(line)).toEqual({
        cwd: '/work/repo',
        sessionId: '019f34d7-4649-7882-a168-22a340f1f0c7',
      })
    })
    test('falls back to payload.id when session_id is absent', () => {
      const line = JSON.stringify({ type: 'session_meta', payload: { id: 'legacy-id', cwd: '/w' } })
      expect(parseRolloutMeta(line)).toEqual({ cwd: '/w', sessionId: 'legacy-id' })
    })
    test('not-JSON, no payload, no cwd, or no id all yield null', () => {
      expect(parseRolloutMeta('not json')).toBeNull()
      expect(parseRolloutMeta('')).toBeNull()
      expect(parseRolloutMeta(JSON.stringify({ type: 'session_meta' }))).toBeNull()
      expect(parseRolloutMeta(JSON.stringify({ payload: { cwd: '/w' } }))).toBeNull()
      expect(parseRolloutMeta(JSON.stringify({ payload: { session_id: 'a' } }))).toBeNull()
    })
  })

  describe('newestRolloutSessionIdSince', () => {
    const sinceMs = Date.parse('2026-01-01T00:00:00Z')
    const cwd = '/work/repo'
    function metaLine(sessionId: string, lineCwd = cwd): string {
      return JSON.stringify({ payload: { session_id: sessionId, cwd: lineCwd } })
    }

    test('picks the newest (by creation) candidate created within the margin of sinceMs whose cwd matches', () => {
      const candidates = [
        { firstLine: metaLine('too-old'), createdMs: sinceMs - ROLLOUT_CREATED_MARGIN_MS - 1 },
        { firstLine: metaLine('older-match'), createdMs: sinceMs - ROLLOUT_CREATED_MARGIN_MS },
        { firstLine: metaLine('newest-match'), createdMs: sinceMs + 20 },
        { firstLine: metaLine('wrong-cwd', '/other/repo'), createdMs: sinceMs + 30 },
      ]
      expect(newestRolloutSessionIdSince(candidates, { sinceMs, cwd })).toBe('newest-match')
    })
    test('a file created just before sinceMs (coarse file clock) still counts', () => {
      const candidates = [{ firstLine: metaLine('ours'), createdMs: sinceMs - 5 }]
      expect(newestRolloutSessionIdSince(candidates, { sinceMs, cwd })).toBe('ours')
    })
    test('an unparsable candidate is skipped, not fatal', () => {
      const candidates = [
        { firstLine: 'not json', createdMs: sinceMs + 1 },
        { firstLine: metaLine('ok'), createdMs: sinceMs + 2 },
      ]
      expect(newestRolloutSessionIdSince(candidates, { sinceMs, cwd })).toBe('ok')
    })
    test('no qualifying candidate yields null', () => {
      expect(newestRolloutSessionIdSince([], { sinceMs, cwd })).toBeNull()
    })
  })

  describe('findCodexSessionId (real temp-dir fixture standing in for ~/.codex/)', () => {
    test('finds the newest rollout created since the launch whose cwd matches, under a nested yyyy/mm/dd tree', () => {
      const codexHome = mkdtempSync(join(tmpdir(), 'codex-host-test-'))
      try {
        const sinceMs = Date.now()
        const dayDir = join(codexHome, 'sessions', '2026', '01', '01')
        mkdirSync(dayDir, { recursive: true })
        const cwd = '/work/target-repo'

        // Created before the launch — ignored even though its cwd matches.
        const stalePath = join(dayDir, rolloutFileName(sinceMs - 60_000, 'stale'))
        writeFileSync(stalePath, `${JSON.stringify({ payload: { session_id: 'stale', cwd } })}\n`)

        // Created after the launch, matching cwd — the one that should be found.
        const matchPath = join(dayDir, rolloutFileName(sinceMs + 1_000, 'match'))
        writeFileSync(
          matchPath,
          `${JSON.stringify({ payload: { session_id: 'match-id', cwd } })}\n`,
        )
        // The name is in the future; its mtime must not be before it, or the name is distrusted.
        utimesSync(matchPath, new Date(sinceMs + 5_000), new Date(sinceMs + 5_000))

        // Created after the launch, but a DIFFERENT cwd (some unrelated concurrent session) — ignored.
        const otherCwdPath = join(dayDir, rolloutFileName(sinceMs + 2_000, 'other'))
        writeFileSync(
          otherCwdPath,
          `${JSON.stringify({ payload: { session_id: 'other-id', cwd: '/unrelated/repo' } })}\n`,
        )
        utimesSync(otherCwdPath, new Date(sinceMs + 5_000), new Date(sinceMs + 5_000))

        expect(findCodexSessionId(sinceMs, cwd, { codexHome })).toBe('match-id')
      } finally {
        rmSync(codexHome, { recursive: true, force: true })
      }
    })

    test('a missing sessions directory yields null rather than throwing', () => {
      expect(
        findCodexSessionId(Date.now(), '/whatever', { codexHome: '/no-such-codex-home-xyz' }),
      ).toBeNull()
    })
  })
})

describe('the contract', () => {
  test('requirePart hands back a bound part or names the missing one', () => {
    const sessionOnly: Host = {
      name: 'cmux',
      platforms: 'all',
      available: () => true,
      session: () => ({ exitCode: 4, harnessSessionId: null }),
    }
    expect(requirePart(sessionOnly, 'session')(session)).toEqual({
      exitCode: 4,
      harnessSessionId: null,
    })
    expect(() => requirePart(sessionOnly, 'terminal')).toThrow(HostPartMissing)
    expect(() => requirePart(sessionOnly, 'terminal')).toThrow(/cannot run a command/)
  })
})

describe('orca addressing by session id', () => {
  const created = (handle: string) =>
    JSON.stringify({ ok: true, result: { terminal: { handle, title: 'T' } } })
  const agent = (handle: string) => ({ handle, agentIdentity: 'claude', writable: true })
  const listReply = (terminals: Record<string, unknown>[]): CommandResult => ({
    exitCode: 0,
    stdout: JSON.stringify({ ok: true, result: { terminals } }),
    stderr: '',
  })
  const reg = () => mkdtempSync(join(tmpdir(), 'orca-reg-'))

  /** Launches s-1 and s-2 into terminals term_1 and term_2 of one worktree. */
  function launched(registryDir: string) {
    for (const [id, handle] of [
      ['s-1', 'term_1'],
      ['s-2', 'term_2'],
    ] as const) {
      const { runner } = recorder([{ exitCode: 0, stdout: created(handle), stderr: '' }])
      makeOrcaHost({ binary: 'orca', runner, registryDir }).session!({
        ...session,
        sessionId: id,
      })
    }
  }

  test('create reports its terminal handle as JSON', () => {
    expect(parseOrcaCreatedHandle(created('term_9'))).toBe('term_9')
    expect(parseOrcaCreatedHandle('not json')).toBeNull()
    expect(parseOrcaCreatedHandle('{}')).toBeNull()
    expect(orcaCloseArgv('term_9')).toEqual(['terminal', 'close', '--terminal', 'term_9', '--json'])
  })

  test('two sessions in one worktree: send, focus, find and close reach the handle remembered for the id', () => {
    const registryDir = reg()
    launched(registryDir)
    const both = listReply([agent('term_1'), agent('term_2')])
    const ctx = (replies: CommandResult[]) => {
      const r = recorder(replies)
      return {
        host: makeOrcaHost({ binary: 'orca', runner: r.runner, registryDir }),
        calls: r.calls,
      }
    }
    const send = ctx([
      both,
      { exitCode: 0, stdout: '{"ok":true,"result":{"send":{"accepted":true}}}', stderr: '' },
    ])
    expect(send.host.send!({ ...sendReq, sessionId: 's-2' }).accepted).toBe(true)
    expect(send.calls[1]).toEqual(orcaSendArgv('term_2', sendReq.text))
    const focus = ctx([both, { exitCode: 0, stdout: '{}', stderr: '' }])
    expect(focus.host.focus!({ ...findQuery, sessionId: 's-1' })).toBe(true)
    expect(focus.calls[1]).toEqual(orcaSwitchArgv('term_1'))
    const find = ctx([both])
    expect(find.host.find!({ ...findQuery, sessionId: 's-2' }).map((f) => f.handle)).toEqual([
      'term_2',
    ])
    const close = ctx([both, { exitCode: 0, stdout: '{}', stderr: '' }])
    expect(close.host.close!({ ...findQuery, sessionId: 's-1' })).toBe(true)
    expect(close.calls[1]).toEqual(orcaCloseArgv('term_1'))
    rmSync(registryDir, { recursive: true, force: true })
  })

  test('a session whose terminal is no longer listed reaches nothing, not its neighbour', () => {
    const registryDir = reg()
    launched(registryDir)
    const onlyTwo = listReply([agent('term_2')])
    const host = () =>
      makeOrcaHost({ binary: 'orca', runner: recorder([onlyTwo]).runner, registryDir })
    expect(host().find!({ ...findQuery, sessionId: 's-1' })).toEqual([])
    expect(host().send!({ ...sendReq, sessionId: 's-1' }).accepted).toBe(false)
    expect(host().close!({ ...findQuery, sessionId: 's-1' })).toBe(false)
    rmSync(registryDir, { recursive: true, force: true })
  })

  test('an id with no remembered handle resolves by cwd (an older record); close leaves it open', () => {
    const registryDir = reg()
    const list = listReply([agent('term_a')])
    const send = recorder([
      list,
      { exitCode: 0, stdout: '{"ok":true,"result":{"send":{"accepted":true}}}', stderr: '' },
    ])
    expect(
      makeOrcaHost({ binary: 'orca', runner: send.runner, registryDir }).send!({
        ...sendReq,
        sessionId: 'old',
      }).accepted,
    ).toBe(true)
    const close = recorder([list])
    expect(
      makeOrcaHost({ binary: 'orca', runner: close.runner, registryDir }).close!({
        ...findQuery,
        sessionId: 'old',
      }),
    ).toBe(false)
    expect(close.calls).toEqual([])
    rmSync(registryDir, { recursive: true, force: true })
  })
})
