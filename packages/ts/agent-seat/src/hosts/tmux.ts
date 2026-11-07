/**
 * tmux: a detached session on `cwd` running a command, found again by a name
 * bound to the caller's session id; see `docs/planning/research/tmux.md`.
 *
 * Unlike orca/cmux, tmux has no app-level worktree registry and no `--name`
 * the caller supplies — a session name is chosen here, once, and must be
 * unique server-wide. A launch carries the caller's session id
 * (`CommandRequest.sessionId`), so the name is derived from it
 * ({@link tmuxIdSessionName}) and two sessions in one worktree get two tmux
 * sessions. `send`/`find`/`focus`/`capture`/`close` take the same id and
 * target that name; a request without an id (or a session opened before this
 * binding existed) falls back to the name derived from `cwd`
 * ({@link tmuxSessionName}).
 */

import { createHash } from 'node:crypto'

import { failureText, ran, resolveRunner, shellJoin, type CommandRunner } from '@osdlc/command-seam'
import { sleepSync } from '../util.ts'

import type {
  CommandRequest,
  FindQuery,
  FoundSession,
  Host,
  SendReceipt,
  SendRequest,
} from '../contract.ts'
import { onPath, quietRun, supportsPlatform, WAIT_TIMEOUT_EXIT } from '../contract.ts'
import { sessionViaTerminal } from '../harness.ts'
import { sessionIdSlug } from './session-panes.ts'

/**
 * The cwd-derived tmux session name: stable across repeated calls with the same
 * `cwd`, and the name every session had before addressing by id. tmux session
 * names must be unique server-wide and match `[A-Za-z0-9_-]` —
 * `docs/planning/research/tmux.md`'s "Naming rules" verified that `.`/`:` are
 * silently rewritten to `_`, which can then cause a LATER create to fail with
 * `duplicate session` against the rewritten name instead of the one actually
 * requested. Hashing `cwd` sidesteps that class of surprise entirely rather
 * than trying to sanitize an arbitrary path into the safe character set.
 *
 * Used for a request with no session id and as the fallback for a session
 * opened before names were bound to ids. Two launches WITHOUT an id for the
 * SAME `cwd` still collide — the second `tmux new-session` fails with its own
 * real "duplicate session" error, surfaced verbatim below.
 *
 * @experimental an `attach` part is planned to replace the tmux-specific attach helpers.
 */
export function tmuxSessionName(cwd: string): string {
  return `sd-${createHash('sha256').update(cwd).digest('hex').slice(0, 12)}`
}

/**
 * The tmux session name bound to a caller session id: `sd-` and {@link sessionIdSlug}, the
 * id's first 12 characters with anything outside `[A-Za-z0-9_-]` rewritten to `_` (so tmux
 * never rewrites it for us), then `-` and 8 hex digits of the sha256 of the whole id. The hash
 * keeps apart ids that share their first 12 characters (`build-step-001`, `build-step-002`) or
 * differ only in a rewritten character (`a.b`, `a_b`). The name was once the 12 characters
 * alone; a session opened under that name is not found by id.
 *
 * The single source of the name: an attach must call this rather than rebuild it.
 *
 * @experimental an `attach` part is planned to replace the tmux-specific attach helpers.
 */
export function tmuxIdSessionName(sessionId: string): string {
  return `sd-${sessionIdSlug(sessionId)}`
}

/**
 * The name of a visible run's session: `sd-` and the run id (anything outside `[A-Za-z0-9_-]`
 * rewritten to `_`), then, when there is a caller session id (a run's several agent steps each
 * get a session), `-` and the same id part as {@link tmuxIdSessionName}. A person finds it by
 * the run id (`tmux ls`).
 */
export function tmuxRunSessionName(runId: string, sessionId?: string): string {
  const run = runId.replace(/[^A-Za-z0-9_-]/g, '_')
  return `sd-${run}${sessionId === undefined ? '' : `-${sessionIdSlug(sessionId)}`}`
}

/** Where a request points: a waiting run's name, else its session id's name when it has an id, else the cwd's. */
function requestedName(target: Pick<CommandRequest, 'cwd' | 'sessionId' | 'wait'>): string {
  if (target.wait?.runId !== undefined)
    return tmuxRunSessionName(target.wait.runId, target.sessionId)
  return target.sessionId === undefined
    ? tmuxSessionName(target.cwd)
    : tmuxIdSessionName(target.sessionId)
}

/**
 * A `-t` target that names session `name` exactly. A bare name also matches a session whose name
 * starts with it (tmux tries the exact name, then a prefix, then a pattern), so `sd-s1` would
 * reach `sd-s10` once `sd-s1` has ended.
 */
function sessionTarget(name: string): string {
  return `=${name}`
}

/** A `-t` target for the active pane of the session named exactly `name` (see {@link sessionTarget}). */
function paneTarget(name: string): string {
  return `=${name}:`
}

/**
 * The command a session runs, as tmux arguments. tmux splits its command line on any argument
 * that ends in `;`, even after `--`, and escaping it as `\;` corrupts an argument that already
 * ends in `\;`. So when an argument ends in `;`, the whole command goes as one shell string,
 * `exec <quoted argv>`, which tmux runs with its shell and which ends in a quote.
 */
function sessionCommand(argv: readonly string[]): string[] {
  return argv.some((a) => a.endsWith(';')) ? [`exec ${shellJoin([...argv])}`] : [...argv]
}

/**
 * Argv for `tmux new-session` — pure, so a test can pin it. `-d` (detached)
 * is what makes this hands-off, the same category as orca/cmux's own managed
 * window: `new-session` returns almost immediately once the session exists,
 * long before whatever it runs finishes. `--` terminates tmux's own option
 * parsing before `req.argv` (the harness's argv, possibly under an `env` prefix —
 * see `wrapperSession` in `../harness.ts`) starts, the same guard `harnessArgv` itself applies one
 * level down for the harness binary's own flags.
 */
export function tmuxCreateArgv(req: CommandRequest): string[] {
  const create = [
    'new-session',
    '-d',
    '-s',
    requestedName(req),
    '-c',
    req.cwd,
    '--',
    ...sessionCommand(req.argv),
  ]
  if (req.wait === undefined) return create
  // A waiting launch keeps the dead pane so its exit status can be read. The option is set in the
  // SAME tmux invocation (`;` chains commands), so a process that exits at once cannot take the
  // session with it before the option lands.
  return [...create, ';', 'set-option', '-t', requestedName(req), 'remain-on-exit', 'on']
}

/** Argv for the wait poll: prints `<pane_dead> <pane_dead_status>` for the session's pane. */
export function tmuxPaneStatusArgv(name: string): string[] {
  return ['display-message', '-p', '-t', paneTarget(name), '#{pane_dead} #{pane_dead_status}']
}

/**
 * The `load-buffer`/`paste-buffer` name for a send to tmux session `name` — so
 * two concurrent sends to DIFFERENT sessions never share a buffer. Two
 * concurrent sends to the SAME session still share this name and can race (a
 * second `load-buffer` can overwrite the first's content before its own
 * `paste-buffer` runs) — an accepted gap, not something this derivation rules
 * out.
 */
function tmuxBufferName(name: string): string {
  return `${name}-buf`
}

/**
 * Argv for `load-buffer`, the first of THREE separate invocations `send` now
 * makes, per `docs/planning/research/tmux.md`'s "Sending input" section
 * (verified): `-` reads the buffer's content from stdin (`req.text`, piped in
 * by the caller via `CommandRunOptions.input`) rather than an argv element —
 * `send-keys -l <text>` (this function's earlier shape) sent every
 * `\n` in `text` as its own literal Enter keypress, per that section's
 * warning that a TUI would see "each embedded newline as its own Enter"; the
 * load-buffer/paste-buffer path is the doc's own verified alternative that
 * preserves embedded newlines. Passing `text` via stdin instead of an argv
 * element also closes the argv-injection concern a `-`-prefixed `text` used
 * to raise for the old `-l` shape: there is no argv element for tmux to ever
 * misparse as a flag.
 */
export function tmuxLoadBufferArgv(name: string): string[] {
  return ['load-buffer', '-b', tmuxBufferName(name), '-']
}

/**
 * Argv for `paste-buffer`, the second invocation: `-p` pastes as if typed
 * (bracketed paste, matching Orca's own send behavior), `-d` deletes the
 * buffer immediately after so it never lingers for a later, unrelated send
 * to collide with. `-t` addresses the pane by session `name`.
 */
export function tmuxPasteBufferArgv(name: string): string[] {
  return ['paste-buffer', '-p', '-d', '-b', tmuxBufferName(name), '-t', paneTarget(name)]
}

/** The third, separate `send-keys` call that submits what {@link tmuxPasteBufferArgv} just pasted. */
export function tmuxSendEnterArgv(name: string): string[] {
  return ['send-keys', '-t', paneTarget(name), 'Enter']
}

/**
 * Argv for `tmux has-session -t <name>` — per `docs/planning/research/tmux.md`'s
 * "Presence checks" section (verified): exits 0 when the session exists, 1
 * when it does not. Simpler than `list-panes` and sufficient here, since a
 * session name maps 1:1 to a pane.
 */
export function tmuxHasSessionArgv(name: string): string[] {
  return ['has-session', '-t', sessionTarget(name)]
}

/**
 * Argv for `tmux attach-session -t <name>` — the real, interactive attach
 * a caller uses for a tmux-hosted session `find` (below) confirms is still
 * live, instead of falling through to an engine-native resume that would risk
 * opening a SECOND, competing session on top of a still-live one. Unlike orca/cmux, tmux has a genuine
 * interactive attach primitive of its own — this is that mechanism (`attach-
 * session` itself is standard, well-documented tmux behavior, not something
 * this campaign's own research docs independently verified).
 *
 * Only correct when the attaching process is OUTSIDE any tmux client already
 * — a caller reaches for {@link tmuxSwitchClientArgv} instead
 * when `$TMUX` is set, since `attach-session` refuses to nest one client
 * inside another.
 *
 * @experimental an `attach` part is planned to replace the tmux-specific attach helpers.
 */
export function tmuxAttachArgv(name: string): string[] {
  return ['attach-session', '-t', sessionTarget(name)]
}

/**
 * Argv for `tmux switch-client -t <name>` — what a caller uses
 * instead of {@link tmuxAttachArgv} when the attaching process is ITSELF
 * already inside a tmux client (`$TMUX` set, the common case for a tmux
 * user): `attach-session` there refuses with "sessions should be nested with
 * care, unset $TMUX to force" and exits 1 without attaching anything, while
 * `switch-client` is tmux's own documented mechanism for moving the current
 * client to a different session instead of nesting one inside another.
 *
 * @experimental an `attach` part is planned to replace the tmux-specific attach helpers.
 */
export function tmuxSwitchClientArgv(name: string): string[] {
  return ['switch-client', '-t', sessionTarget(name)]
}

/** Argv for `tmux list-sessions`, one session name per line. */
export function tmuxListSessionsArgv(): string[] {
  return ['list-sessions', '-F', '#{session_name}']
}

/** Argv for `tmux capture-pane -p -t <name>`: prints the pane's visible text to stdout. */
export function tmuxCapturePaneArgv(name: string): string[] {
  return ['capture-pane', '-p', '-t', paneTarget(name)]
}

/** Argv for `tmux kill-session -t <name>`: ends the session and signals what runs in it. */
export function tmuxKillSessionArgv(name: string): string[] {
  return ['kill-session', '-t', sessionTarget(name)]
}

/** How long the wait poll pauses between looks at the pane. */
const POLL_MS = 500

/**
 * Whether this process runs inside a tmux client (the `TMUX` environment variable is set).
 *
 * @experimental an `attach` part is planned to replace the tmux-specific attach helpers.
 */
export function insideTmux(): boolean {
  return process.env['TMUX'] !== undefined
}

/**
 * The tmux host: drives a detached tmux session per launch through the `tmux` binary, which must be on PATH.
 * Runs on darwin and linux only (on Windows it is unavailable; run it inside WSL). Keeps no state of its own;
 * sessions are found again by a name derived from the caller's session id.
 */
export function makeTmuxHost(opts: {
  runner?: CommandRunner | undefined
  available?: (() => boolean) | undefined
  /** Defaults to {@link insideTmux}. */
  inside?: (() => boolean) | undefined
  /** The wait poll's pause and clock (epoch ms); tests replace them. */
  sleep?: ((ms: number) => void) | undefined
  now?: (() => number) | undefined
}): Host {
  const sleep = opts.sleep ?? sleepSync
  const now = opts.now ?? Date.now
  const runner = (): CommandRunner => resolveRunner('tmux', opts.runner)

  const hasSession = (name: string, cwd: string): boolean =>
    ran(runner().run(tmuxHasSessionArgv(name), { cwd, timeoutMs: 10_000 }))

  /**
   * The live session a waited run opened for `sessionId` ({@link tmuxRunSessionName}): the one
   * listed session named `sd-<run>-<id>`, or null. The run id is not in the request, so the
   * name is matched by its id suffix.
   */
  const runSessionName = (sessionId: string, cwd: string): string | null => {
    const idName = tmuxIdSessionName(sessionId)
    const suffix = `-${idName.slice('sd-'.length)}`
    const out = quietRun(runner(), tmuxListSessionsArgv(), { cwd, timeoutMs: 10_000 })
    const names = (out ?? '')
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n !== idName && n.startsWith('sd-') && n.endsWith(suffix))
    return names.length === 1 ? (names[0] ?? null) : null
  }

  /**
   * The live tmux session for a request: the one bound to its session id (named from the id,
   * or from a waited run and the id), else (a session opened before names were bound to ids)
   * the cwd's; null when none exists. A request without an id only ever has the cwd's name.
   * `cwdFallback: false` (`close`) never falls back for a request with an id: the cwd's name
   * could belong to a different session in that directory, and killing it is not undoable.
   */
  const liveName = (target: FindQuery, cwdFallback = true): string | null => {
    if (target.sessionId !== undefined) {
      const idName = tmuxIdSessionName(target.sessionId)
      if (hasSession(idName, target.cwd)) return idName
      const runName = runSessionName(target.sessionId, target.cwd)
      if (runName !== null) return runName
      if (!cwdFallback) return null
    }
    const cwdName = tmuxSessionName(target.cwd)
    return hasSession(cwdName, target.cwd) ? cwdName : null
  }

  /**
   * Hold until the session's process exits and return its exit status, the way `terminal` does.
   * At `req.wait.timeoutMs` the session is killed (`kill-session` signals what runs in it) and
   * {@link WAIT_TIMEOUT_EXIT} comes back. A session that vanishes (someone closed it) reports 1.
   * The dead pane is killed on the way out so a finished run leaves no session behind.
   *
   * Synchronous on purpose: `Host.terminal` returns the exit code and every part is sync, so
   * the poll blocks this process until the session ends. A caller that waits is usually a
   * scheduled run with nothing else to do meanwhile; an async wait would change the `Host`
   * contract for every host.
   */
  const waitForExit = (name: string, req: CommandRequest): number => {
    const limit = req.wait?.timeoutMs
    const deadline = limit === undefined ? undefined : now() + limit
    for (;;) {
      const res = runner().run(tmuxPaneStatusArgv(name), { cwd: req.cwd, timeoutMs: 10_000 })
      if (!ran(res)) return 1
      const [dead, status] = res.stdout.trim().split(/\s+/)
      if (dead === '1') {
        runner().run(tmuxKillSessionArgv(name), { cwd: req.cwd, timeoutMs: 10_000 })
        const code = Number(status)
        return Number.isFinite(code) ? code : 1
      }
      if (deadline !== undefined && now() >= deadline) {
        runner().run(tmuxKillSessionArgv(name), { cwd: req.cwd, timeoutMs: 10_000 })
        req.wait?.onDeadline?.()
        return WAIT_TIMEOUT_EXIT
      }
      sleep(POLL_MS)
    }
  }

  return {
    name: 'tmux',
    // tmux has no native Windows build; it runs under WSL.
    platforms: ['darwin', 'linux'],
    platformHint: { win32: 'run inside WSL' },
    available() {
      if (opts.available !== undefined) return opts.available()
      return supportsPlatform(this) && onPath('tmux')
    },
    terminal(req) {
      const res = runner().run(tmuxCreateArgv(req), { cwd: req.cwd, timeoutMs: 60_000 })
      if (!ran(res)) {
        throw new Error(`tmux new-session failed: ${failureText(res)}`)
      }
      return req.wait === undefined ? 0 : waitForExit(requestedName(req), req)
    },
    session: sessionViaTerminal,
    send(req: SendRequest): SendReceipt {
      // tmux has no delivery-confirmation mechanism at all (no `turn_started`
      // equivalent — `docs/planning/research/tmux.md`'s "Reading output" section:
      // no app-aware idle/consumption signal exists), so `ack` is
      // always false regardless of how the sends went.
      //
      // THREE separate invocations, not one: `load-buffer` (text arrives via
      // stdin — `req.text` never appears in an argv element at all), then
      // `paste-buffer` (pastes it, preserving embedded newlines — see
      // `tmuxLoadBufferArgv`'s doc for why this replaced `send-keys -l`),
      // then a separate `send-keys ... Enter` to submit. Accepted gap: if the
      // paste succeeds but this last Enter call fails or times out, the text
      // is already sitting typed in the pane's input — `accepted: false`
      // here, so a caller tries its next route, and a LATER
      // retry's own paste can land on top of it, submitted together as one
      // message. Same class of documented limitation as this host's
      // duplicate-session gap above (`tmuxSessionName`'s doc); fixing it
      // would need either a single chained tmux invocation (unverified
      // against a live server) or a read-back-before-retry check, neither of
      // which this pass adds.
      const name = liveName(req)
      if (name === null) return { accepted: false, ack: false }
      const load = runner().run(tmuxLoadBufferArgv(name), {
        cwd: req.cwd,
        timeoutMs: 15_000,
        input: req.text,
      })
      if (!ran(load)) return { accepted: false, ack: false }
      const paste = runner().run(tmuxPasteBufferArgv(name), { cwd: req.cwd, timeoutMs: 15_000 })
      if (!ran(paste)) {
        // `paste-buffer -d` only deletes on success; do not leave the text loaded in the server.
        runner().run(['delete-buffer', '-b', tmuxBufferName(name)], {
          cwd: req.cwd,
          timeoutMs: 15_000,
        })
        return { accepted: false, ack: false }
      }
      const enter = runner().run(tmuxSendEnterArgv(name), { cwd: req.cwd, timeoutMs: 15_000 })
      return { accepted: ran(enter), ack: false }
    },
    find(query: FindQuery): FoundSession[] {
      const name = liveName(query)
      if (name === null) return []
      // tmux cannot identify which harness runs inside the pane (no tagging is
      // written anywhere in this codebase today), and has no output-recency
      // signal (docs/planning/research/tmux.md: "no idle signal comparable to
      // Orca's") — both come back as the "can't tell" values. The handle is the
      // tmux session name, which a caller can attach to.
      return [{ cwd: query.cwd, harness: null, alive: true, lastOutputAt: null, handle: name }]
    },
    capture(query: FindQuery): string | null {
      const name = liveName(query)
      if (name === null) return null
      return quietRun(runner(), tmuxCapturePaneArgv(name), { cwd: query.cwd, timeoutMs: 10_000 })
    },
    focus(query: FindQuery): boolean {
      // switch-client needs an attached client, which exists only when $TMUX is set.
      if (!(opts.inside ?? insideTmux)()) return false
      const name = liveName(query)
      if (name === null) return false
      return ran(runner().run(tmuxSwitchClientArgv(name), { cwd: query.cwd, timeoutMs: 10_000 }))
    },
    close(query: FindQuery): boolean {
      const name = liveName(query, false)
      if (name === null) return false
      return ran(runner().run(tmuxKillSessionArgv(name), { cwd: query.cwd, timeoutMs: 10_000 }))
    },
  }
}
