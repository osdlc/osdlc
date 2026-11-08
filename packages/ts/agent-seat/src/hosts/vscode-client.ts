/**
 * The caller's side of the companion extension (`sdlc-host`) protocol; design in
 * `docs/planning/research/vscode.md`. The wire types are restated
 * here, not imported, so this package does not depend on the extension
 * package; a consumer that ships the extension pins both sides with a parity
 * test.
 *
 * The host contract is synchronous, and a Node socket is not. The request
 * therefore runs in a tiny one-shot child (`<runtime> -e CLIENT_SOURCE`) that
 * opens the socket, sends one line and prints the reply. The talk to the
 * window is IPC, not a shell-out to a foreign tool, but the child itself is a
 * subprocess, so it goes through the command seam like every other one.
 */

import { tmpdir } from 'node:os'

import { failureText, ran, resolveRunner, type CommandRunner } from '@osdlc/command-seam'
import { isCompiledBinary, isRecord, parseJsonOrNull, pidAlive, which } from '../util.ts'

import { deepestContaining, readHostRegistry, type RegistryTrustOptions } from './registry.ts'

/**
 * One window's registry entry, as the extension wrote it.
 *
 * @experimental needs the `sdlc-host` companion extension, which is not published yet.
 */
export interface VscodeWindow {
  pid: number
  app: string
  endpoint: string
  token: string
  folders: string[]
  startedAt: string
}

/**
 * A reply from the window: its result object, or the error it sent.
 *
 * @experimental needs the `sdlc-host` companion extension, which is not published yet.
 */
export type VscodeReply =
  { ok: true; result: Record<string, unknown> } | { ok: false; error: string }

/**
 * The transport: one request body in, one reply out. Tests substitute a fake.
 *
 * @experimental needs the `sdlc-host` companion extension, which is not published yet.
 */
export type VscodeTransport = (
  window: VscodeWindow,
  body: Record<string, unknown>,
  /** Per-call limit; default {@link REQUEST_TIMEOUT_MS}. */
  timeoutMs?: number,
) => VscodeReply

/**
 * Program run by the one-shot child. stdin: `{endpoint, line, timeoutMs}`;
 * stdout: the window's reply line, or `{"ok":false,"error":...}` on a
 * connect/timeout failure. Plain CommonJS so `node -e` and `bun -e` both run it.
 */
export const CLIENT_SOURCE = `
const net = require('node:net')
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => (input += d))
process.stdin.on('end', () => {
  const { endpoint, line, timeoutMs } = JSON.parse(input)
  const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); process.exit(0) }
  const s = net.connect(endpoint)
  let buf = ''
  s.setEncoding('utf8')
  const t = setTimeout(() => out({ ok: false, error: 'timed out' }), timeoutMs)
  s.on('connect', () => s.write(line + '\\n'))
  s.on('data', (d) => { buf += d; const i = buf.indexOf('\\n'); if (i >= 0) { clearTimeout(t); process.stdout.write(buf.slice(0, i) + '\\n'); process.exit(0) } })
  s.on('error', (e) => out({ ok: false, error: e.message }))
})
`

const REQUEST_TIMEOUT_MS = 10_000

/** `available()` / discovery pings: a hung window must not stall host detection for 10s each. */
export const PING_TIMEOUT_MS = 1_500

/**
 * The JS runtime that runs {@link CLIENT_SOURCE}. From source or the Node bundle
 * that is the live runtime (`process.execPath`). Under a `bun build --compile`
 * binary `process.execPath` IS the caller's binary, which would take `-e` as one of
 * its own arguments, so a `node` (else `bun`) on `PATH` is used instead; `null`
 * when there is none.
 */
export function clientRuntime(
  compiled: boolean = isCompiledBinary(import.meta.url),
  find: (bin: string) => string | null = (bin) => which(bin),
): string | null {
  if (!compiled) return process.execPath
  return find('node') ?? find('bun')
}

/**
 * The production transport: sync, through the command seam.
 *
 * @experimental needs the `sdlc-host` companion extension, which is not published yet.
 */
export function subprocessTransport(runner?: CommandRunner | undefined): VscodeTransport {
  if (runner === undefined) {
    const runtime = clientRuntime()
    if (runtime === null) {
      // No runtime to run the client in: every request fails with the reason, so
      // `available()` is false and an explicit open names what is missing.
      return () => ({
        ok: false,
        error: 'a compiled binary needs node or bun on PATH to reach a VS Code window',
      })
    }
    runner = resolveRunner(runtime)
  }
  const run = runner
  return (window, body, timeoutMs = REQUEST_TIMEOUT_MS) => {
    const line = JSON.stringify({ id: '1', token: window.token, ...body })
    const res = run.run(['-e', CLIENT_SOURCE], {
      cwd: tmpdir(),
      input: JSON.stringify({ endpoint: window.endpoint, line, timeoutMs }),
      timeoutMs: timeoutMs + 5_000,
    })
    if (!ran(res)) return { ok: false, error: failureText(res) }
    return parseReply(res.stdout)
  }
}

export function parseReply(stdout: string): VscodeReply {
  const raw = parseJsonOrNull(stdout.trim().split('\n')[0] ?? '')
  if (!isRecord(raw)) return { ok: false, error: 'unparseable reply' }
  if (raw['ok'] === true && isRecord(raw['result'])) return { ok: true, result: raw['result'] }
  return { ok: false, error: typeof raw['error'] === 'string' ? raw['error'] : 'request failed' }
}

function parseWindow(raw: unknown): VscodeWindow | null {
  if (!isRecord(raw)) return null
  const { pid, app, endpoint, token, folders, startedAt } = raw
  if (typeof pid !== 'number' || typeof endpoint !== 'string' || typeof token !== 'string')
    return null
  if (!Array.isArray(folders) || !folders.every((f) => typeof f === 'string')) return null
  return {
    pid,
    endpoint,
    token,
    folders: folders as string[],
    app: typeof app === 'string' ? app : 'unknown',
    startedAt: typeof startedAt === 'string' ? startedAt : '',
  }
}

/**
 * Registry entries whose process is alive. Unreadable or malformed files are
 * skipped, and so, on POSIX, are a file or directory another user owns or can
 * write ({@link readHostRegistry}).
 *
 * @experimental needs the `sdlc-host` companion extension, which is not published yet.
 */
export function liveWindows(
  dir: string,
  alive: (pid: number) => boolean = pidAlive,
  trust: RegistryTrustOptions = {},
): VscodeWindow[] {
  return readHostRegistry(dir, parseWindow, alive, trust)
}

/** The window whose folder contains `cwd`: deepest folder wins, then the newest window. Null when none. */
export function windowForCwd(windows: readonly VscodeWindow[], cwd: string): VscodeWindow | null {
  return deepestContaining(
    cwd,
    windows,
    (w) => w.folders,
    (w) => w.startedAt,
  )
}
