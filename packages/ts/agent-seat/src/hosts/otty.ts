/**
 * Otty (darwin only): a tab on `cwd` running a command, found again by a tag
 * in its title: derived from the caller's session id when the launch has one, else
 * from `cwd`. Research: `docs/planning/research/otty.md`
 * (otty 1.5.4; the app was not running, so every JSON shape here is DOCS-ONLY:
 * `--help` names the flags but `pane list --json` output was never observed).
 *
 * Otty's control CLI needs the running app; without it every command exits
 * nonzero with "Cannot connect to Otty ... Is Otty running?" (observed). So
 * send/find/focus/capture treat any nonzero exit as "no session" and never throw.
 *
 * `--help` does not show whether `pane list` carries a cwd, so a pane matches when a
 * cwd-like field equals `cwd` OR any string field contains {@link ottyTag}, which
 * `terminal()` appends to the tab title. A request with a session id matches by the
 * id's tag alone (or, for a tab opened before ids were tagged, the cwd's tag), never by
 * a bare cwd field: that would reach another session's pane in the same directory. Whether `pane list` exposes the title is also
 * unverified (`docs/planning/research/otty.md`). `send` goes only to a pane carrying the tag (one this host
 * opened) AND showing an agent in the foreground: the tag stays in the tab title
 * after the agent exits, and the tab then holds a plain shell, where the pointer
 * would run as a command. A pane that does not name its foreground process is
 * therefore never sent to and `find` reports it not alive, so a caller falls
 * back to another route.
 */

import {
  commandString,
  failureText,
  ran,
  resolveRunner,
  type CommandRunner,
} from '@osdlc/command-seam'
import { BUILTIN_HARNESSES, HARNESS_ALIASES } from '@osdlc/detect-harness'
import { isRecord, parseJsonOrNull, sessionIdSlug, shortHash } from '../util.ts'

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
import { sessionViaTerminal } from '../harness.ts'

/**
 * A tag appended to the tab title so a later `find` can match it: stable for the
 * caller's session id when there is one (`[sd-i-<slug>]`, {@link sessionIdSlug}: the id's first
 * 12 characters, rewritten to `[A-Za-z0-9_-]`, and 8 hex digits of a hash of the whole id, so
 * ids sharing a prefix get different tags), else for `cwd` (`[sd-<hash>]`).
 */
export function ottyTag(cwd: string, sessionId?: string): string {
  if (sessionId !== undefined) return `[sd-i-${sessionIdSlug(sessionId)}]`
  return `[sd-${shortHash(cwd, 12)}]`
}

/** Argv for `otty tab new` — pure, so a test can pin it. */
export function ottyCreateArgv(req: CommandRequest): string[] {
  return [
    'tab',
    'new',
    '--cwd',
    req.cwd,
    '--command',
    commandString(req.argv),
    '--title',
    `${req.title} ${ottyTag(req.cwd, req.sessionId)}`,
    '--no-focus',
    '--json',
  ]
}

export function ottyListArgv(): string[] {
  return ['pane', 'list', '--json']
}

/**
 * Argv for `otty pane send-keys`: the text pasted bracketed (so embedded
 * newlines are not Enters), then a separate `key:Enter` part. `--` keeps a
 * `-`-prefixed text from being read as a flag.
 */
export function ottySendArgv(paneId: string, text: string): string[] {
  return ['pane', 'send-keys', '--pane', paneId, '--bracketed-paste', '--', text, 'key:Enter']
}

export function ottyFocusArgv(paneId: string): string[] {
  return ['pane', 'focus', paneId]
}

export function ottyCaptureArgv(paneId: string): string[] {
  return ['pane', 'capture', '--pane', paneId]
}

/**
 * Argv for `otty pane close`; `--yes` skips the destructive-action prompt (the global
 * flag of `otty pane close --help`). Closing a tab's last pane closes the tab.
 */
export function ottyCloseArgv(paneId: string): string[] {
  return ['pane', 'close', '--pane', paneId, '--yes']
}

const CWD_KEYS = ['cwd', 'working_directory', 'current_directory']
/** Pane fields that may name the foreground process (DOCS-ONLY guesses, like the rest). */
const PROCESS_KEYS = ['foreground_process', 'process', 'running_command', 'command', 'agent']
/** Executable names that mean an agent is running: each built-in harness id and alias (`cursor-agent`, `agy`). */
const AGENT_BINS: ReadonlySet<string> = new Set([
  ...BUILTIN_HARNESSES,
  ...Object.keys(HARNESS_ALIASES),
])

/** Whether the pane entry names a known agent as its foreground process. */
function showsAgent(entry: Record<string, unknown>): boolean {
  return PROCESS_KEYS.some((k) => {
    const v = entry[k]
    if (typeof v !== 'string') return false
    const bin = v.trim().split(/\s+/)[0]?.split(/[\\/]/).pop() ?? ''
    return AGENT_BINS.has(bin)
  })
}

/**
 * The pane ids in `otty pane list --json` that belong to `cwd`: a bare array
 * or `{panes: [...]}` of objects with an `id` (or `pane_id`). Unparseable
 * output is `[]`. Field names are DOCS-ONLY guesses; see the module doc.
 * `taggedOnly` drops the panes matched by a cwd field alone; `agentOnly` keeps
 * only panes whose foreground process is a known agent.
 */
export function parseOttyPanes(
  stdout: string,
  cwd: string,
  opts: {
    taggedOnly?: boolean
    agentOnly?: boolean
    sessionId?: string | undefined
    /** With a session id, only its own tab: never the cwd-tagged fallback. */
    idOnly?: boolean
  } = {},
): string[] {
  const parsed = parseJsonOrNull(stdout)
  const entries = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed['panes'] : null
  if (!Array.isArray(entries)) return []
  const cwdTag = ottyTag(cwd)
  const idTag = opts.sessionId === undefined ? null : ottyTag(cwd, opts.sessionId)
  const byIdTag: string[] = []
  const byCwdTag: string[] = []
  const byBareCwd: string[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const id = entry['id'] ?? entry['pane_id']
    if (typeof id !== 'string' && typeof id !== 'number') continue
    if (opts.agentOnly === true && !showsAgent(entry)) continue
    const tagged = (tag: string) =>
      Object.values(entry).some((v) => typeof v === 'string' && v.includes(tag))
    if (idTag !== null && tagged(idTag)) byIdTag.push(String(id))
    else if (tagged(cwdTag)) byCwdTag.push(String(id))
    else if (CWD_KEYS.some((k) => entry[k] === cwd)) byBareCwd.push(String(id))
  }
  // With a session id: its own tab, else (a tab opened before ids were tagged) the cwd's tag.
  // A bare cwd field never counts there: it could be another session's tab or a plain shell.
  if (idTag !== null) return byIdTag.length > 0 || opts.idOnly === true ? byIdTag : byCwdTag
  return opts.taggedOnly === true ? byCwdTag : [...byCwdTag, ...byBareCwd]
}

/**
 * The Otty host: opens tabs in the Otty app through the `otty` binary, which must be on PATH; the app must be running.
 * darwin only. Keeps no state of its own; tabs are found again by a tag in their title.
 */
export function makeOttyHost(
  opts: {
    runner?: CommandRunner | undefined
    available?: (() => boolean) | undefined
  } = {},
): Host {
  const runner = () => resolveRunner('otty', opts.runner)
  /** `pane list --json` output for `cwd`, or null (also when the app is not running). */
  const listOutput = (cwd: string): string | null =>
    quietRun(runner(), ottyListArgv(), { cwd, timeoutMs: 10_000 })
  /** The first pane for the request (tagged ones only when `taggedOnly`), or null. */
  const resolvePane = (
    target: FindQuery,
    pick: { taggedOnly?: boolean; agentOnly?: boolean; idOnly?: boolean } = {},
  ): string | null => {
    const out = listOutput(target.cwd)
    return out === null
      ? null
      : (parseOttyPanes(out, target.cwd, { ...pick, sessionId: target.sessionId })[0] ?? null)
  }
  return {
    name: 'otty',
    platforms: ['darwin'],
    available() {
      if (opts.available !== undefined) return opts.available()
      return supportsPlatform(this) && onPath('otty')
    },
    terminal(req) {
      const res = runner().run(ottyCreateArgv(req), { cwd: req.cwd, timeoutMs: 60_000 })
      if (!ran(res)) throw new Error(`otty tab new failed: ${failureText(res)}`)
      return 0
    },
    session: sessionViaTerminal,
    send(req: SendRequest): SendReceipt {
      // Otty has no delivery confirmation, so ack is always false.
      try {
        const pane = resolvePane(req, { taggedOnly: true, agentOnly: true })
        if (pane === null) return { accepted: false, ack: false }
        const res = runner().run(ottySendArgv(pane, req.text), { cwd: req.cwd, timeoutMs: 15_000 })
        return { accepted: ran(res), ack: false }
      } catch {
        return { accepted: false, ack: false }
      }
    },
    find(query: FindQuery): FoundSession[] {
      const out = listOutput(query.cwd)
      if (out === null) return []
      const pick = { sessionId: query.sessionId }
      // No harness identity and no output-recency signal are documented. A pane
      // is alive only while it shows an agent in the foreground: the tab outlives
      // the agent, as a shell. The agent pane is returned when there is one, so
      // `alive` describes the pane whose handle is returned.
      const agentPane = parseOttyPanes(out, query.cwd, { ...pick, agentOnly: true })[0]
      const pane = agentPane ?? parseOttyPanes(out, query.cwd, pick)[0]
      if (pane === undefined) return []
      return [
        {
          cwd: query.cwd,
          harness: null,
          alive: agentPane !== undefined,
          lastOutputAt: null,
          handle: pane,
        },
      ]
    },
    focus(query: FindQuery): boolean {
      const pane = resolvePane(query)
      if (pane === null) return false
      return quietRun(runner(), ottyFocusArgv(pane), { cwd: query.cwd, timeoutMs: 10_000 }) !== null
    },
    capture(query: FindQuery): string | null {
      const pane = resolvePane(query)
      if (pane === null) return null
      return quietRun(runner(), ottyCaptureArgv(pane), { cwd: query.cwd, timeoutMs: 10_000 })
    },
    close(query: FindQuery): boolean {
      // Closing is destructive: with a session id only that session's own tab closes. The
      // cwd-tagged tab may belong to another launch at the same cwd that carried no id.
      // Without an id, every id-less launch at the cwd carries the same tag, so close only
      // when exactly one tab does: any pick among several could close another session's.
      const out = listOutput(query.cwd)
      if (out === null) return false
      const panes = parseOttyPanes(out, query.cwd, {
        taggedOnly: true,
        idOnly: true,
        sessionId: query.sessionId,
      })
      const pane = query.sessionId !== undefined || panes.length === 1 ? panes[0] : undefined
      if (pane === undefined) return false
      return quietRun(runner(), ottyCloseArgv(pane), { cwd: query.cwd, timeoutMs: 10_000 }) !== null
    },
  }
}
