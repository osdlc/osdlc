/**
 * VS Code, Cursor and Windsurf through the companion extension (`sdlc-host`;
 * design in `docs/planning/research/vscode.md`). Each window runs a private
 * socket server and registers it; this host picks the window whose workspace
 * folder contains `cwd`.
 *
 * A window is never opened unasked: when none has `cwd`, `terminal`/`session`
 * throw telling the person to open it. `send` cannot know whether the input
 * was consumed (`sendText` reports nothing), so a receipt is `accepted` and
 * never `ack`. There is no `capture` part: the published extension API has no
 * read-back for arbitrary terminals.
 *
 * `open` carries the caller's session id and the extension binds the terminal to it;
 * `send`, `focus`, `find` and `close` pass it back, so two sessions in one folder
 * reach two terminals. The extension answers a request for a session id no terminal
 * is bound to from terminals bound to none (opened before ids were passed), never
 * another session's.
 */

import { isWithin } from '../util.ts'

import type {
  CommandRequest,
  FindQuery,
  FoundSession,
  Host,
  SendReceipt,
  SendRequest,
} from '../contract.ts'
import { sessionViaTerminal } from '../harness.ts'
import { registryDirOf, type HostStateOptions } from './registry.ts'

import {
  liveWindows,
  PING_TIMEOUT_MS,
  subprocessTransport,
  windowForCwd,
  type VscodeTransport,
  type VscodeWindow,
} from './vscode-client.ts'

/** The request field naming the session, when the caller has one. */
function sessionField(target: { sessionId?: string | undefined }): { sessionId?: string } {
  return target.sessionId === undefined ? {} : { sessionId: target.sessionId }
}

/**
 * The VS Code host (also Cursor and Windsurf): opens terminals through the companion extension (`sdlc-host`)
 * running in the window that has `cwd` open. All platforms; available when a registered window answers a ping.
 * Reads the windows the extension registered under `runtimeDir`/`registryDir` ({@link HostStateOptions}).
 *
 * @experimental needs the `sdlc-host` companion extension, which is not published yet.
 */
export function makeVscodeHost(
  opts: {
    /** Replaces the registry scan + reachability probe in `available()`. */
    available?: (() => boolean) | undefined
    /** Replaces the registry read. */
    windows?: (() => VscodeWindow[]) | undefined
    transport?: VscodeTransport | undefined
  } & HostStateOptions,
): Host {
  const registryDir = registryDirOf('vscode', opts)
  const windows = () => (opts.windows ?? (() => liveWindows(registryDir)))()
  const transport = (): VscodeTransport => opts.transport ?? subprocessTransport()

  return {
    name: 'vscode',
    platforms: 'all',
    available() {
      if (opts.available !== undefined) return opts.available()
      const send = transport()
      // The transport is synchronous, so windows are pinged one after another, each on a short limit.
      return windows().some((w) => send(w, { op: 'ping' }, PING_TIMEOUT_MS).ok)
    },
    terminal(req: CommandRequest): number {
      const w = windowForCwd(windows(), req.cwd)
      if (w === null) {
        throw new Error(
          `no VS Code window has ${req.cwd} open — open it, with the sdlc-host extension installed`,
        )
      }
      const reply = transport()(w, {
        op: 'open',
        cwd: req.cwd,
        title: req.title,
        argv: req.argv,
        ...(req.sessionId === undefined ? {} : { sessionId: req.sessionId }),
      })
      if (!reply.ok)
        throw new Error(`vscode window (${w.app}, pid ${w.pid}) refused open: ${reply.error}`)
      return 0
    },
    session: sessionViaTerminal,
    send(req: SendRequest): SendReceipt {
      const w = windowForCwd(windows(), req.cwd)
      if (w === null) return { accepted: false, ack: false }
      const reply = transport()(w, {
        op: 'send',
        cwd: req.cwd,
        text: req.text,
        ...sessionField(req),
      })
      return { accepted: reply.ok && reply.result['accepted'] === true, ack: false }
    },
    find(query: FindQuery): FoundSession[] {
      const w = windowForCwd(windows(), query.cwd)
      if (w === null) return []
      const reply = transport()(w, { op: 'list' })
      if (!reply.ok || !Array.isArray(reply.result['terminals'])) return []
      const found: FoundSession[] = []
      const ofSession: FoundSession[] = []
      for (const t of reply.result['terminals'] as unknown[]) {
        if (typeof t !== 'object' || t === null) continue
        const { id, cwd, sessionId } = t as { id?: unknown; cwd?: unknown; sessionId?: unknown }
        if (typeof id !== 'string' || typeof cwd !== 'string' || !isWithin(cwd, query.cwd)) continue
        const bound = typeof sessionId === 'string' ? sessionId : null
        // Bound to another session: not the one asked about.
        if (bound !== null && query.sessionId !== undefined && bound !== query.sessionId) continue
        // `alive` is "a terminal is open there"; the API cannot tell an agent from a shell.
        const session: FoundSession = {
          cwd: query.cwd,
          harness: null,
          alive: true,
          lastOutputAt: null,
          handle: id,
        }
        found.push(session)
        if (bound !== null) ofSession.push(session)
      }
      // The session's own terminal when there is one; else (opened before ids were passed) those at the cwd.
      return query.sessionId !== undefined && ofSession.length > 0 ? ofSession : found
    },
    focus(query: FindQuery): boolean {
      const w = windowForCwd(windows(), query.cwd)
      if (w === null) return false
      const reply = transport()(w, { op: 'focus', cwd: query.cwd, ...sessionField(query) })
      return reply.ok && reply.result['focused'] === true
    },
    close(query: FindQuery): boolean {
      const w = windowForCwd(windows(), query.cwd)
      if (w === null) return false
      const reply = transport()(w, { op: 'close', cwd: query.cwd, ...sessionField(query) })
      return reply.ok && reply.result['closed'] === true
    },
  }
}
