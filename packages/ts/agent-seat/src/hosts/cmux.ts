/**
 * cmux: a new workspace on `cwd` whose first terminal runs a command, plus
 * send/find/focus/capture. Research: `docs/planning/research/cmux.md`
 * (cmux 0.64.17).
 *
 * `workspace create` is the canonical spelling; `new-workspace` is the legacy
 * alias and prints a deprecation notice on every call.
 *
 * A caller session id is bound through `--description`: the create carries
 * {@link cmuxSessionMarker}, and a `find` with a `sessionId` keeps the
 * workspaces whose listed `description` (or `name`/`title`) holds it. The list
 * shapes are docs-only (cmux was not installed where this was written), so when
 * no workspace carries the marker, or the list is denied, `find` falls back to
 * `cwd`, leaving out workspaces marked for another session.
 *
 * Socket access: send/focus/capture and the workspace-list half of `find` use
 * the cmux control socket, which by default (`automation.socketControlMode`
 * "cmuxOnly") rejects callers not started inside cmux ("Access denied - only
 * processes started inside cmux can connect"; observed). Published docs
 * (the cmux.json schema and `cmux --help` "Socket Auth"): set
 * `automation.socketControlMode` in ~/.config/cmux/cmux.json to `automation`,
 * `allowAll` or `password`; in password mode export `CMUX_SOCKET_PASSWORD` (or
 * pass `--password`). When denied these parts report "not accepted / false /
 * null" without throwing; `find` still answers from the hook store.
 */

import {
  commandString,
  failureText,
  ran,
  resolveRunner,
  type CommandRunner,
} from '@osdlc/command-seam'
import { isRecord, nonEmptyString, parseJsonOrNull, realResolve, sessionIdSlug } from '../util.ts'

import {
  onPath,
  quietRun,
  supportsPlatform,
  type CommandRequest,
  type FindQuery,
  type FoundSession,
  type Host,
  type SendReceipt,
  type SendRequest,
} from '../contract.ts'
import { commandArgv, harnessOrNull, sessionViaTerminal } from '../harness.ts'

/** The text a workspace's description carries to name the caller session id it was opened for. */
export function cmuxSessionMarker(sessionId: string): string {
  return `${MARKER_PREFIX}${sessionIdSlug(sessionId)}`
}

/** Argv for `cmux workspace create` — pure, so a test can pin it. */
export function cmuxCreateArgv(req: CommandRequest): string[] {
  return [
    'workspace',
    'create',
    '--name',
    req.title,
    ...(req.sessionId === undefined ? [] : ['--description', cmuxSessionMarker(req.sessionId)]),
    '--cwd',
    req.cwd,
    '--command',
    commandString(commandArgv(req)),
    // Per `cmux new-workspace --help` the default is already false; explicit so the person's view is never taken.
    '--focus',
    'false',
  ]
}

/** Argv for `cmux sessions list` (hook store, no socket). `--cwd` is a text filter, so results are re-filtered exactly. */
export function cmuxSessionsArgv(cwd: string): string[] {
  return ['sessions', 'list', '--cwd', cwd, '--json']
}

/** Argv for `cmux --json workspace list` (needs the socket). */
export function cmuxWorkspaceListArgv(): string[] {
  return ['--json', 'workspace', 'list']
}

/** `workspace/surface` handle -> flags targeting that terminal explicitly (never the caller's own). */
function targetFlags(handle: string): string[] {
  const [workspace, surface] = handle.split('/')
  return [
    '--workspace',
    workspace ?? '',
    ...(surface !== undefined && surface !== '' ? ['--surface', surface] : []),
  ]
}

/**
 * `cmux send` types the text (its `\n`, `\r` and `\t` escape sequences are
 * interpreted as keys, so `send` refuses text containing them,
 * {@link cmuxTextIsUnsafe}); a separate `send-key enter` submits.
 */
export function cmuxSendArgv(handle: string, text: string): string[] {
  return ['send', ...targetFlags(handle), '--', text]
}

export function cmuxSendEnterArgv(handle: string): string[] {
  return ['send-key', ...targetFlags(handle), '--', 'enter']
}

export function cmuxFocusArgv(handle: string): string[] {
  return ['workspace', 'select', handle.split('/')[0] ?? '']
}

/** `cmux workspace close <workspace>` (per `cmux workspace --help`); closes the whole workspace. */
export function cmuxCloseArgv(handle: string): string[] {
  return ['workspace', 'close', handle.split('/')[0] ?? '']
}

export function cmuxReadScreenArgv(handle: string): string[] {
  return ['read-screen', ...targetFlags(handle)]
}

/**
 * Whether `text` would be typed as a key press rather than as text: a real
 * newline, or a backslash-n / -r / -t sequence, which `cmux send` turns into
 * Enter or Tab. cmux's `set-buffer` / `paste-buffer` exist, but whether a
 * paste is bracketed is not observable without the control socket, so such text
 * is refused rather than risking a partial prompt being submitted.
 */
export function cmuxTextIsUnsafe(text: string): boolean {
  return /[\r\n]|\\[nrt]/.test(text)
}

/**
 * Parses `cmux sessions list --json`: `{sessions: [{agent, cwd, workspace_id,
 * surface_id, ...}]}`. DOCS-ONLY field names (the store was empty when
 * observed; only the envelope was seen). Records are saved hook state, so a
 * match can be stale; a failed send then falls through to the next route.
 */
export function parseCmuxSessions(stdout: string, cwd: string): FoundSession[] {
  const want = realResolve(cwd)
  const parsed = parseJsonOrNull(stdout)
  const rows = isRecord(parsed) ? parsed['sessions'] : null
  if (!Array.isArray(rows)) return []
  const found: FoundSession[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const rowCwd = nonEmptyString(row['cwd']) ?? nonEmptyString(row['launch_cwd'])
    if (rowCwd === null || realResolve(rowCwd) !== want) continue
    const workspace = nonEmptyString(row['workspace_id'])
    if (workspace === null) continue
    const agent = row['agent']
    const surface = nonEmptyString(row['surface_id'])
    found.push({
      cwd,
      harness: harnessOrNull(agent),
      alive: true,
      lastOutputAt: null,
      handle: surface === null ? workspace : `${workspace}/${surface}`,
    })
  }
  return found
}

const MARKER_PREFIX = 'agent-seat:'

/** A listed workspace in `cwd` carrying an agent-seat marker. */
interface MarkedWorkspace {
  /** The workspace's `ref` and `id`, whichever are listed. */
  keys: string[]
  /** Whether the marker is the queried `sessionId`'s. */
  own: boolean
}

/** The workspaces in `cwd` whose `description`, `name` or `title` holds an agent-seat marker. DOCS-ONLY shape. */
function markedWorkspaces(stdout: string, cwd: string, sessionId: string): MarkedWorkspace[] {
  const want = realResolve(cwd)
  const marker = cmuxSessionMarker(sessionId)
  const parsed = parseJsonOrNull(stdout)
  const rows = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed['workspaces'] : null
  if (!Array.isArray(rows)) return []
  const found: MarkedWorkspace[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const rowCwd = nonEmptyString(row['cwd']) ?? nonEmptyString(row['current_directory'])
    if (rowCwd === null || realResolve(rowCwd) !== want) continue
    const text = ['description', 'name', 'title']
      .map((k) => nonEmptyString(row[k]) ?? '')
      .join('\n')
    if (!text.includes(MARKER_PREFIX)) continue
    const keys = [row['ref'], row['id']].flatMap((k) => nonEmptyString(k) ?? [])
    found.push({ keys, own: text.includes(marker) })
  }
  return found
}

/** Parses `cmux --json workspace list`: an array (or `{workspaces}`) of `{ref|id, cwd|current_directory}`. DOCS-ONLY shape. */
export function parseCmuxWorkspaces(stdout: string, cwd: string): FoundSession[] {
  const want = realResolve(cwd)
  const parsed = parseJsonOrNull(stdout)
  const rows = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed['workspaces'] : null
  if (!Array.isArray(rows)) return []
  const found: FoundSession[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const rowCwd = nonEmptyString(row['cwd']) ?? nonEmptyString(row['current_directory'])
    const ref = nonEmptyString(row['ref']) ?? nonEmptyString(row['id'])
    if (rowCwd === null || realResolve(rowCwd) !== want || ref === null) continue
    found.push({ cwd, harness: null, alive: true, lastOutputAt: null, handle: ref })
  }
  return found
}

/**
 * The cmux host: drives the cmux app through the `cmux` binary (see `opts.binary`).
 * darwin only. Keeps no state of its own; see the module doc for how a part picks its workspace.
 */
export function makeCmuxHost(opts: {
  /** The `cmux` binary to run; null makes the host unavailable and every part a no-op. Default: `cmux` on PATH. */
  binary?: string | null | undefined
  runner?: CommandRunner | undefined
  available?: (() => boolean) | undefined
}): Host {
  const bin = opts.binary === undefined ? 'cmux' : opts.binary
  return {
    name: 'cmux',
    platforms: ['darwin'],
    available() {
      if (opts.available !== undefined) return opts.available()
      if (opts.binary !== undefined) return opts.binary !== null
      return supportsPlatform(this) && onPath('cmux')
    },
    terminal(req) {
      if (bin === null) throw new Error('cmux binary is not configured')
      const runner = resolveRunner(bin, opts.runner)
      const res = runner.run(cmuxCreateArgv(req), { cwd: req.cwd, timeoutMs: 60_000 })
      if (!ran(res)) {
        throw new Error(`cmux workspace create failed: ${failureText(res)}`)
      }
      return 0
    },
    session: sessionViaTerminal,
    find(query: FindQuery): FoundSession[] {
      if (bin === null) return []
      const runner = resolveRunner(bin, opts.runner)
      const run = (argv: string[]) => quietRun(runner, argv, { cwd: query.cwd, timeoutMs: 10_000 })
      const stored = run(cmuxSessionsArgv(query.cwd))
      const fromStore = stored === null ? [] : parseCmuxSessions(stored, query.cwd)
      // The workspace list needs the socket; when it is denied the command exits nonzero and `run` returns null.
      let listed: string | null | undefined
      const list = () => (listed === undefined ? (listed = run(cmuxWorkspaceListArgv())) : listed)
      let rows = fromStore
      let others = new Set<string>()
      if (query.sessionId !== undefined) {
        const text = list()
        const marked = text === null ? [] : markedWorkspaces(text, query.cwd, query.sessionId)
        const inKeys = (f: FoundSession, own: boolean) =>
          marked.some((m) => m.own === own && m.keys.includes(f.handle?.split('/')[0] ?? ''))
        const own = fromStore.filter((f) => inKeys(f, true))
        if (own.length > 0) return own
        // A workspace opened for another session is never this one's fallback.
        others = new Set(marked.flatMap((m) => (m.own ? [] : m.keys)))
        rows = fromStore.filter((f) => !inKeys(f, false))
        const bound = marked.find((m) => m.own)
        if (bound !== undefined) {
          return bound.keys[0] === undefined
            ? []
            : [
                {
                  cwd: query.cwd,
                  harness: null,
                  alive: true,
                  lastOutputAt: null,
                  handle: bound.keys[0],
                },
              ]
        }
      }
      if (rows.length > 0) return rows
      const all = list()
      return all === null
        ? []
        : parseCmuxWorkspaces(all, query.cwd).filter((f) => !others.has(f.handle ?? ''))
    },
    send(req: SendRequest): SendReceipt {
      // No delivery confirmation exists, so ack is always false.
      if (cmuxTextIsUnsafe(req.text)) return { accepted: false, ack: false }
      try {
        // Only a workspace whose saved session names an agent: one found by cwd alone
        // (the workspace-list fallback) may be a shell the agent has exited, and the
        // pointer would run as a command. With `req.harness`, only that harness's row, and
        // only when exactly one row is left: any pick among several could reach another session.
        const agents = this.find!({ cwd: req.cwd, sessionId: req.sessionId }).filter(
          (s) => s.harness !== null && (req.harness === undefined || s.harness === req.harness),
        )
        const handle = agents.length === 1 ? agents[0]?.handle : undefined
        if (handle === undefined || handle === null) return { accepted: false, ack: false }
        const runner = resolveRunner(bin!, opts.runner)
        const typed = runner.run(cmuxSendArgv(handle, req.text), {
          cwd: req.cwd,
          timeoutMs: 15_000,
        })
        if (!ran(typed)) return { accepted: false, ack: false }
        const enter = runner.run(cmuxSendEnterArgv(handle), { cwd: req.cwd, timeoutMs: 15_000 })
        // The text is already in the input box if Enter failed; retyping would double it.
        return ran(enter)
          ? { accepted: true, ack: false }
          : { accepted: true, ack: false, uncertain: true }
      } catch {
        return { accepted: false, ack: false }
      }
    },
    focus(query: FindQuery): boolean {
      try {
        const handle = this.find!(query)[0]?.handle
        if (handle === undefined || handle === null) return false
        const runner = resolveRunner(bin!, opts.runner)
        return ran(runner.run(cmuxFocusArgv(handle), { cwd: query.cwd, timeoutMs: 10_000 }))
      } catch {
        return false
      }
    },
    capture(query: FindQuery): string | null {
      try {
        const handle = this.find!(query)[0]?.handle
        if (handle === undefined || handle === null) return null
        const runner = resolveRunner(bin!, opts.runner)
        return quietRun(runner, cmuxReadScreenArgv(handle), { cwd: query.cwd, timeoutMs: 10_000 })
      } catch {
        return null
      }
    },
    close(query: FindQuery): boolean {
      try {
        // Only a workspace whose saved session names an agent, as in `send`: one found by
        // cwd alone (the workspace-list fallback) may be one the person opened. Close only
        // when exactly one such workspace is left: with several, any pick could close another session's.
        const workspaces = new Set(
          this.find!(query).flatMap((s) =>
            s.harness !== null && s.handle ? [s.handle.split('/')[0]] : [],
          ),
        )
        const [workspace] = [...workspaces]
        if (workspaces.size !== 1 || workspace === undefined) return false
        return (
          quietRun(resolveRunner(bin!, opts.runner), cmuxCloseArgv(workspace), {
            cwd: query.cwd,
            timeoutMs: 10_000,
          }) !== null
        )
      } catch {
        return false
      }
    },
  }
}
