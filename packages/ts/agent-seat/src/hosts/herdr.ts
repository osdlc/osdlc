/**
 * herdr: a workspace on `cwd` running a command in its root pane, found again
 * by listing panes and matching their cwd. Behaviour follows
 * `docs/planning/research/herdr.md` (herdr 0.9.3, driven live).
 *
 * herdr is a server (a unix socket per named session) that the `herdr` CLI
 * talks to. This host never starts one: with no server, `session`/`terminal`
 * throw a clear error and `send`/`find`/`focus`/`capture` report "nothing
 * there". herdr itself honours `HERDR_SESSION`; `opts.session` is the explicit
 * equivalent (`--session <name>` ahead of every subcommand).
 *
 * Every id is opaque and read from a JSON response, never derived: workspace
 * `w1`, tab `w1:t1`, pane `w1:p1`. A session launched with a caller session id has
 * its root pane id remembered (`./session-panes.ts`) and later requests for it
 * target that pane if herdr still lists it; otherwise `cwd` becomes a pane at call
 * time, as in `./tmux.ts` and `./orca.ts`.
 */

import {
  commandString,
  failureText,
  ran,
  resolveRunner,
  type CommandResult,
  type CommandRunner,
} from '@osdlc/command-seam'
import { isRecord, parseJsonOrNull, realResolve, strOrNull } from '../util.ts'

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
import { recallSessionPane, rememberSessionPane, type RememberedPane } from './session-panes.ts'
import { registryDirOf, type HostStateOptions } from './registry.ts'

/** Milliseconds `agent prompt --wait` may wait for the agent to react. */
const HERDR_PROMPT_TIMEOUT_MS = 30_000

/** Lines of recent output `capture` asks for. */
const HERDR_CAPTURE_LINES = 200

/** One pane of `herdr pane list`, reduced to what the host reads. */
export interface HerdrPane {
  paneId: string
  tabId: string
  workspaceId: string
  cwd: string
  foregroundCwd: string
  /** Agent kind herdr recognised in the pane (`claude`, `codex`, ...), or null for a plain shell. */
  agent: string | null
  agentStatus: string | null
}

function sessionPrefix(session: string | undefined): string[] {
  return session === undefined ? [] : ['--session', session]
}

/** Argv for `herdr workspace create` — pure, so a test can pin it. `--no-focus` keeps the person's own pane in front. */
export function herdrWorkspaceCreateArgv(req: CommandRequest, session?: string): string[] {
  return [
    ...sessionPrefix(session),
    'workspace',
    'create',
    '--cwd',
    req.cwd,
    '--label',
    req.title,
    '--no-focus',
  ]
}

/** Argv for `herdr pane run <pane> <command>`, which sends the text and Enter in one call. */
export function herdrPaneRunArgv(paneId: string, argv: string[], session?: string): string[] {
  return [...sessionPrefix(session), 'pane', 'run', paneId, commandString(argv)]
}

export function herdrPaneListArgv(session?: string): string[] {
  return [...sessionPrefix(session), 'pane', 'list']
}

/**
 * Argv for `herdr agent prompt`. `--wait --until working --until blocked`
 * returns as soon as the agent reacts (about half a second against a live
 * claude) instead of waiting for the whole turn to settle, which is the
 * default and can take minutes. Do not put `--` before `text`: herdr treats it
 * as literal text. Limitation of `send`: `text` is a bare positional argument, so a `text`
 * starting with `-` is read by herdr as a flag rather than sent.
 */
export function herdrAgentPromptArgv(paneId: string, text: string, session?: string): string[] {
  return [
    ...sessionPrefix(session),
    'agent',
    'prompt',
    paneId,
    text,
    '--wait',
    '--until',
    'working',
    '--until',
    'blocked',
    '--timeout',
    String(HERDR_PROMPT_TIMEOUT_MS),
  ]
}

export function herdrWorkspaceFocusArgv(workspaceId: string, session?: string): string[] {
  return [...sessionPrefix(session), 'workspace', 'focus', workspaceId]
}

export function herdrTabFocusArgv(tabId: string, session?: string): string[] {
  return [...sessionPrefix(session), 'tab', 'focus', tabId]
}

/** `herdr pane close <pane_id>` (per `herdr pane close --help`): closes the pane and what runs in it. */
export function herdrPaneCloseArgv(paneId: string, session?: string): string[] {
  return [...sessionPrefix(session), 'pane', 'close', paneId]
}

export function herdrPaneReadArgv(paneId: string, session?: string): string[] {
  return [...sessionPrefix(session), 'pane', 'read', paneId, '--lines', String(HERDR_CAPTURE_LINES)]
}

/** The `error.code` of a failed herdr CLI call; errors arrive as JSON on stderr (and, on some paths, stdout). */
export function herdrErrorCode(res: Pick<CommandResult, 'stdout' | 'stderr'>): string | null {
  for (const text of [res.stderr, res.stdout]) {
    const parsed = parseJsonOrNull(text)
    const error = isRecord(parsed) ? parsed['error'] : null
    if (isRecord(error) && typeof error['code'] === 'string') return error['code']
  }
  return null
}

/** Parses `herdr pane list`: `result.panes`. Unparseable output is `[]`. */
export function parseHerdrPanes(stdout: string): HerdrPane[] {
  const parsed = parseJsonOrNull(stdout)
  const result = isRecord(parsed) ? parsed['result'] : null
  const panes = isRecord(result) ? result['panes'] : null
  if (!Array.isArray(panes)) return []
  const out: HerdrPane[] = []
  for (const pane of panes) {
    if (!isRecord(pane)) continue
    const paneId = strOrNull(pane['pane_id'])
    const tabId = strOrNull(pane['tab_id'])
    const workspaceId = strOrNull(pane['workspace_id'])
    const cwd = strOrNull(pane['cwd'])
    if (paneId === null || tabId === null || workspaceId === null || cwd === null) continue
    out.push({
      paneId,
      tabId,
      workspaceId,
      cwd,
      foregroundCwd: strOrNull(pane['foreground_cwd']) ?? cwd,
      agent: strOrNull(pane['agent']),
      agentStatus: strOrNull(pane['agent_status']),
    })
  }
  return out
}

/** The root pane id of `herdr workspace create`: `result.root_pane.pane_id`. */
export function parseHerdrRootPane(stdout: string): string | null {
  const parsed = parseJsonOrNull(stdout)
  const result = isRecord(parsed) ? parsed['result'] : null
  const root = isRecord(result) ? result['root_pane'] : null
  return isRecord(root) ? strOrNull(root['pane_id']) : null
}

/** herdr reports the resolved path (`/private/tmp/...` for `/tmp/...`), so compare real paths. */
function samePath(a: string, b: string): boolean {
  return realResolve(a) === realResolve(b)
}

/**
 * Panes whose cwd (or foreground process's cwd) is `cwd`, agent panes first so
 * a send never prefers a plain shell beside a live agent.
 */
export function herdrPanesAt(panes: HerdrPane[], cwd: string): HerdrPane[] {
  const here = panes.filter((p) => samePath(p.cwd, cwd) || samePath(p.foregroundCwd, cwd))
  return [...here.filter((p) => p.agent !== null), ...here.filter((p) => p.agent === null)]
}

/**
 * Turns an `agent prompt` result into a receipt. Exit 0: herdr saw the agent react, so
 * `ack`. `timeout` and `agent_prompt_stalled` do not prove non-delivery, so they are
 * `uncertain`. Every other error, including `agent_blocked`, means nothing was written.
 */
export function herdrPromptReceipt(res: CommandResult): SendReceipt {
  if (ran(res)) return { accepted: true, ack: true }
  const code = herdrErrorCode(res)
  if (code === 'timeout' || code === 'agent_prompt_stalled') {
    return { accepted: true, ack: false, uncertain: true }
  }
  return { accepted: false, ack: false }
}

/**
 * The herdr host: drives panes in herdr through the `herdr` binary, which must be on PATH.
 * darwin and linux. Remembers the root pane id of each session under `runtimeDir`/`registryDir` ({@link HostStateOptions}).
 */
export function makeHerdrHost(
  opts: {
    runner?: CommandRunner | undefined
    available?: (() => boolean) | undefined
    /** A named herdr session; defaults to herdr's own choice (`HERDR_SESSION`, else the default session). */
    session?: string | undefined
  } & HostStateOptions,
): Host {
  const runner = (): CommandRunner => resolveRunner('herdr', opts.runner)
  const registryDir = registryDirOf('herdr', opts)

  /** The pane remembered for the request's session id, or null. */
  const recall = (target: FindQuery): RememberedPane | null =>
    target.sessionId === undefined ? null : recallSessionPane(registryDir, target.sessionId)

  /**
   * The panes a request addresses: the pane remembered for its session id if herdr still
   * lists it at the cwd it was opened in (as the pane's or its foreground process's cwd) and
   * none otherwise, else the panes at its cwd. herdr reissues ids after a restart, so the
   * same id at another cwd is not the pane this session opened. `bound` is the remembered
   * pane when the caller already read it.
   */
  const livePanes = (target: FindQuery, bound = recall(target)): HerdrPane[] => {
    const out = quietRun(runner(), herdrPaneListArgv(opts.session), {
      cwd: target.cwd,
      timeoutMs: 10_000,
    })
    if (out === null) return []
    const panes = parseHerdrPanes(out)
    return bound === null
      ? herdrPanesAt(panes, target.cwd)
      : panes.filter(
          (p) =>
            p.paneId === bound.pane &&
            (samePath(p.cwd, bound.cwd) || samePath(p.foregroundCwd, bound.cwd)),
        )
  }

  return {
    name: 'herdr',
    acksSend: true,
    platforms: ['darwin', 'linux'],
    available() {
      if (opts.available !== undefined) return opts.available()
      return supportsPlatform(this) && onPath('herdr')
    },
    terminal(req) {
      const create = runner().run(herdrWorkspaceCreateArgv(req, opts.session), {
        cwd: req.cwd,
        timeoutMs: 60_000,
      })
      if (!ran(create)) {
        if (herdrErrorCode(create) === 'server_not_running') {
          throw new Error('herdr server is not running — start herdr first')
        }
        throw new Error(`herdr workspace create failed: ${failureText(create)}`)
      }
      const paneId = parseHerdrRootPane(create.stdout)
      if (paneId === null) {
        throw new Error(`herdr workspace create returned no root pane: ${create.stdout.trim()}`)
      }
      const run = runner().run(herdrPaneRunArgv(paneId, req.argv, opts.session), {
        cwd: req.cwd,
        timeoutMs: 60_000,
      })
      if (!ran(run)) throw new Error(`herdr pane run failed: ${failureText(run)}`)
      if (req.sessionId !== undefined)
        rememberSessionPane(registryDir, req.sessionId, paneId, req.cwd)
      return 0
    },
    session: sessionViaTerminal,
    send(req: SendRequest): SendReceipt {
      try {
        // Only a pane herdr recognises as an agent receives text. A plain shell
        // (or an agent still starting) would run the message as a command, so
        // it is refused and the caller moves on to its next route. By cwd,
        // with `req.harness`, only that harness's pane, and only when exactly
        // one pane is left: any pick among several could reach another
        // session. A bound pane is this session's own, so its agent name is
        // not checked (herdr may report one that is no builtin harness).
        const bound = recall(req)
        const targets = livePanes(req, bound).filter(
          (p) =>
            p.agent !== null &&
            (bound !== null || req.harness === undefined || harnessOrNull(p.agent) === req.harness),
        )
        const target = targets.length === 1 ? targets[0] : undefined
        if (target === undefined) return { accepted: false, ack: false }
        const res = runner().run(herdrAgentPromptArgv(target.paneId, req.text, opts.session), {
          cwd: req.cwd,
          timeoutMs: HERDR_PROMPT_TIMEOUT_MS + 10_000,
        })
        return herdrPromptReceipt(res)
      } catch {
        return { accepted: false, ack: false }
      }
    },
    find(query: FindQuery): FoundSession[] {
      return livePanes(query).map((p) => ({
        cwd: query.cwd,
        harness: harnessOrNull(p.agent),
        alive: p.agent !== null,
        lastOutputAt: null,
        handle: p.paneId,
      }))
    },
    focus(query: FindQuery): boolean {
      try {
        const target = livePanes(query)[0]
        if (target === undefined) return false
        const run = { cwd: query.cwd, timeoutMs: 10_000 }
        const ws = runner().run(herdrWorkspaceFocusArgv(target.workspaceId, opts.session), run)
        if (!ran(ws)) return false
        return ran(runner().run(herdrTabFocusArgv(target.tabId, opts.session), run))
      } catch {
        return false
      }
    },
    capture(query: FindQuery): string | null {
      const target = livePanes(query)[0]
      if (target === undefined) return null
      return quietRun(runner(), herdrPaneReadArgv(target.paneId, opts.session), {
        cwd: query.cwd,
        timeoutMs: 10_000,
      })
    },
    close(query: FindQuery): boolean {
      try {
        // Closing is destructive: a session whose pane was never remembered is left open
        // rather than closing whichever pane is first at its cwd. `livePanes` drops a
        // remembered id that now sits at another cwd (herdr reissued it). Without a session
        // id, close only when exactly one pane at the cwd runs an agent: the first pane
        // there may be a person's own shell, and any pick among several agents could close
        // another session's.
        let target: HerdrPane | undefined
        if (query.sessionId === undefined) {
          const agents = livePanes(query).filter((p) => p.agent !== null)
          target = agents.length === 1 ? agents[0] : undefined
        } else {
          const bound = recall(query)
          if (bound === null) return false
          target = livePanes(query, bound)[0]
        }
        if (target === undefined) return false
        return (
          runner().run(herdrPaneCloseArgv(target.paneId, opts.session), {
            cwd: query.cwd,
            timeoutMs: 10_000,
          }).exitCode === 0
        )
      } catch {
        return false
      }
    },
  }
}
