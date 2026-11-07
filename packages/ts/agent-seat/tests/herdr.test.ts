import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

import type { SendRequest, SessionRequest } from '../src/contract.ts'
import {
  herdrAgentPromptArgv,
  herdrErrorCode,
  herdrPaneReadArgv,
  herdrPaneRunArgv,
  herdrPanesAt,
  herdrPromptReceipt,
  herdrTabFocusArgv,
  herdrPaneCloseArgv,
  herdrWorkspaceCreateArgv,
  herdrWorkspaceFocusArgv,
  makeHerdrHost,
  parseHerdrPanes,
  parseHerdrRootPane,
} from '../src/hosts/herdr.ts'
import { RUNTIME } from './fixtures/runtime.ts'

// Captured from herdr 0.9.3 against a throwaway `--session sdlc-probe` server
// (docs/planning/research/herdr.md); ids and paths kept as observed,
// the pane's scroll block trimmed.
const CWD = '/Users/sksizer/orca/workspaces/dev/sdlc-hostext-herdr'

const WORKSPACE_CREATED = JSON.stringify({
  id: 'cli:workspace:create',
  result: {
    root_pane: {
      agent_status: 'unknown',
      cwd: CWD,
      focused: true,
      foreground_cwd: CWD,
      pane_id: 'w1:p1',
      revision: 0,
      tab_id: 'w1:t1',
      terminal_id: 'term_65d5c11536da01',
      workspace_id: 'w1',
    },
    tab: { label: '1', number: 1, pane_count: 1, tab_id: 'w1:t1', workspace_id: 'w1' },
    type: 'workspace_created',
    workspace: { label: 'probeB', number: 1, workspace_id: 'w1' },
  },
})

const pane = (over: Record<string, unknown>) => ({
  agent_status: 'unknown',
  cwd: CWD,
  focused: true,
  foreground_cwd: CWD,
  pane_id: 'w1:p1',
  revision: 0,
  tab_id: 'w1:t1',
  terminal_id: 'term_65d5c11536da01',
  workspace_id: 'w1',
  ...over,
})
const paneList = (...panes: Record<string, unknown>[]) =>
  JSON.stringify({ id: 'cli:pane:list', result: { panes, type: 'pane_list' } })

const PLAIN_LIST = paneList(pane({}))
const AGENT_LIST = paneList(pane({ agent: 'claude', agent_status: 'idle' }))

const PROMPTED = JSON.stringify({
  id: 'cli:agent:prompt',
  result: {
    agent: { agent: 'claude', agent_status: 'working', name: 'probeclaude', pane_id: 'w1:p1' },
    type: 'agent_prompted',
  },
})
const err = (code: string) =>
  JSON.stringify({ error: { code, message: `${code} (live)` }, id: 'cli:agent:prompt' })
const NOT_RUNNING = JSON.stringify({
  id: 'cli:workspace:create',
  error: {
    code: 'server_not_running',
    message:
      'no herdr server is running at /Users/sksizer/.config/herdr/sessions/sdlc-probe/herdr.sock; run `herdr session attach sdlc-probe` to start or attach it',
  },
})

const ok = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr: string): CommandResult => ({ exitCode: 1, stdout: '', stderr })

function recorder(replies: CommandResult[]): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      return replies.shift() ?? ok()
    },
  }
  return { runner, calls }
}

const sendReq: SendRequest = { cwd: CWD, text: 'feedback: fix it' }
const session: SessionRequest = {
  cwd: CWD,
  harness: 'claude',
  binary: 'claude',
  prompt: 'Review #1',
  title: 'PR #1',
}

describe('herdr host', () => {
  test('argv builders', () => {
    expect(herdrWorkspaceCreateArgv({ cwd: '/w', argv: [], title: 'PR 1' })).toEqual([
      'workspace',
      'create',
      '--cwd',
      '/w',
      '--label',
      'PR 1',
      '--no-focus',
    ])
    expect(herdrPaneRunArgv('w1:p1', ['claude', '--', "it's"])).toEqual([
      'pane',
      'run',
      'w1:p1',
      "claude -- 'it'\\''s'",
    ])
    expect(herdrAgentPromptArgv('w1:p1', '-x hi')).toEqual([
      'agent',
      'prompt',
      'w1:p1',
      '-x hi',
      '--wait',
      '--until',
      'working',
      '--until',
      'blocked',
      '--timeout',
      '30000',
    ])
    expect(herdrWorkspaceFocusArgv('w1')).toEqual(['workspace', 'focus', 'w1'])
    expect(herdrTabFocusArgv('w1:t1')).toEqual(['tab', 'focus', 'w1:t1'])
    expect(herdrPaneReadArgv('w1:p1')).toEqual(['pane', 'read', 'w1:p1', '--lines', '200'])
  })

  test('a named session prefixes every subcommand', () => {
    expect(herdrPaneReadArgv('w1:p1', 'work').slice(0, 3)).toEqual(['--session', 'work', 'pane'])
    expect(herdrAgentPromptArgv('w1:p1', 't', 'work').slice(0, 2)).toEqual(['--session', 'work'])
  })

  test('available(): the injectable override', () => {
    expect(makeHerdrHost({ runtimeDir: RUNTIME, available: () => true }).available()).toBe(true)
    expect(makeHerdrHost({ runtimeDir: RUNTIME, available: () => false }).available()).toBe(false)
  })

  test('parses the live pane list and workspace create fixtures', () => {
    expect(parseHerdrRootPane(WORKSPACE_CREATED)).toBe('w1:p1')
    expect(parseHerdrPanes(AGENT_LIST)).toEqual([
      {
        paneId: 'w1:p1',
        tabId: 'w1:t1',
        workspaceId: 'w1',
        cwd: CWD,
        foregroundCwd: CWD,
        agent: 'claude',
        agentStatus: 'idle',
      },
    ])
    expect(parseHerdrPanes('not json')).toEqual([])
    expect(parseHerdrRootPane('not json')).toBeNull()
  })

  test('herdrPanesAt matches real paths (herdr reports /private/tmp for /tmp) and puts agents first', () => {
    const panes = parseHerdrPanes(
      paneList(
        pane({ pane_id: 'w1:p1' }),
        pane({ pane_id: 'w1:p2', agent: 'codex' }),
        pane({ pane_id: 'w2:p1', cwd: '/elsewhere', foreground_cwd: '/elsewhere' }),
      ),
    )
    expect(herdrPanesAt(panes, CWD).map((p) => p.paneId)).toEqual(['w1:p2', 'w1:p1'])
    const priv = parseHerdrPanes(
      paneList(pane({ cwd: '/private/tmp', foreground_cwd: '/private/tmp' })),
    )
    // On macOS `/tmp` is a symlink to `/private/tmp`; elsewhere the two paths differ.
    expect(herdrPanesAt(priv, '/tmp')).toHaveLength(process.platform === 'darwin' ? 1 : 0)
  })

  test('herdrErrorCode reads stderr or stdout', () => {
    expect(herdrErrorCode({ stdout: '', stderr: NOT_RUNNING })).toBe('server_not_running')
    expect(herdrErrorCode({ stdout: err('agent_blocked'), stderr: '' })).toBe('agent_blocked')
    expect(herdrErrorCode({ stdout: '', stderr: 'boom' })).toBeNull()
  })

  test('session: workspace create then pane run with the quoted harness argv', () => {
    const { runner, calls } = recorder([ok(WORKSPACE_CREATED), ok()])
    expect(makeHerdrHost({ runtimeDir: RUNTIME, runner }).session!(session)).toEqual({
      exitCode: 0,
      harnessSessionId: null,
    })
    expect(calls[0]).toEqual([
      'workspace',
      'create',
      '--cwd',
      CWD,
      '--label',
      'PR #1',
      '--no-focus',
    ])
    expect(calls[1]![0]).toBe('pane')
    expect(calls[1]!.slice(1, 3)).toEqual(['run', 'w1:p1'])
    expect(calls[1]![3]).toContain("claude -- 'Review #1'")
  })

  test('terminal: no server throws the clear error; other failures surface stderr', () => {
    const down = recorder([fail(NOT_RUNNING)]).runner
    expect(() =>
      makeHerdrHost({ runtimeDir: RUNTIME, runner: down }).terminal!({
        cwd: CWD,
        argv: ['x'],
        title: 't',
      }),
    ).toThrow('herdr server is not running — start herdr first')
    const bad = recorder([fail('{"error":{"code":"internal","message":"nope"}}')]).runner
    expect(() =>
      makeHerdrHost({ runtimeDir: RUNTIME, runner: bad }).terminal!({
        cwd: CWD,
        argv: ['x'],
        title: 't',
      }),
    ).toThrow(/workspace create failed/)
    const runFail = recorder([
      ok(WORKSPACE_CREATED),
      fail('{"error":{"code":"pane_not_found"}}'),
    ]).runner
    expect(() =>
      makeHerdrHost({ runtimeDir: RUNTIME, runner: runFail }).terminal!({
        cwd: CWD,
        argv: ['x'],
        title: 't',
      }),
    ).toThrow(/pane run failed/)
  })

  test('send to a recognised agent: agent prompt, exit 0 is an ack', () => {
    const { runner, calls } = recorder([ok(AGENT_LIST), ok(PROMPTED)])
    expect(makeHerdrHost({ runtimeDir: RUNTIME, runner }).send!(sendReq)).toEqual({
      accepted: true,
      ack: true,
    })
    expect(calls).toEqual([['pane', 'list'], herdrAgentPromptArgv('w1:p1', sendReq.text)])
  })

  test('send to an agent: blocked is rejected, timeout and stall are accepted without ack', () => {
    const prompt = (res: CommandResult) =>
      makeHerdrHost({ runtimeDir: RUNTIME, runner: recorder([ok(AGENT_LIST), res]).runner }).send!(
        sendReq,
      )
    expect(prompt(fail(err('agent_blocked')))).toEqual({ accepted: false, ack: false })
    expect(prompt(fail(err('agent_not_found')))).toEqual({ accepted: false, ack: false })
    expect(prompt(fail(err('timeout')))).toEqual({
      accepted: true,
      ack: false,
      uncertain: true,
    })
    expect(prompt(fail(err('agent_prompt_stalled')))).toEqual({
      accepted: true,
      ack: false,
      uncertain: true,
    })
    expect(herdrPromptReceipt(fail('garbage'))).toEqual({ accepted: false, ack: false })
  })

  test('send to a plain pane is refused: a shell would run the text as a command', () => {
    const { runner, calls } = recorder([ok(PLAIN_LIST)])
    expect(makeHerdrHost({ runtimeDir: RUNTIME, runner }).send!(sendReq)).toEqual({
      accepted: false,
      ack: false,
    })
    expect(calls).toHaveLength(1)
  })

  test('no server or no pane at cwd: send, find, focus, capture report nothing', () => {
    const down = () =>
      recorder([fail(NOT_RUNNING), fail(NOT_RUNNING), fail(NOT_RUNNING), fail(NOT_RUNNING)])
    const host = makeHerdrHost({ runtimeDir: RUNTIME, runner: down().runner })
    expect(host.send!(sendReq)).toEqual({ accepted: false, ack: false })
    expect(host.find!({ cwd: CWD })).toEqual([])
    expect(host.focus!({ cwd: CWD })).toBe(false)
    expect(host.capture!({ cwd: CWD })).toBeNull()
    const other = makeHerdrHost({ runtimeDir: RUNTIME, runner: recorder([ok(AGENT_LIST)]).runner })
    expect(other.find!({ cwd: '/nowhere' })).toEqual([])
  })

  test('find: harness from the agent kind, handle is the pane id, no output time', () => {
    const host = makeHerdrHost({ runtimeDir: RUNTIME, runner: recorder([ok(AGENT_LIST)]).runner })
    expect(host.find!({ cwd: CWD })).toEqual([
      { cwd: CWD, harness: 'claude', alive: true, lastOutputAt: null, handle: 'w1:p1' },
    ])
    const plain = makeHerdrHost({ runtimeDir: RUNTIME, runner: recorder([ok(PLAIN_LIST)]).runner })
    expect(plain.find!({ cwd: CWD })).toEqual([
      { cwd: CWD, harness: null, alive: false, lastOutputAt: null, handle: 'w1:p1' },
    ])
    const unknown = makeHerdrHost({
      runtimeDir: RUNTIME,
      runner: recorder([ok(paneList(pane({ agent: 'amp' })))]).runner,
    })
    expect(unknown.find!({ cwd: CWD })[0]).toMatchObject({ harness: null, alive: true })
  })

  test('focus: workspace focus then tab focus; either failing is false', () => {
    const { runner, calls } = recorder([ok(AGENT_LIST), ok(), ok()])
    expect(makeHerdrHost({ runtimeDir: RUNTIME, runner }).focus!({ cwd: CWD })).toBe(true)
    expect(calls.slice(1)).toEqual([herdrWorkspaceFocusArgv('w1'), herdrTabFocusArgv('w1:t1')])
    const wsFails = recorder([ok(AGENT_LIST), fail('workspace_not_found')])
    expect(
      makeHerdrHost({ runtimeDir: RUNTIME, runner: wsFails.runner }).focus!({ cwd: CWD }),
    ).toBe(false)
    expect(wsFails.calls).toHaveLength(2)
    expect(
      makeHerdrHost({
        runtimeDir: RUNTIME,
        runner: recorder([ok(AGENT_LIST), ok(), fail('x')]).runner,
      }).focus!({
        cwd: CWD,
      }),
    ).toBe(false)
  })

  test('capture: pane read output, null on failure', () => {
    const text = 'sksizer@host wsA % echo hello-probe\nhello-probe\n'
    const { runner, calls } = recorder([ok(PLAIN_LIST), ok(text)])
    expect(makeHerdrHost({ runtimeDir: RUNTIME, runner }).capture!({ cwd: CWD })).toBe(text)
    expect(calls[1]).toEqual(herdrPaneReadArgv('w1:p1'))
    const bad = recorder([ok(PLAIN_LIST), fail('pane_not_found')]).runner
    expect(makeHerdrHost({ runtimeDir: RUNTIME, runner: bad }).capture!({ cwd: CWD })).toBeNull()
  })

  test('close without a session id closes the one agent pane at the cwd, never a plain shell', () => {
    const shell = pane({})
    const agent = (id: string) =>
      pane({ pane_id: `${id}:p1`, tab_id: `${id}:t1`, workspace_id: id, agent: 'claude' })
    const close = (list: string) => {
      const { runner, calls } = recorder([ok(list), ok()])
      return { closed: makeHerdrHost({ runtimeDir: RUNTIME, runner }).close!({ cwd: CWD }), calls }
    }
    // The shell is listed first; the agent beside it is the one closed.
    const one = close(paneList(shell, agent('w2')))
    expect(one.closed).toBe(true)
    expect(one.calls[1]).toEqual(herdrPaneCloseArgv('w2:p1'))
    // Only a plain shell at the cwd: nothing is closed.
    const none = close(PLAIN_LIST)
    expect(none.closed).toBe(false)
    expect(none.calls).toHaveLength(1)
    // Two agents: either pick could close another session's pane.
    const two = close(paneList(shell, agent('w2'), agent('w3')))
    expect(two.closed).toBe(false)
    expect(two.calls).toHaveLength(1)
  })

  test('a runner that throws never escapes send, find, focus or capture', () => {
    const runner: CommandRunner = {
      run() {
        throw new Error('spawn failed')
      },
    }
    const host = makeHerdrHost({ runtimeDir: RUNTIME, runner })
    expect(host.send!(sendReq)).toEqual({ accepted: false, ack: false })
    expect(host.find!({ cwd: CWD })).toEqual([])
    expect(host.focus!({ cwd: CWD })).toBe(false)
    expect(host.capture!({ cwd: CWD })).toBeNull()
  })
})

describe('herdr addressing by session id', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'herdr-reg-'))
  const two = paneList(
    pane({ pane_id: 'w1:p1', workspace_id: 'w1', tab_id: 'w1:t1', agent: 'claude' }),
    pane({ pane_id: 'w2:p1', workspace_id: 'w2', tab_id: 'w2:t1', agent: 'claude' }),
  )
  const created = (workspace: string) =>
    JSON.stringify({
      result: {
        root_pane: {
          pane_id: `${workspace}:p1`,
          tab_id: `${workspace}:t1`,
          workspace_id: workspace,
        },
      },
    })

  /** Launches s-1 into w1 and s-2 into w2, both at CWD. */
  function launched() {
    const registryDir = dir()
    for (const [id, ws] of [
      ['s-1', 'w1'],
      ['s-2', 'w2'],
    ] as const) {
      makeHerdrHost({ runner: recorder([ok(created(ws)), ok()]).runner, registryDir }).session!({
        ...session,
        sessionId: id,
      })
    }
    return registryDir
  }

  test('two sessions in one cwd: send, focus, capture and close reach the pane remembered for the id', () => {
    const registryDir = launched()
    const host = (replies: CommandResult[]) => {
      const r = recorder(replies)
      return { host: makeHerdrHost({ runner: r.runner, registryDir }), calls: r.calls }
    }
    const send = host([ok(two), ok(PROMPTED)])
    expect(send.host.send!({ ...sendReq, sessionId: 's-2' }).accepted).toBe(true)
    expect(send.calls[1]![2]).toBe('w2:p1')
    const focus = host([ok(two), ok(), ok()])
    expect(focus.host.focus!({ cwd: CWD, sessionId: 's-2' })).toBe(true)
    expect(focus.calls.slice(1)).toEqual([
      herdrWorkspaceFocusArgv('w2'),
      herdrTabFocusArgv('w2:t1'),
    ])
    const cap = host([ok(two), ok('screen')])
    expect(cap.host.capture!({ cwd: CWD, sessionId: 's-1' })).toBe('screen')
    expect(cap.calls[1]).toEqual(herdrPaneReadArgv('w1:p1'))
    const close = host([ok(two), ok()])
    expect(close.host.close!({ cwd: CWD, sessionId: 's-1' })).toBe(true)
    expect(close.calls[1]).toEqual(herdrPaneCloseArgv('w1:p1'))
    expect(herdrPaneCloseArgv('w1:p1', 'named')).toEqual([
      '--session',
      'named',
      'pane',
      'close',
      'w1:p1',
    ])
    rmSync(registryDir, { recursive: true, force: true })
  })

  test("a session whose pane is gone finds nothing rather than another session's pane", () => {
    const registryDir = launched()
    const onlyW2 = paneList(pane({ pane_id: 'w2:p1', workspace_id: 'w2', agent: 'claude' }))
    const host = () => makeHerdrHost({ runner: recorder([ok(onlyW2)]).runner, registryDir })
    expect(host().find!({ cwd: CWD, sessionId: 's-1' })).toEqual([])
    expect(host().close!({ cwd: CWD, sessionId: 's-1' })).toBe(false)
    rmSync(registryDir, { recursive: true, force: true })
  })

  test('close refuses a remembered pane id that herdr now lists at another cwd (a reissued id)', () => {
    const registryDir = launched()
    const reissued = paneList(
      pane({ pane_id: 'w1:p1', cwd: '/people/shell', foreground_cwd: '/people/shell' }),
    )
    const c = recorder([ok(reissued), ok()])
    const host = makeHerdrHost({ runner: c.runner, registryDir })
    expect(host.close!({ cwd: CWD, sessionId: 's-1' })).toBe(false)
    expect(c.calls.some((a) => a.includes('close'))).toBe(false)
    rmSync(registryDir, { recursive: true, force: true })
  })

  test('send and find ignore a remembered pane id that herdr now lists at another cwd (a reissued id)', () => {
    const registryDir = launched()
    const reissued = paneList(
      pane({ pane_id: 'w1:p1', cwd: '/usr', foreground_cwd: '/usr', agent: 'claude' }),
    )
    const s = recorder([ok(reissued), ok(PROMPTED)])
    expect(
      makeHerdrHost({ runner: s.runner, registryDir }).send!({ ...sendReq, sessionId: 's-1' }),
    ).toEqual({ accepted: false, ack: false })
    expect(s.calls.some((a) => a.includes('prompt'))).toBe(false)
    const f = recorder([ok(reissued)])
    expect(
      makeHerdrHost({ runner: f.runner, registryDir }).find!({ cwd: CWD, sessionId: 's-1' }),
    ).toEqual([])
    rmSync(registryDir, { recursive: true, force: true })
  })

  test('send to a bound pane skips the harness check, even for an agent name that is no builtin harness', () => {
    const registryDir = launched()
    const odd = paneList(pane({ pane_id: 'w1:p1', agent: 'some-new-agent' }))
    const s = recorder([ok(odd), ok(PROMPTED)])
    expect(
      makeHerdrHost({ runner: s.runner, registryDir }).send!({
        ...sendReq,
        sessionId: 's-1',
        harness: 'claude',
      }),
    ).toEqual({ accepted: true, ack: true })
    expect(s.calls[1]).toEqual(herdrAgentPromptArgv('w1:p1', sendReq.text))
    rmSync(registryDir, { recursive: true, force: true })
  })

  test('send by cwd narrows to the requested harness and refuses unless exactly one pane matches', () => {
    const mixed = paneList(
      pane({ pane_id: 'w1:p1', agent: 'claude' }),
      pane({ pane_id: 'w2:p1', workspace_id: 'w2', agent: 'codex' }),
    )
    const registryDir = dir()
    const toCodex = recorder([ok(mixed), ok(PROMPTED)])
    expect(
      makeHerdrHost({ runner: toCodex.runner, registryDir }).send!({
        ...sendReq,
        harness: 'codex',
      }),
    ).toEqual({ accepted: true, ack: true })
    expect(toCodex.calls[1]).toEqual(herdrAgentPromptArgv('w2:p1', sendReq.text))
    const twoClaude = recorder([ok(two), ok(PROMPTED)])
    expect(
      makeHerdrHost({ runner: twoClaude.runner, registryDir }).send!({
        ...sendReq,
        harness: 'claude',
      }),
    ).toEqual({ accepted: false, ack: false })
    expect(twoClaude.calls).toHaveLength(1)
    rmSync(registryDir, { recursive: true, force: true })
  })

  test('an id with no remembered pane resolves by cwd, but close refuses it', () => {
    const registryDir = dir()
    const r = recorder([ok(two)])
    expect(
      makeHerdrHost({ runner: r.runner, registryDir }).find!({ cwd: CWD, sessionId: 'old' }),
    ).toHaveLength(2)
    const c = recorder([ok(two), ok()])
    expect(
      makeHerdrHost({ runner: c.runner, registryDir }).close!({ cwd: CWD, sessionId: 'old' }),
    ).toBe(false)
    expect(c.calls).toEqual([])
    rmSync(registryDir, { recursive: true, force: true })
  })
})
