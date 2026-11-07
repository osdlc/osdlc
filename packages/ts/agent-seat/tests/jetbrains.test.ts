/**
 * The JetBrains host against a fake IDE plugin: a node:http server speaking the
 * plugin's wire format (`fixtures/jetbrains-fake-ide.mjs`), and stub runners
 * standing in for curl.
 */

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

import { HostPartMissing, requirePart } from '../src/contract.ts'
import { curlRequest, makeJetbrainsHost, parseRegistryEntry } from '../src/hosts/jetbrains.ts'
import { parseJsonOrNull } from '../src/util.ts'

import { sleep, startChild, type Child } from './fixtures/child.ts'
import { RUNTIME } from './fixtures/runtime.ts'

const FAKE_IDE = fileURLToPath(new URL('./fixtures/jetbrains-fake-ide.mjs', import.meta.url))

const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' })

describe('parseRegistryEntry', () => {
  test('accepts a complete entry', () => {
    expect(
      parseRegistryEntry({
        protocol: 2,
        pid: 12,
        port: 63342,
        token: 't',
        startedAt: '2026-10-10T00:00:00Z',
      }),
    ).toEqual({
      protocol: 2,
      pid: 12,
      port: 63342,
      token: 't',
      startedAt: '2026-10-10T00:00:00Z',
    })
  })
  test('reads a missing startedAt as empty', () => {
    expect(parseRegistryEntry({ pid: 12, port: 63342, token: 't' })?.startedAt).toBe('')
  })
  test('an entry without a protocol parses with protocol null (skipped later, with a reason)', () => {
    expect(parseRegistryEntry({ pid: 12, port: 63342, token: 't' })?.protocol).toBeNull()
  })
  test.each([
    'not json',
    '[]',
    '{"pid":12,"port":0,"token":"t"}',
    '{"pid":12,"port":63342,"token":""}',
    '{"pid":"12","port":63342,"token":"t"}',
  ])('rejects %s', (text) => {
    expect(parseRegistryEntry(parseJsonOrNull(text))).toBeNull()
  })
})

describe('curlRequest', () => {
  test('keeps token and body off argv', () => {
    const { argv, input } = curlRequest(
      { pid: 1, port: 63343, token: 'sekret', protocol: 2, startedAt: '' },
      '/p',
      {
        text: 'say "hi"\n',
      },
    )
    expect(argv.join(' ')).not.toContain('sekret')
    expect(input).toContain('url = "http://127.0.0.1:63343/p"')
    expect(input).toContain('header = "Authorization: Bearer sekret"')
    expect(input).toContain('data-binary = "{\\"text\\":\\"say \\\\\\"hi\\\\\\"\\\\n\\"}"')
  })
})

describe('curl argv', () => {
  test('reports the HTTP status after the body instead of --fail dropping the body', () => {
    const { argv } = curlRequest(
      { pid: 1, port: 1, token: 't', protocol: 2, startedAt: '' },
      '/p',
      undefined,
    )
    expect(argv).toContain('-w')
    expect(argv).toContain('\n%{http_code}')
    expect(argv).not.toContain('--fail')
  })
})

describe('jetbrains host against a fake IDE process', () => {
  let dir: string
  let proc: Child
  let project: string
  const requests: Array<{ path: string; body: unknown }> = []
  /** The fake IDE's prefix on each request line it writes to stderr. */
  const REQ = 'REQ '

  beforeAll(async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'jb-host-')))
    project = join(dir, 'proj')
    mkdirSync(join(project, 'sub'), { recursive: true })
    proc = startChild([process.execPath, FAKE_IDE, 'tok', project], {
      // The registry file below names this process's pid, so the fake IDE's ping must too.
      env: { ...process.env, FAKE_PID: String(process.pid) },
      // Other stderr lines (blank ones included) are not requests.
      onStderrLine: (line) => {
        if (line.startsWith(REQ)) requests.push(JSON.parse(line.slice(REQ.length)))
      },
    })
    const port = Number(/PORT (\d+)/.exec(await proc.firstLine)![1])
    const reg = join(dir, 'reg')
    mkdirSync(reg)
    writeFileSync(
      join(reg, `${process.pid}.json`),
      JSON.stringify({ protocol: 2, pid: process.pid, port, token: 'tok' }),
    )
    writeFileSync(
      join(reg, 'dead.json'),
      JSON.stringify({ protocol: 2, pid: 999999, port: 1, token: 'x' }),
    )
    writeFileSync(join(reg, 'junk.json'), 'nope')
  })

  afterAll(() => {
    proc.kill()
    rmSync(dir, { recursive: true, force: true })
  })

  /**
   * Wait until the fake IDE has reported a request matching `ok`, at index
   * `from` or later. Its reports arrive on a stderr pipe, so a fixed sleep
   * can be too short.
   */
  const reported = async (
    ok: (r: { path: string }) => boolean,
    from = 0,
    ms = 5000,
  ): Promise<void> => {
    const until = Date.now() + ms
    while (!requests.slice(from).some(ok) && Date.now() < until) await sleep(20)
  }

  const host = () =>
    makeJetbrainsHost({
      registryDir: join(dir, 'reg'),
      pidAlive: (pid) => pid === process.pid,
    })

  test('available when a registered IDE answers; no ack on send', async () => {
    const h = host()
    // The host is listed for macOS only, so `available()` is false elsewhere; the parts below
    // still reach the IDE.
    expect(h.available()).toBe(process.platform === 'darwin')
    const cwd = join(project, 'sub')
    expect(requirePart(h, 'send')({ cwd, text: 'hello' })).toEqual({ accepted: true, ack: false })
    expect(requirePart(h, 'focus')({ cwd })).toBe(true)
    const found = requirePart(h, 'find')({ cwd })
    expect(found).toEqual([
      { cwd, harness: null, alive: true, lastOutputAt: null, handle: 'tab-1' },
    ])
    expect(requirePart(h, 'terminal')({ cwd, argv: ['echo', 'a b'], title: 't' })).toBe(0)
    await reported((r) => r.path === '/api/sdlc/terminal/open')
    const open = requests.find((r) => r.path === '/api/sdlc/terminal/open')
    expect(open?.body).toEqual({ cwd, title: 't', argv: ['echo', 'a b'] })
  })

  test('cwd outside every project: clear error, send/find/focus soft-fail', () => {
    const h = host()
    const cwd = join(dir, 'elsewhere')
    expect(() => requirePart(h, 'terminal')({ cwd, argv: ['x'], title: 't' })).toThrow(
      /has a project containing .*elsewhere/,
    )
    expect(requirePart(h, 'send')({ cwd, text: 'x' })).toEqual({ accepted: false, ack: false })
    expect(requirePart(h, 'find')({ cwd })).toEqual([])
    expect(requirePart(h, 'focus')({ cwd })).toBe(false)
  })

  test('cwd outside every project: openWorkspace opens the git root', async () => {
    const cwd = join(dir, 'elsewhere', 'deep')
    const before = requests.length
    const h = makeJetbrainsHost({
      registryDir: join(dir, 'reg'),
      pidAlive: (pid) => pid === process.pid,
      gitRoot: () => join(dir, 'elsewhere'),
    })
    const lines: string[] = []
    expect(requirePart(h, 'openWorkspace')({ cwd, notice: (l) => lines.push(l) })).toEqual({
      root: join(dir, 'elsewhere'),
      opened: true,
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^opening .*elsewhere in /)
    await reported((r) => r.path.endsWith('project/open'), before)
    const paths = requests.slice(before).map((r) => r.path)
    expect(paths.filter((p) => p !== '/api/sdlc/ping')).toEqual(['/api/sdlc/project/open'])
    expect(requests.find((r) => r.path.endsWith('project/open'))?.body).toEqual({
      path: join(dir, 'elsewhere'),
    })
  })

  test('wrong token is unreachable', () => {
    const reg = join(dir, 'reg2')
    mkdirSync(reg)
    const real = JSON.parse(readFileSync(join(dir, 'reg', `${process.pid}.json`), 'utf8'))
    writeFileSync(join(reg, 'a.json'), JSON.stringify({ ...real, token: 'bad' }))
    const h = makeJetbrainsHost({ registryDir: reg, pidAlive: () => true })
    expect(h.available()).toBe(false)
  })

  test('has no capture part', () => {
    expect(() => requirePart(host(), 'capture')).toThrow(HostPartMissing)
  })
})

/** Registry of fake IDEs `[pid, product]` whose replies come from `reply`; `calls` records the paths asked. */
function fakeIdes(
  ides: Array<[number, string]>,
  reply: (path: string, port: number) => { status: number; body: unknown },
  calls: Array<{ port: number; path: string; body: unknown }> = [],
) {
  const dir = mkdtempSync(join(tmpdir(), 'jb-open-'))
  for (const [pid] of ides) {
    writeFileSync(
      join(dir, `${pid}.json`),
      JSON.stringify({ protocol: 2, pid, port: 100 + pid, token: 't' }),
    )
  }
  const runner: CommandRunner = {
    run: (_argv, o) => {
      const input = o.input ?? ''
      const m = /127\.0\.0\.1:(\d+)(\/\S+?)"/.exec(input)!
      const port = Number(m[1])
      const data = /data-binary = "(.*)"/.exec(input)
      calls.push({
        port,
        path: m[2]!,
        body: data === null ? undefined : JSON.parse(data[1]!.replace(/\\(["\\])/g, '$1')),
      })
      if (m[2] === '/api/sdlc/ping') {
        const product = ides.find(([pid]) => 100 + pid === port)![1]
        return ok(
          `${JSON.stringify({ protocol: 2, pid: port - 100, product, projects: ['/other'] })}\n200`,
        )
      }
      const r = reply(m[2]!, port)
      return ok(`${JSON.stringify(r.body)}\n${r.status}`)
    },
  }
  return { dir, runner, calls }
}

describe('opening a workspace when none contains cwd', () => {
  const okReply = (path: string) =>
    path === '/api/sdlc/project/open'
      ? { status: 200, body: { ok: true, project: '/repo' } }
      : { status: 200, body: { ok: true } }
  const query = { cwd: '/repo/sub' }
  const openHost = (
    f: ReturnType<typeof fakeIdes>,
    extra: Partial<
      Omit<Parameters<typeof makeJetbrainsHost>[0], 'registryDir' | 'runtimeDir'>
    > = {},
  ) =>
    makeJetbrainsHost({
      registryDir: f.dir,
      runner: f.runner,
      pidAlive: () => true,
      gitRoot: () => '/repo',
      ...extra,
    })
  const openCalls = (f: ReturnType<typeof fakeIdes>) =>
    f.calls.filter((c) => c.path === '/api/sdlc/project/open')

  test('the only IDE opens the git root; terminal alone then reaches it', () => {
    const f = fakeIdes([[1, 'WebStorm']], okReply)
    const h = openHost(f)
    expect(requirePart(h, 'openWorkspace')(query)).toEqual({ root: '/repo', opened: true })
    expect(f.calls.map((c) => [c.port, c.path])).toEqual([
      [101, '/api/sdlc/ping'],
      [101, '/api/sdlc/project/open'],
    ])
    expect(f.calls[1]?.body).toEqual({ path: '/repo' })
  })

  test('terminal never opens a workspace itself', () => {
    const f = fakeIdes([[1, 'WebStorm']], okReply)
    expect(() =>
      requirePart(openHost(f), 'terminal')({ ...query, argv: ['x'], title: 't' }),
    ).toThrow(/has a project containing \/repo\/sub/)
    expect(openCalls(f)).toEqual([])
  })

  test('outside a repository, or when git fails, the cwd itself is opened', () => {
    for (const gitRoot of [
      () => null,
      () => {
        throw new Error('spawn failed')
      },
    ]) {
      const f = fakeIdes([[1, 'WebStorm']], okReply)
      requirePart(openHost(f, { gitRoot }), 'openWorkspace')(query)
      expect(openCalls(f)[0]?.body).toEqual({ path: '/repo/sub' })
    }
  })

  test('a git root that is the home directory or the filesystem root is not opened', () => {
    for (const root of [homedir(), '/']) {
      const f = fakeIdes([[1, 'WebStorm']], okReply)
      requirePart(openHost(f, { gitRoot: () => root }), 'openWorkspace')(query)
      expect(openCalls(f)[0]?.body).toEqual({ path: '/repo/sub' })
    }
  })

  test('several IDEs: host.jetbrains.ide picks one by product name, ignoring case', () => {
    const f = fakeIdes(
      [
        [1, 'IntelliJ IDEA'],
        [2, 'WebStorm'],
      ],
      okReply,
    )
    requirePart(openHost(f, { settings: { ide: 'webstorm' } }), 'openWorkspace')(query)
    expect(openCalls(f).map((c) => c.port)).toEqual([102])
  })

  test('several IDEs and no preference, a partial name, or no match: an error listing them', () => {
    const f = fakeIdes(
      [
        [1, 'IntelliJ IDEA'],
        [2, 'WebStorm'],
      ],
      okReply,
    )
    for (const ide of [undefined, 'PyCharm', 'Web']) {
      const h = openHost(f, { settings: { ide } })
      expect(() => requirePart(h, 'openWorkspace')(query)).toThrow(
        /IntelliJ IDEA \(pid 1\), WebStorm \(pid 2\)/,
      )
    }
    expect(openCalls(f)).toEqual([])
  })

  test('an IDE that reports no product never matches host.jetbrains.ide', () => {
    const f = fakeIdes(
      [
        [1, ''],
        [2, 'WebStorm'],
      ],
      okReply,
    )
    expect(() =>
      requirePart(openHost(f, { settings: { ide: '' } }), 'openWorkspace')(query),
    ).toThrow(/names none/)
  })

  test('a workspace already containing cwd is reported and nothing is opened', () => {
    const f = fakeIdes([[1, 'WebStorm']], okReply)
    const h = openHost(f, { gitRoot: () => '/other' })
    expect(requirePart(h, 'openWorkspace')({ cwd: '/other/sub' })).toEqual({
      root: '/other',
      opened: false,
    })
    expect(openCalls(f)).toEqual([])
  })

  test('the plugin declining (untrusted) fails with its reason', () => {
    const f = fakeIdes([[1, 'WebStorm']], () => ({
      status: 200,
      body: { ok: false, error: 'waiting for the user to trust /repo' },
    }))
    expect(() => requirePart(openHost(f), 'openWorkspace')(query)).toThrow(
      /waiting for the user to trust \/repo/,
    )
  })

  test('send, find and focus never open a workspace', () => {
    const f = fakeIdes([[1, 'WebStorm']], okReply)
    const h = openHost(f)
    expect(requirePart(h, 'send')({ cwd: '/repo', text: 'x' }).accepted).toBe(false)
    expect(requirePart(h, 'find')({ cwd: '/repo' })).toEqual([])
    expect(requirePart(h, 'focus')({ cwd: '/repo' })).toBe(false)
    expect(openCalls(f)).toEqual([])
  })
})

/** What the host's curl prints: the body, then the status line it asks for with `-w`. */
const reply = (body: string, status = 200): CommandResult => ok(`${body}\n${status}`)

describe('jetbrains host against fake IDEs in other modes', () => {
  let dir: string
  let project: string
  const procs: Child[] = []

  /** Starts a fake IDE for `project` in `mode`; resolves its port. */
  const startFake = async (mode: string, pid: number): Promise<number> => {
    const proc = startChild([process.execPath, FAKE_IDE, 'tok', project], {
      env: { ...process.env, FAKE_MODE: mode, FAKE_PID: String(pid) },
    })
    procs.push(proc)
    return Number(/PORT (\d+)/.exec(await proc.firstLine)![1])
  }

  /** A registry dir holding one file per entry; returns its path. */
  const registry = (
    name: string,
    entries: Array<{ pid: number; port: number; startedAt?: string }>,
  ): string => {
    const reg = join(dir, name)
    mkdirSync(reg)
    for (const e of entries) {
      writeFileSync(join(reg, `${e.pid}.json`), JSON.stringify({ protocol: 2, token: 'tok', ...e }))
    }
    return reg
  }

  const hostOn = (reg: string) =>
    makeJetbrainsHost({ registryDir: reg, pidAlive: (pid) => pid !== 999999 })
  const cwd = () => join(project, 'sub')
  const open = (h: ReturnType<typeof hostOn>) =>
    requirePart(h, 'terminal')({ cwd: cwd(), argv: ['x'], title: 't' })
  const declined = { accepted: false, ack: false }

  let okPort: number
  let refusePort: number
  let errorsPort: number
  let garbagePort: number

  beforeAll(async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'jb-modes-')))
    project = join(dir, 'proj')
    mkdirSync(join(project, 'sub'), { recursive: true })
    okPort = await startFake('ok', 41001)
    refusePort = await startFake('refuse', 41002)
    errorsPort = await startFake('errors', 41003)
    garbagePort = await startFake('garbage', 41004)
  })

  afterAll(() => {
    for (const p of procs) p.kill()
    rmSync(dir, { recursive: true, force: true })
  })

  test('the plugin refusing is reported, not mistaken for success', () => {
    const h = hostOn(registry('reg-refuse', [{ pid: 41002, port: refusePort }]))
    expect(() => open(h)).toThrow(/no open project contains cwd/)
    expect(requirePart(h, 'send')({ cwd: cwd(), text: 'x' })).toEqual(declined)
    expect(requirePart(h, 'find')({ cwd: cwd() })).toEqual([])
    expect(requirePart(h, 'focus')({ cwd: cwd() })).toBe(false)
  })

  test('the plugin error text reaches the caller, and a failed send is not accepted', () => {
    const h = hostOn(registry('reg-errors', [{ pid: 41003, port: errorsPort }]))
    expect(() => open(h)).toThrow(/HTTP 400\) cwd is required/)
    expect(requirePart(h, 'send')({ cwd: cwd(), text: 'x' })).toEqual(declined)
    expect(requirePart(h, 'find')({ cwd: cwd() })).toEqual([])
    expect(requirePart(h, 'focus')({ cwd: cwd() })).toBe(false)
  })

  test('a reply that is not JSON, or is empty, is a failure', () => {
    const h = hostOn(registry('reg-garbage', [{ pid: 41004, port: garbagePort }]))
    expect(() => open(h)).toThrow(/terminal open failed/)
    expect(requirePart(h, 'send')({ cwd: cwd(), text: 'x' })).toEqual(declined)
  })

  test('two IDEs with the project open: the newest startedAt wins, whatever the file order', () => {
    // The refusing IDE declines everything and the ok one accepts, so a send shows which was chosen.
    const newerOk = hostOn(
      registry('reg-tie-a', [
        { pid: 41001, port: okPort, startedAt: '2026-10-10T10:00:00Z' },
        { pid: 41002, port: refusePort, startedAt: '2026-10-10T09:00:00Z' },
      ]),
    )
    expect(requirePart(newerOk, 'send')({ cwd: cwd(), text: 'x' }).accepted).toBe(true)
    const newerRefuses = hostOn(
      registry('reg-tie-b', [
        { pid: 41001, port: okPort, startedAt: '2026-10-10T09:00:00Z' },
        { pid: 41002, port: refusePort, startedAt: '2026-10-10T10:00:00Z' },
      ]),
    )
    expect(requirePart(newerRefuses, 'send')({ cwd: cwd(), text: 'x' }).accepted).toBe(false)
  })

  test('a dead pid is skipped without being called', () => {
    const h = hostOn(registry('reg-dead', [{ pid: 999999, port: okPort }]))
    expect(h.available()).toBe(false)
  })
})

describe('jetbrains host call limits and caching', () => {
  const stubDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'jb-stub-'))
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ protocol: 2, pid: 1, port: 5, token: 't' }))
    return dir
  }
  const pong = (dir: string) =>
    JSON.stringify({ protocol: 2, pid: 1, product: 'WebStorm', projects: [dir] })

  test('pings with a short limit, once per operation, and surfaces why a call failed', () => {
    const dir = stubDir()
    const limits: string[] = []
    const runner: CommandRunner = {
      run: (argv, o) => {
        const path = o.input?.includes('/ping') ? 'ping' : 'other'
        limits.push(`${path}:${argv[argv.indexOf('-m') + 1]}`)
        return path === 'ping' ? reply(pong(dir)) : reply('{"error":"unauthorized"}', 401)
      },
    }
    const h = makeJetbrainsHost({ registryDir: dir, runner, pidAlive: () => true })
    expect(() => requirePart(h, 'terminal')({ cwd: dir, argv: ['x'], title: 't' })).toThrow(
      /rejected the token/,
    )
    requirePart(h, 'send')({ cwd: dir, text: 'x' })
    expect(limits.filter((l) => l.startsWith('ping'))).toEqual(['ping:1.5'])
    expect(limits).toContain('other:10')
    rmSync(dir, { recursive: true, force: true })
  })

  test('the answering-IDE list is reused for 5s, then pinged again', () => {
    const dir = stubDir()
    let pings = 0
    let clock = 1_000
    const runner: CommandRunner = {
      run: (_argv, o) => {
        if (o.input?.includes('/ping')) pings++
        return reply(pong(dir))
      },
    }
    const h = makeJetbrainsHost({
      registryDir: dir,
      runner,
      pidAlive: () => true,
      now: () => clock,
    })
    // `find` resolves the IDE through the same cached list as `available()`, on every platform.
    const look = () => requirePart(h, 'find')({ cwd: '/elsewhere' })
    look()
    clock += 4_999
    look()
    expect(pings).toBe(1)
    clock += 2
    look()
    expect(pings).toBe(2)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('jetbrains session ids', () => {
  test('the plugin tracks tabs by cwd only, so the host has no close part and ignores a session id', () => {
    const host = makeJetbrainsHost({ runtimeDir: RUNTIME, available: () => true })
    expect(host.close).toBeUndefined()
  })
})

describe('jetbrains host with a stub runner', () => {
  test('unavailable with an empty or missing registry', () => {
    const h = makeJetbrainsHost({
      registryDir: join(tmpdir(), 'jb-no-such-dir'),
      runner: { run: () => ok('{}') },
    })
    expect(h.available()).toBe(false)
  })

  test('an entry with an unknown protocol is skipped with a reason', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jb-proto-'))
    writeFileSync(
      join(dir, 'a.json'),
      JSON.stringify({ protocol: 99, pid: 1, port: 5, token: 't' }),
    )
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ pid: 2, port: 5, token: 't' }))
    const h = makeJetbrainsHost({
      registryDir: dir,
      runner: { run: () => ok('{}\n200') },
      pidAlive: () => true,
    })
    expect(h.available()).toBe(false)
    expect(() => requirePart(h, 'terminal')({ cwd: dir, argv: ['x'], title: 't' })).toThrow(
      /protocol 99, not 2.*protocol none, not 2/,
    )
    rmSync(dir, { recursive: true, force: true })
  })

  test.skipIf(process.platform === 'win32')(
    'a registry file or directory others can write is skipped with a reason, never called',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'jb-trust-'))
      const file = join(dir, 'a.json')
      writeFileSync(file, JSON.stringify({ protocol: 2, pid: 1, port: 5, token: 't' }))
      const calls: string[][] = []
      const host = () =>
        makeJetbrainsHost({
          registryDir: dir,
          runner: {
            run: (argv) => {
              calls.push([...argv])
              return ok('{}\n200')
            },
          },
          pidAlive: () => true,
        })
      const open = () => requirePart(host(), 'terminal')({ cwd: dir, argv: ['x'], title: 't' })

      chmodSync(file, 0o622)
      expect(open).toThrow(/registry file .*a\.json is writable by group or others/)
      chmodSync(file, 0o600)
      chmodSync(dir, 0o777)
      expect(open).toThrow(/registry directory .* is writable by group or others/)
      expect(calls).toEqual([])
      rmSync(dir, { recursive: true, force: true })
    },
  )
})
