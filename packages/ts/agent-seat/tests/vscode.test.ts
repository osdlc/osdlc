import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { HostPartMissing, requirePart } from '../src/contract.ts'
import { makeVscodeHost } from '../src/hosts/vscode.ts'
import {
  clientRuntime,
  liveWindows,
  parseReply,
  windowForCwd,
  type VscodeReply,
  type VscodeTransport,
  type VscodeWindow,
} from '../src/hosts/vscode-client.ts'
import { RUNTIME } from './fixtures/runtime.ts'

const win = (pid: number, folders: string[], startedAt = ''): VscodeWindow => ({
  pid,
  app: 'Code',
  endpoint: `/s/${pid}`,
  token: 't',
  folders,
  startedAt,
})

function fakeTransport(replies: Record<string, VscodeReply>) {
  const calls: Array<{ pid: number; body: Record<string, unknown> }> = []
  const transport: VscodeTransport = (w, body) => {
    calls.push({ pid: w.pid, body })
    return replies[String(body['op'])] ?? { ok: false, error: 'unexpected' }
  }
  return { transport, calls }
}

describe('client runtime', () => {
  test('from source it is the live runtime', () => {
    expect(clientRuntime(false)).toBe(process.execPath)
  })
  test('under a compiled binary it is node, else bun, from PATH, never the binary itself', () => {
    expect(clientRuntime(true, (bin) => (bin === 'node' ? '/x/node' : '/x/bun'))).toBe('/x/node')
    expect(clientRuntime(true, (bin) => (bin === 'bun' ? '/x/bun' : null))).toBe('/x/bun')
    expect(clientRuntime(true, () => null)).toBeNull()
  })
})

describe('window resolution', () => {
  test('deepest containing folder wins; path segments, not prefixes', () => {
    const ws = [win(1, ['/a']), win(2, ['/a/b']), win(3, ['/ab'])]
    expect(windowForCwd(ws, '/a/b/c')?.pid).toBe(2)
    expect(windowForCwd(ws, '/a/x')?.pid).toBe(1)
    expect(windowForCwd(ws, '/ab/x')?.pid).toBe(3)
    expect(windowForCwd(ws, '/zzz')).toBeNull()
  })
  test('same depth prefers the newest window', () => {
    expect(windowForCwd([win(1, ['/a'], '1'), win(2, ['/a'], '2')], '/a')?.pid).toBe(2)
  })
})

describe('host over a fake transport', () => {
  const ok = (result: Record<string, unknown>): VscodeReply => ({ ok: true, result })

  test('terminal throws the open-it error when no window matches, and never opens one', () => {
    const { transport, calls } = fakeTransport({})
    const host = makeVscodeHost({
      runtimeDir: RUNTIME,
      windows: () => [win(1, ['/other'])],
      transport,
    })
    expect(() => host.terminal!({ cwd: '/w', argv: ['x'], title: 't' })).toThrow(
      'no VS Code window has /w open — open it, with the sdlc-host extension installed',
    )
    expect(calls).toEqual([])
  })

  test('terminal/send/find/focus map to ops', () => {
    const { transport, calls } = fakeTransport({
      open: ok({ terminalId: 't1' }),
      send: ok({ accepted: true, ack: false }),
      list: ok({
        terminals: [
          { id: 't1', name: 'a', cwd: '/w/x' },
          { id: 't2', name: 'b', cwd: '/q' },
          { id: 't3', name: 'c', cwd: null },
        ],
      }),
      focus: ok({ focused: true }),
    })
    const host = makeVscodeHost({ runtimeDir: RUNTIME, windows: () => [win(1, ['/w'])], transport })
    expect(host.terminal!({ cwd: '/w', argv: ['claude', 'hi'], title: 'T' })).toBe(0)
    expect(host.send!({ cwd: '/w', text: 'go' })).toEqual({ accepted: true, ack: false })
    expect(host.find!({ cwd: '/w' })).toEqual([
      { cwd: '/w', harness: null, alive: true, lastOutputAt: null, handle: 't1' },
    ])
    expect(host.focus!({ cwd: '/w' })).toBe(true)
    expect(calls.map((c) => c.body['op'])).toEqual(['open', 'send', 'list', 'focus'])
    expect(calls[0]?.body).toEqual({ op: 'open', cwd: '/w', title: 'T', argv: ['claude', 'hi'] })
  })

  test('the session id rides open, send, focus and close, and find drops terminals bound to another session', () => {
    const { transport, calls } = fakeTransport({
      open: ok({ terminalId: 't1' }),
      send: ok({ accepted: true, ack: false }),
      list: ok({
        terminals: [
          { id: 't1', name: 'a', cwd: '/w', sessionId: 's-1' },
          { id: 't2', name: 'b', cwd: '/w', sessionId: 's-2' },
          { id: 't3', name: 'c', cwd: '/w', sessionId: null },
        ],
      }),
      focus: ok({ focused: true }),
      close: ok({ closed: true }),
    })
    const host = makeVscodeHost({ runtimeDir: RUNTIME, windows: () => [win(1, ['/w'])], transport })
    host.terminal!({ cwd: '/w', argv: ['x'], title: 'T', sessionId: 's-1' })
    host.send!({ cwd: '/w', sessionId: 's-1', text: 'go' })
    expect(host.find!({ cwd: '/w', sessionId: 's-1' }).map((f) => f.handle)).toEqual(['t1'])
    expect(host.find!({ cwd: '/w', sessionId: 's-9' }).map((f) => f.handle)).toEqual(['t3'])
    expect(host.find!({ cwd: '/w' }).map((f) => f.handle)).toEqual(['t1', 't2', 't3'])
    expect(host.focus!({ cwd: '/w', sessionId: 's-1' })).toBe(true)
    expect(host.close!({ cwd: '/w', sessionId: 's-1' })).toBe(true)
    const bodies = calls.map((c) => c.body)
    expect(bodies[0]).toMatchObject({ op: 'open', sessionId: 's-1' })
    expect(bodies[1]).toMatchObject({ op: 'send', sessionId: 's-1' })
    expect(bodies.at(-2)).toMatchObject({ op: 'focus', sessionId: 's-1' })
    expect(bodies.at(-1)).toEqual({ op: 'close', cwd: '/w', sessionId: 's-1' })
  })

  test('close is false with no window or when the window closed nothing', () => {
    const none = makeVscodeHost({
      runtimeDir: RUNTIME,
      windows: () => [],
      transport: fakeTransport({}).transport,
    })
    expect(none.close!({ cwd: '/w' })).toBe(false)
    const { transport } = fakeTransport({ close: ok({ closed: false }) })
    const host = makeVscodeHost({ runtimeDir: RUNTIME, windows: () => [win(1, ['/w'])], transport })
    expect(host.close!({ cwd: '/w', sessionId: 's-1' })).toBe(false)
  })

  test('failures are quiet for send/find/focus and loud for terminal', () => {
    const { transport } = fakeTransport({})
    const host = makeVscodeHost({ runtimeDir: RUNTIME, windows: () => [win(1, ['/w'])], transport })
    expect(host.send!({ cwd: '/w', text: 'x' })).toEqual({ accepted: false, ack: false })
    expect(host.find!({ cwd: '/w' })).toEqual([])
    expect(host.focus!({ cwd: '/w' })).toBe(false)
    expect(() => host.terminal!({ cwd: '/w', argv: ['x'], title: 't' })).toThrow('refused open')
    expect(() => requirePart(host, 'capture')).toThrow(HostPartMissing)
  })

  test('available pings on the short limit', () => {
    const limits: Array<number | undefined> = []
    const host = makeVscodeHost({
      runtimeDir: RUNTIME,
      windows: () => [win(1, ['/w']), win(2, ['/w'])],
      transport: (_w, _b, timeoutMs) => (limits.push(timeoutMs), { ok: false, error: 'x' }),
    })
    expect(host.available()).toBe(false)
    expect(limits).toEqual([1500, 1500])
  })

  test('available needs a reachable window', () => {
    const up = makeVscodeHost({
      runtimeDir: RUNTIME,
      windows: () => [win(1, ['/w'])],
      transport: fakeTransport({ ping: { ok: true, result: {} } }).transport,
    })
    const down = makeVscodeHost({
      runtimeDir: RUNTIME,
      windows: () => [win(1, ['/w'])],
      transport: fakeTransport({}).transport,
    })
    const none = makeVscodeHost({
      runtimeDir: RUNTIME,
      windows: () => [],
      transport: fakeTransport({}).transport,
    })
    expect([up.available(), down.available(), none.available()]).toEqual([true, false, false])
  })

  test('parseReply', () => {
    expect(parseReply('{"id":"1","ok":true,"result":{"a":1}}\n')).toEqual({
      ok: true,
      result: { a: 1 },
    })
    expect(parseReply('{"ok":false,"error":"bad token"}')).toEqual({
      ok: false,
      error: 'bad token',
    })
    expect(parseReply('')).toMatchObject({ ok: false })
  })
})

describe('registry scan', () => {
  test('skips dead pids and torn files', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const dir = mkdtempSync(join(tmpdir(), 'vscode-reg-'))
    const entry = (pid: number) =>
      JSON.stringify({ pid, app: 'A', endpoint: 'e', token: 't', folders: ['/w'], startedAt: 's' })
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '1.json'), entry(1))
    writeFileSync(join(dir, '2.json'), entry(2))
    writeFileSync(join(dir, '3.json'), '{torn')
    expect(liveWindows(dir, (pid) => pid === 1).map((w) => w.pid)).toEqual([1])
    rmSync(dir, { recursive: true })
  })
})

describe.skipIf(process.platform === 'win32')('registry trust', () => {
  const entry = (pid: number) =>
    JSON.stringify({ pid, app: 'A', endpoint: 'e', token: 't', folders: ['/w'], startedAt: 's' })
  /** A 0700 directory holding one 0600 entry per pid. */
  function privateRegistry(pids: number[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'vscode-trust-'))
    chmodSync(dir, 0o700)
    for (const pid of pids) writeFileSync(join(dir, `${pid}.json`), entry(pid), { mode: 0o600 })
    return dir
  }
  const pids = (dir: string, uid?: number) =>
    liveWindows(dir, () => true, uid === undefined ? {} : { uid }).map((w) => w.pid)

  test('a 0600 file in a 0700 directory is read', () => {
    const dir = privateRegistry([1])
    expect(pids(dir)).toEqual([1])
    rmSync(dir, { recursive: true })
  })

  test('a group-writable file is skipped', () => {
    const dir = privateRegistry([1, 2])
    chmodSync(join(dir, '2.json'), 0o620)
    expect(pids(dir)).toEqual([1])
    rmSync(dir, { recursive: true })
  })

  test('a group-writable directory is skipped whole', () => {
    const dir = privateRegistry([1])
    chmodSync(dir, 0o770)
    expect(pids(dir)).toEqual([])
    rmSync(dir, { recursive: true })
  })

  test("another user's directory and files are skipped", () => {
    const dir = privateRegistry([1])
    expect(pids(dir, process.getuid!() + 1)).toEqual([])
    rmSync(dir, { recursive: true })
  })

  test('a missing directory reads as empty', () => {
    expect(pids(join(tmpdir(), 'vscode-trust-no-such-dir'))).toEqual([])
  })
})
