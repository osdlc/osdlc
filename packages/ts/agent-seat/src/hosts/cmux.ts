/**
 * cmux: a new workspace on `cwd` whose first terminal runs a command, plus
 * send/find/focus/capture. Research: `docs/planning/research/cmux.md`
 * (cmux 0.64.17).
 *
 * `workspace create` is the canonical spelling; `new-workspace` is the legacy
 * alias and prints a deprecation notice on every call.
 *
 * cmux cannot bind a pane to a caller session id: `workspace create` has no
 * tag the list commands read back (the shapes are docs-only), so every part
 * resolves by `cwd` and ignores `sessionId`. `close` therefore acts only when
 * exactly one workspace is at the cwd.
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
import { isRecord, nonEmptyString, parseJsonOrNull, realResolve } from '../util.ts'

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
import { harnessOrNull, sessionViaTerminal } from '../harness.ts'

/** Argv for `cmux workspace create` — pure, so a test can pin it. */
export function cmuxCreateArgv(req: CommandRequest): string[] {
  return [
    'workspace',
    'create',
    '--name',
    req.title,
    '--cwd',
    req.cwd,
    '--command',
    commandString(req.argv),
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
  return ['workspace', 'select', targetFlags(handle)[1] ?? '']
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
 * The cmux host: drives the cmux app through the `cmux` binary, which must be on PATH.
 * darwin only. Keeps no state of its own; every part resolves by `cwd`.
 */
export function makeCmuxHost(opts: {
  runner?: CommandRunner | undefined
  available?: (() => boolean) | undefined
}): Host {
  return {
    name: 'cmux',
    platforms: ['darwin'],
    available() {
      if (opts.available !== undefined) return opts.available()
      return supportsPlatform(this) && onPath('cmux')
    },
    terminal(req) {
      const runner = resolveRunner('cmux', opts.runner)
      const res = runner.run(cmuxCreateArgv(req), { cwd: req.cwd, timeoutMs: 60_000 })
      if (!ran(res)) {
        throw new Error(`cmux workspace create failed: ${failureText(res)}`)
      }
      return 0
    },
    session: sessionViaTerminal,
    find(query: FindQuery): FoundSession[] {
      const runner = resolveRunner('cmux', opts.runner)
      const run = (argv: string[]) => quietRun(runner, argv, { cwd: query.cwd, timeoutMs: 10_000 })
      const stored = run(cmuxSessionsArgv(query.cwd))
      const fromStore = stored === null ? [] : parseCmuxSessions(stored, query.cwd)
      if (fromStore.length > 0) return fromStore
      // The workspace list needs the socket; when it is denied the command exits nonzero and `run` returns null.
      const listed = run(cmuxWorkspaceListArgv())
      return listed === null ? [] : parseCmuxWorkspaces(listed, query.cwd)
    },
    send(req: SendRequest): SendReceipt {
      // No delivery confirmation exists, so ack is always false.
      if (cmuxTextIsUnsafe(req.text)) return { accepted: false, ack: false }
      try {
        // Only a workspace whose saved session names an agent: one found by cwd alone
        // (the workspace-list fallback) may be a shell the agent has exited, and the
        // pointer would run as a command. With `req.harness`, only that harness's row, and
        // only when exactly one row is left: any pick among several could reach another session.
        const agents = this.find!({ cwd: req.cwd }).filter(
          (s) => s.harness !== null && (req.harness === undefined || s.harness === req.harness),
        )
        const handle = agents.length === 1 ? agents[0]?.handle : undefined
        if (handle === undefined || handle === null) return { accepted: false, ack: false }
        const runner = resolveRunner('cmux', opts.runner)
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
        const runner = resolveRunner('cmux', opts.runner)
        return ran(runner.run(cmuxFocusArgv(handle), { cwd: query.cwd, timeoutMs: 10_000 }))
      } catch {
        return false
      }
    },
    capture(query: FindQuery): string | null {
      try {
        const handle = this.find!(query)[0]?.handle
        if (handle === undefined || handle === null) return null
        const runner = resolveRunner('cmux', opts.runner)
        return quietRun(runner, cmuxReadScreenArgv(handle), { cwd: query.cwd, timeoutMs: 10_000 })
      } catch {
        return null
      }
    },
    close(query: FindQuery): boolean {
      try {
        // No session id can be matched here, so close only when the cwd names one workspace:
        // with several, any pick could close another session's.
        const workspaces = new Set(
          this.find!(query).flatMap((s) => (s.handle ? [s.handle.split('/')[0]] : [])),
        )
        const [workspace] = [...workspaces]
        if (workspaces.size !== 1 || workspace === undefined) return false
        return (
          quietRun(resolveRunner('cmux', opts.runner), cmuxCloseArgv(workspace), {
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
