/**
 * One short example per stable export that the README and guide examples do not already use.
 * Fake command runners stand in for every app CLI, so nothing here starts an app.
 */
import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandResult, CommandRunner, StreamRunner } from '@osdlc/command-seam'
import { describe, expect, test } from 'vitest'

import {
  CLAUDE_HOOK_EVENTS,
  ClaudeSessionFlagsSchema,
  HarnessSchema,
  HostNameSchema,
  ORCA_BUNDLED_CLI,
  claudeHookSettings,
  claudeResumeArgv,
  claudeSessionArgv,
  codexSessionsDir,
  ensureWorkspace,
  findCodexSessionId,
  hasInteractiveArgv,
  harnessArgv,
  harnessAvailable,
  harnessNativeSend,
  harnessOrNull,
  hostRegistry,
  hostRegistryDir,
  makeCmuxHost,
  makeHerdrHost,
  makeOrcaHost,
  makeOttyHost,
  makeTerminalHost,
  makeWeztermHost,
  onPath,
  parseRolloutMeta,
  requirePart,
  terminalHost,
  walkRolloutFiles,
  withEnv,
  wrapperSession,
  type ClaudeLaunchFlags,
  type ClaudeSessionFlags,
  type CommandRequest,
  type FindQuery,
  type FoundSession,
  type Harness,
  type Host,
  type HostName,
  type HostPart,
  type HostParts,
  type HostRegistryOptions,
  type HostStateOptions,
  type NativeSendResult,
  type OpenedWorkspace,
  type OpenWorkspaceQuery,
  type SendReceipt,
  type SendRequest,
  type SessionRequest,
  type WaitRequest,
} from '@osdlc/agent-seat'

const tempDir = (prefix: string) => mkdtempSync(join(tmpdir(), `agent-seat-${prefix}-`))
const ok = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const failed = (stderr = 'boom'): CommandResult => ({ exitCode: 1, stdout: '', stderr })

/** A runner that records every argv and answers from `reply` (default: success, no output). */
function recorder(reply: (argv: string[]) => CommandResult = () => ok()) {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run: (argv) => {
      calls.push(argv)
      return reply(argv)
    },
  }
  return { runner, calls }
}

describe('contract', () => {
  test('HostNameSchema validates a host name from config', () => {
    const name: HostName = HostNameSchema.parse('wezterm')
    expect(name).toBe('wezterm')
    expect(HostNameSchema.safeParse('emacs').success).toBe(false)
  })

  test('onPath says whether a binary is on PATH', () => {
    expect(onPath('node')).toBe(true)
    expect(onPath('no-such-binary-for-agent-seat')).toBe(false)
  })

  test('the request and result types a host part takes and returns', () => {
    const wait: WaitRequest = { runId: 'nightly', timeoutMs: 60_000 }
    const session: SessionRequest = {
      cwd: '/work/repo',
      harness: 'claude',
      binary: 'claude',
      prompt: 'Fix the build.',
      title: 'fix build',
      sessionId: 'fix-build',
      wait,
    }
    const command: CommandRequest = { cwd: '/work/repo', argv: ['npm', 'test'], title: 'tests' }
    const query: FindQuery = { cwd: session.cwd, sessionId: session.sessionId }
    const send: SendRequest = { ...query, text: 'Try again.', harness: 'claude' }
    const receipt: SendReceipt = { accepted: true, ack: false, uncertain: true }
    const found: FoundSession = {
      cwd: query.cwd,
      harness: null,
      alive: true,
      lastOutputAt: null,
      handle: 'pane-1',
    }
    expect([command.argv[0], send.text, receipt.uncertain, found.handle]).toEqual([
      'npm',
      'Try again.',
      true,
      'pane-1',
    ])
  })

  test('a HostPart names the part requirePart returns, typed as HostParts[part]', () => {
    const host: Host = {
      name: 'tmux',
      platforms: 'all',
      available: () => true,
      focus: () => true,
    }
    const part: HostPart = 'focus'
    const focus: HostParts['focus'] = requirePart(host, part)
    expect(focus({ cwd: '/work/repo' })).toBe(true)
  })

  test('ensureWorkspace opens a workspace only when enabled and the host can', () => {
    const asked: OpenWorkspaceQuery[] = []
    const host: Host = {
      name: 'vscode',
      platforms: 'all',
      available: () => true,
      openWorkspace(query): OpenedWorkspace {
        asked.push(query)
        query.notice?.(`opening ${query.cwd}...`)
        return { root: '/work', opened: true }
      },
    }
    const notices: string[] = []
    ensureWorkspace(host, '/work/repo', false, (line) => notices.push(line))
    expect(asked).toEqual([])
    ensureWorkspace(host, '/work/repo', true, (line) => notices.push(line))
    expect(asked.map((q) => q.cwd)).toEqual(['/work/repo'])
    expect(notices).toEqual(['opening /work/repo...'])
    // A host without the part is left alone.
    const bare: Host = { name: 'tmux', platforms: 'all', available: () => true }
    expect(() => ensureWorkspace(bare, '/w', true, () => {})).not.toThrow()
  })
})

describe('registry and state', () => {
  test('hostRegistry puts stateful hosts under <runtimeDir>/hosts/<name>', () => {
    const runtimeDir = tempDir('registry')
    const opts: HostRegistryOptions = { runtimeDir, repoRoot: '/work/repo' }
    const hosts = hostRegistry(opts)
    expect(Object.keys(hosts).sort()).toEqual(
      [
        'cmux',
        'herdr',
        'jetbrains',
        'orca',
        'otty',
        'terminal',
        'tmux',
        'vscode',
        'wezterm',
      ].sort(),
    )
    expect(hostRegistryDir(runtimeDir, 'herdr')).toBe(join(runtimeDir, 'hosts', 'herdr'))
  })

  test('HostStateOptions: give a runtimeDir, or a registryDir that is used as is', () => {
    const runtimeDir = tempDir('state')
    const registryDir = join(runtimeDir, 'panes')
    const byRuntime: HostStateOptions = { runtimeDir }
    const byRegistry: HostStateOptions = { registryDir }
    expect(makeHerdrHost(byRuntime).name).toBe('herdr')

    // The pane a launch opened is remembered in registryDir, so a later find by session id
    // reaches that pane even though the cwd matches several.
    const { runner } = recorder((argv) => {
      if (argv.includes('create')) return ok('{"result":{"root_pane":{"pane_id":"p1"}}}')
      if (argv.includes('list'))
        return ok(
          JSON.stringify({
            result: {
              panes: [
                {
                  pane_id: 'p1',
                  tab_id: 't1',
                  workspace_id: 'w1',
                  cwd: '/work/repo',
                  agent: 'claude',
                },
                {
                  pane_id: 'p2',
                  tab_id: 't2',
                  workspace_id: 'w2',
                  cwd: '/work/repo',
                  agent: 'codex',
                },
              ],
            },
          }),
        )
      return ok()
    })
    const herdr = makeHerdrHost({ ...byRegistry, runner, available: () => true })
    requirePart(
      herdr,
      'terminal',
    )({
      cwd: '/work/repo',
      argv: ['claude'],
      title: 'review',
      sessionId: 'review-1',
    })
    expect(readdirSync(registryDir).length).toBeGreaterThan(0)
    const found = requirePart(herdr, 'find')({ cwd: '/work/repo', sessionId: 'review-1' })
    expect(found.map((s) => s.handle)).toEqual(['p1'])
  })
})

describe('terminal host', () => {
  test('makeTerminalHost runs the command here through a stream runner and returns its exit code', () => {
    const runs: { binary: string; argv: string[]; cwd: string | undefined }[] = []
    const streamRunner = (binary: string): StreamRunner => ({
      run: (argv, opts) => {
        runs.push({ binary, argv, cwd: opts.cwd })
        return { exitCode: 3 }
      },
    })
    const host = makeTerminalHost({ streamRunner })
    expect(host.available()).toBe(true)
    // `node` is on PATH wherever these tests run; the fake runner never starts it.
    const code = requirePart(
      host,
      'terminal',
    )({ cwd: '/work/repo', argv: ['node', '-v'], title: 't' })
    expect(code).toBe(3)
    expect(runs).toEqual([{ binary: 'node', argv: ['-v'], cwd: '/work/repo' }])
    expect(() => requirePart(host, 'terminal')({ cwd: '/w', argv: [], title: 't' })).toThrow(
      'empty argv',
    )
  })

  test("a session in the terminal host runs in the caller's terminal and returns its exit code", () => {
    const runs: string[][] = []
    const host = makeTerminalHost({
      streamRunner: (binary) => ({
        run: (argv) => {
          runs.push([binary, ...argv])
          return { exitCode: 0 }
        },
      }),
    })
    const result = requirePart(
      host,
      'session',
    )({
      cwd: '/work/repo',
      harness: 'pi',
      binary: 'node',
      prompt: 'hello',
      title: 't',
    })
    expect(result.exitCode).toBe(0)
    expect(result.harnessSessionId).toBeNull()
    expect(runs).toEqual([['node', '--', 'hello']])
  })

  test('terminalHost is the production instance, available everywhere', () => {
    expect(terminalHost.name).toBe('terminal')
    expect(terminalHost.platforms).toBe('all')
    expect(terminalHost.available()).toBe(true)
  })
})

describe('cmux host', () => {
  test('a workspace is created without taking focus, and found again by cwd', () => {
    const { runner, calls } = recorder((argv) =>
      argv[0] === 'sessions'
        ? ok(
            JSON.stringify({
              sessions: [
                { agent: 'claude', cwd: '/work/repo', workspace_id: 'w1', surface_id: 's1' },
              ],
            }),
          )
        : ok(),
    )
    const cmux = makeCmuxHost({ runner, available: () => true })
    expect(cmux.available()).toBe(true)
    expect(
      requirePart(cmux, 'terminal')({ cwd: '/work/repo', argv: ['claude'], title: 'review' }),
    ).toBe(0)
    expect(calls[0]).toEqual([
      'workspace',
      'create',
      '--name',
      'review',
      '--cwd',
      '/work/repo',
      '--command',
      'claude',
      '--focus',
      'false',
    ])
    const [found] = requirePart(cmux, 'find')({ cwd: '/work/repo' })
    expect(found).toMatchObject({ harness: 'claude', alive: true, handle: 'w1/s1' })
  })

  test('send refuses text cmux would type as a key press', () => {
    const cmux = makeCmuxHost({ runner: recorder().runner })
    const receipt = requirePart(cmux, 'send')({ cwd: '/work/repo', text: 'line one\nline two' })
    expect(receipt).toEqual({ accepted: false, ack: false })
  })
})

describe('herdr host', () => {
  test('a launch creates a workspace, then runs the command in its root pane', () => {
    const { runner, calls } = recorder((argv) =>
      argv.includes('create') ? ok('{"result":{"root_pane":{"pane_id":"p1"}}}') : ok(),
    )
    const herdr = makeHerdrHost({
      runtimeDir: tempDir('herdr'),
      runner,
      session: 'work',
      available: () => true,
    })
    expect(herdr.acksSend).toBe(true)
    requirePart(herdr, 'terminal')({ cwd: '/work/repo', argv: ['claude', 'hi'], title: 'review' })
    expect(calls.map((c) => c.slice(0, 4))).toEqual([
      ['--session', 'work', 'workspace', 'create'],
      ['--session', 'work', 'pane', 'run'],
    ])
  })

  test("a failed launch throws with herdr's own error", () => {
    const herdr = makeHerdrHost({
      runtimeDir: tempDir('herdr'),
      runner: recorder(() => ({ ...failed(), stderr: '{"error":{"code":"server_not_running"}}' }))
        .runner,
    })
    expect(() =>
      requirePart(herdr, 'terminal')({ cwd: '/w', argv: ['claude'], title: 't' }),
    ).toThrow('herdr server is not running')
  })
})

describe('orca host', () => {
  test('ORCA_BUNDLED_CLI is where the app keeps its CLI, used when orca is not on PATH', () => {
    expect(ORCA_BUNDLED_CLI).toBe('/Applications/Orca.app/Contents/Resources/bin/orca')
  })

  test('an explicit binary opens a terminal and remembers it for the session id', () => {
    const { runner, calls } = recorder((argv) =>
      argv[1] === 'create'
        ? ok('{"result":{"terminal":{"handle":"term_1"}}}')
        : argv[1] === 'list'
          ? ok(
              JSON.stringify({
                result: {
                  terminals: [{ handle: 'term_1', agentIdentity: 'claude', writable: true }],
                },
              }),
            )
          : ok(),
    )
    const orca = makeOrcaHost({
      runtimeDir: tempDir('orca'),
      binary: '/opt/orca/bin/orca',
      runner,
    })
    expect(orca.available()).toBe(true)
    requirePart(
      orca,
      'terminal',
    )({
      cwd: '/work/repo',
      argv: ['claude'],
      title: 'review',
      sessionId: 'review-1',
    })
    expect(calls[0]!.slice(0, 4)).toEqual(['terminal', 'create', '--worktree', 'path:/work/repo'])
    const [found] = requirePart(orca, 'find')({ cwd: '/work/repo', sessionId: 'review-1' })
    expect(found).toMatchObject({ handle: 'term_1', harness: 'claude', alive: true })
  })

  test('binary: null means Orca is not installed', () => {
    const orca = makeOrcaHost({ runtimeDir: tempDir('orca'), binary: null })
    expect(orca.available()).toBe(false)
    expect(requirePart(orca, 'send')({ cwd: '/w', text: 'hi' })).toEqual({
      accepted: false,
      ack: false,
    })
  })
})

describe('otty host', () => {
  test('a tab is tagged in its title so a later find recognises it', () => {
    const { runner, calls } = recorder((argv) =>
      argv[1] === 'list'
        ? ok(JSON.stringify([{ id: 'pane-7', title: 'review [sd-i-review-1-d7071d09]' }]))
        : ok(),
    )
    const otty = makeOttyHost({ runner, available: () => true })
    expect(otty.available()).toBe(true)
    requirePart(
      otty,
      'terminal',
    )({
      cwd: '/work/repo',
      argv: ['claude'],
      title: 'review',
      sessionId: 'review-1',
    })
    expect(calls[0]!.slice(0, 2)).toEqual(['tab', 'new'])
    expect(calls[0]!.join(' ')).toMatch(/--title review \[sd-i-review-1-[0-9a-f]{8}\]/)
    expect(makeOttyHost().name).toBe('otty')
  })
})

describe('wezterm host', () => {
  test('a pane is spawned with the command after --, and send needs a pane this host spawned', () => {
    const { runner, calls } = recorder((argv) => (argv[1] === 'spawn' ? ok('12\n') : ok('[]')))
    const wezterm = makeWeztermHost({
      runtimeDir: tempDir('wezterm'),
      runner,
      platform: 'linux',
      available: () => true,
    })
    expect(wezterm.available()).toBe(true)
    expect(
      requirePart(wezterm, 'terminal')({ cwd: '/work/repo', argv: ['claude'], title: 't' }),
    ).toBe(0)
    expect(calls[0]).toEqual(['cli', 'spawn', '--cwd', '/work/repo', '--', 'claude'])
    // The listing does not show pane 12 on a tty this host recorded, so nothing is typed.
    expect(requirePart(wezterm, 'send')({ cwd: '/work/repo', text: 'hi' })).toEqual({
      accepted: false,
      ack: false,
    })
  })
})

describe('harness argv and Claude flags', () => {
  test('harnessArgv builds the bare CLI with the prompt guarded behind --', () => {
    const harness: Harness = 'codex'
    expect(harnessArgv(harness, 'codex', '-rf is not a flag')).toEqual([
      'codex',
      '--',
      '-rf is not a flag',
    ])
    expect(harnessArgv('opencode', 'opencode', 'hi')).toEqual(['opencode', '--prompt=hi'])
    expect(harnessArgv('pi', 'pi', 'hi', {}, {}, ['--session-id', 'abc'])).toEqual([
      'pi',
      '--session-id',
      'abc',
      '--',
      'hi',
    ])
    expect(() => harnessArgv('antigravity', 'agy', 'hi')).toThrow(
      "'antigravity' has no interactive launch",
    )
  })

  test('hasInteractiveArgv, harnessOrNull and HarnessSchema name the harnesses', () => {
    expect(hasInteractiveArgv('claude')).toBe(true)
    expect(hasInteractiveArgv('antigravity')).toBe(false)
    expect(harnessOrNull('codex')).toBe('codex')
    // A binary name or other alias maps to its harness id.
    expect(harnessOrNull('cursor-agent')).toBe('cursor')
    expect(harnessOrNull('my-own-tool')).toBeNull()
    // A schema accepts any tool id, including one the caller declares.
    expect(HarnessSchema.parse('my-own-tool')).toBe('my-own-tool')
    expect(HarnessSchema.safeParse('My Tool').success).toBe(false)
  })

  test('harnessAvailable looks the binary up on PATH', () => {
    expect(harnessAvailable('claude', 'node')).toBe(true)
    expect(harnessAvailable('claude', 'no-such-claude-binary')).toBe(false)
  })

  test('claudeSessionArgv presets the session id and pins the system prompt', () => {
    const flags: ClaudeLaunchFlags = {
      harnessSessionId: '6f1c0000-0000-4000-8000-000000000001',
      appendSystemPrompt: 'Be brief.',
    }
    expect(claudeSessionArgv(flags)).toEqual([
      '--session-id',
      '6f1c0000-0000-4000-8000-000000000001',
      '--append-system-prompt',
      'Be brief.',
    ])
    expect(harnessArgv('claude', 'claude', 'go', flags)).toEqual([
      'claude',
      ...claudeSessionArgv(flags),
      '--',
      'go',
    ])
  })

  test('claudeResumeArgv keeps the launch flags on a resume', () => {
    const flags: ClaudeSessionFlags = { appendSystemPrompt: 'Be brief.' }
    expect(claudeResumeArgv('abc-123', flags)).toEqual([
      '--resume=abc-123',
      '--append-system-prompt',
      'Be brief.',
    ])
    expect(claudeResumeArgv('abc-123')).toEqual(['--resume=abc-123'])
  })

  test('ClaudeSessionFlagsSchema validates the flags stored on a session record', () => {
    const flags = ClaudeSessionFlagsSchema.parse({ hookCommand: 'my-tool hook --harness claude' })
    expect(flags.hookCommand).toBe('my-tool hook --harness claude')
    expect(ClaudeSessionFlagsSchema.safeParse({ appendSystemPrompt: 5 }).success).toBe(false)
  })

  test('claudeHookSettings subscribes the command to every hook event', () => {
    const { hooks } = claudeHookSettings('my-tool hook --harness claude')
    expect(Object.keys(hooks)).toEqual(Object.keys(CLAUDE_HOOK_EVENTS))
    expect(CLAUDE_HOOK_EVENTS.SessionEnd.async).toBe(false)
    expect(hooks['SessionEnd']).toEqual([
      { hooks: [{ type: 'command', command: 'my-tool hook --harness claude', timeout: 10 }] },
    ])
    // With hookCommand set, a launch carries the settings in one --settings value.
    const argv = claudeSessionArgv({ hookCommand: 'my-tool hook' })
    expect(argv[0]).toBe('--settings')
    expect(JSON.parse(argv[1]!)).toEqual(claudeHookSettings('my-tool hook'))
  })

  test('withEnv prefixes the argv with env so the vars reach the process', () => {
    expect(withEnv(['claude', 'hi'], { MODE: 'review', TOKEN: undefined }, 'linux')).toEqual([
      'env',
      '-u',
      'TOKEN',
      'MODE=review',
      'claude',
      'hi',
    ])
    expect(withEnv(['claude'], undefined)).toEqual(['claude'])
  })

  test('wrapperSession is the body of a host session(): argv under env, then the id lookup', () => {
    const opened: CommandRequest[] = []
    const req: SessionRequest = {
      cwd: '/work/repo',
      harness: 'claude',
      binary: 'claude',
      prompt: 'go',
      title: 'review',
      env: { MODE: 'review' },
      wrap: ['my-wrapper', 'run', '--'],
    }
    const result = wrapperSession(
      (r) => {
        opened.push(r)
        return 0
      },
      req,
      { hostWaited: true },
    )
    expect(result).toEqual({ exitCode: 0, harnessSessionId: null })
    expect(opened[0]!.argv).toEqual([
      'env',
      'MODE=review',
      'my-wrapper',
      'run',
      '--',
      'claude',
      '--',
      'go',
    ])
    expect(opened[0]!.title).toBe('review')
  })

  test('harnessNativeSend queues into a codex thread; other harnesses have no such route', () => {
    const { runner, calls } = recorder()
    const result: NativeSendResult | null = harnessNativeSend('codex', 'thread-1', 'continue', {
      runner,
    })
    expect(result).toEqual({ accepted: true, ack: false })
    expect(calls).toEqual([['queue', '--thread', 'thread-1', '--message', 'continue']])
    expect(harnessNativeSend('claude', 'id', 'hi', { runner })).toBeNull()
  })
})

describe('codex session ids', () => {
  /** A rollout file name stamped with `ms` in local time, as codex names one. */
  function rolloutName(ms: number, id: string): string {
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const time = `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
    return `rollout-${date}T${time}-${id}.jsonl`
  }
  const firstLine = (sessionId: string, cwd: string) =>
    `${JSON.stringify({ type: 'session_meta', payload: { session_id: sessionId, cwd } })}\n`

  test('codexSessionsDir is <codex home>/sessions', () => {
    expect(codexSessionsDir('/tmp/codex-home')).toBe(join('/tmp/codex-home', 'sessions'))
    expect(codexSessionsDir()).toMatch(/\.codex[\\/]sessions$/)
  })

  test('parseRolloutMeta reads the cwd and session id off the first line', () => {
    expect(parseRolloutMeta(firstLine('sid-1', '/work/repo'))).toEqual({
      cwd: '/work/repo',
      sessionId: 'sid-1',
    })
    expect(parseRolloutMeta('not json')).toBeNull()
    expect(parseRolloutMeta('')).toBeNull()
  })

  test('walkRolloutFiles and findCodexSessionId read a fake codex home', () => {
    const codexHome = tempDir('codex')
    const sinceMs = Date.now()
    // codex files a rollout under its local date, `sessions/<yyyy>/<mm>/<dd>/`.
    const day = new Date(sinceMs)
    const p = (n: number) => String(n).padStart(2, '0')
    const dayDir = join(
      codexSessionsDir(codexHome),
      String(day.getFullYear()),
      p(day.getMonth() + 1),
      p(day.getDate()),
    )
    mkdirSync(dayDir, { recursive: true })
    const ours = join(dayDir, rolloutName(sinceMs, 'ours'))
    const theirs = join(dayDir, rolloutName(sinceMs, 'theirs'))
    writeFileSync(ours, firstLine('our-id', '/work/repo'))
    writeFileSync(theirs, firstLine('their-id', '/work/other'))
    writeFileSync(join(dayDir, 'notes.txt'), 'not a rollout')
    // Later files win: make ours the newest.
    utimesSync(ours, new Date(sinceMs + 1_000), new Date(sinceMs + 1_000))

    expect(walkRolloutFiles(codexSessionsDir(codexHome)).sort()).toEqual([ours, theirs].sort())
    expect(walkRolloutFiles(join(codexHome, 'missing'))).toEqual([])
    expect(findCodexSessionId(sinceMs, '/work/repo', { codexHome })).toBe('our-id')
    expect(findCodexSessionId(sinceMs, '/work/none', { codexHome })).toBeNull()
  })
})

describe('receipts', () => {
  test('a receipt tells delivered, unconfirmed and unknown apart', () => {
    const cmuxLike = makeCmuxHost({ runner: recorder().runner })
    const refused: SendReceipt = requirePart(cmuxLike, 'send')({ cwd: '/w', text: 'a\nb' })
    const unconfirmed: SendReceipt = { accepted: true, ack: false }
    const delivered: SendReceipt = { accepted: true, ack: true }
    const unknown: SendReceipt = { accepted: true, ack: false, uncertain: true }
    const verdict = (r: SendReceipt) =>
      !r.accepted
        ? 'try the next route'
        : r.ack
          ? 'delivered'
          : r.uncertain
            ? 'do not resend'
            : 'unconfirmed'
    expect([refused, unconfirmed, delivered, unknown].map(verdict)).toEqual([
      'try the next route',
      'unconfirmed',
      'delivered',
      'do not resend',
    ])
  })

  test('a Host declares whether its send confirms input', () => {
    const hosts = hostRegistry({ runtimeDir: tempDir('receipts') })
    const acking: HostName[] = (Object.keys(hosts) as HostName[]).filter((n) => hosts[n].acksSend)
    expect(acking.sort()).toEqual(['herdr', 'orca'])
  })
})
