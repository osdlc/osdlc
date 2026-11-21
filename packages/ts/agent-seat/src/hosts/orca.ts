/**
 * Orca (com.stablyai.orca): a terminal tab on `cwd` running a command.
 *
 * Orca knows a worktree by path once its repository is registered, so an
 * unknown-worktree failure is retried after `orca repo add --path <repoRoot>`; any
 * other failure, and a second one, is reported verbatim.
 *
 * `terminal create --json` returns the new terminal's handle, which is
 * remembered against the caller's session id (`./session-panes.ts`); a later
 * request for that session targets that terminal among the worktree's, so two
 * sessions in one worktree reach two terminals. A request without a remembered
 * handle (no id, or a terminal opened before handles were remembered) targets the
 * worktree's one live, writable agent terminal, and none when there are several.
 */

import { existsSync } from 'node:fs'

import {
  commandString,
  failureText,
  ran,
  resolveRunner,
  type CommandRunner,
} from '@osdlc/command-seam'
import { isRecord, nonEmptyString, parseJsonOrNull } from '../util.ts'

import {
  onPath,
  supportsPlatform,
  type CommandRequest,
  type FindQuery,
  type FoundSession,
  type Host,
  type SendReceipt,
  type SendRequest,
} from '../contract.ts'
import { commandArgv, harnessOrNull, sessionViaTerminal, type Harness } from '../harness.ts'
import { boundPane, rememberSessionPane } from './session-panes.ts'
import { registryDirOf, type HostStateOptions } from './registry.ts'

/** The CLI the app bundle ships when `orca` is not on PATH. */
export const ORCA_BUNDLED_CLI = '/Applications/Orca.app/Contents/Resources/bin/orca'

export function orcaBinary(): string | null {
  if (onPath('orca')) return 'orca'
  return existsSync(ORCA_BUNDLED_CLI) ? ORCA_BUNDLED_CLI : null
}

/**
 * Argv for `orca terminal create` — pure, so a test can pin it. It never passes `--focus`:
 * `create --focus` can time out while Orca adopts a worktree, with the terminal already
 * open, and a create that never returns is unsafe to retry. The host focuses afterwards,
 * with `terminal switch` on the handle the create returned.
 */
export function orcaCreateArgv(req: CommandRequest): string[] {
  return [
    'terminal',
    'create',
    '--worktree',
    `path:${req.cwd}`,
    '--title',
    req.title,
    '--command',
    commandString(commandArgv(req)),
    '--json',
  ]
}

/**
 * The new terminal's handle in `orca terminal create --json`. Orca has returned it as
 * `result.terminal.handle`, as `result.handle` and as `result.terminalId`; the first
 * of those that is a non-empty string wins.
 */
export function parseOrcaCreatedHandle(stdout: string): string | null {
  const result = field(parseJsonOrNull(stdout), 'result')
  for (const handle of [
    field(field(result, 'terminal'), 'handle'),
    field(result, 'handle'),
    field(result, 'terminalId'),
  ]) {
    const found = nonEmptyString(handle)
    if (found !== null) return found
  }
  return null
}

/** Seconds `orca terminal send` waits for `turn_started`; Orca's own request timeout is this plus 10s. */
const ORCA_SEND_WAIT_SUBMIT_SECS = 10

export function orcaSendArgv(handle: string, text: string): string[] {
  return [
    'terminal',
    'send',
    '--terminal',
    handle,
    '--text',
    text,
    '--enter',
    '--wait-submit',
    String(ORCA_SEND_WAIT_SUBMIT_SECS),
    '--json',
  ]
}

export function orcaSwitchArgv(handle: string): string[] {
  return ['terminal', 'switch', '--terminal', handle, '--json']
}

/** `orca terminal close --terminal <handle>`: closes that terminal and kills what runs in it. */
export function orcaCloseArgv(handle: string): string[] {
  return ['terminal', 'close', '--terminal', handle, '--json']
}

/**
 * Parses `orca terminal send --json`, which wraps its receipt as
 * `{ok, result: {send: {accepted, prompt: {stages}}}}`. `accepted` alone only
 * means the input reached the terminal; a `turn_started` stage confirms the
 * agent took it. Unparseable output is `{accepted: false, ack: false}`.
 */
export function parseOrcaSendResponse(stdout: string): SendReceipt {
  const send = field(field(parseJsonOrNull(stdout), 'result'), 'send')
  const accepted = field(send, 'accepted') === true
  const stages = field(field(send, 'prompt'), 'stages')
  const ack = accepted && Array.isArray(stages) && stages.includes('turn_started')
  // Input accepted but no `turn_started`: Orca itself warns "inspect the terminal before
  // retrying" (`docs/planning/research/orca.md`, "send"), so the text may be in the session.
  return accepted && !ack ? { accepted, ack, uncertain: true } : { accepted, ack }
}

/** True when Orca rejected a handle issued before its last restart. */
export function isOrcaHandleStale(stdout: string): boolean {
  return field(field(parseJsonOrNull(stdout), 'error'), 'code') === 'terminal_handle_stale'
}

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

/**
 * Argv for `orca terminal list --worktree path:<cwd> [--limit <n>] --json` — pure, so a test
 * can pin it. Without `limit`, Orca returns only its first page.
 */
export function orcaFindArgv(query: FindQuery, limit?: number): string[] {
  return [
    'terminal',
    'list',
    '--worktree',
    `path:${query.cwd}`,
    ...(limit === undefined ? [] : ['--limit', String(limit)]),
    '--json',
  ]
}

/** The terminal entries of `orca terminal list --json`: `result.terminals`, `terminals`, or a bare array. */
function orcaFindResponseArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed
  const terminals = field(parsed, 'terminals') ?? field(field(parsed, 'result'), 'terminals')
  return Array.isArray(terminals) ? terminals : null
}

/**
 * Parses `orca terminal list --json` into {@link FoundSession}s. An entry's
 * `agentIdentity` is absent or null for a plain shell and a harness name
 * otherwise, so `alive` means "an agent runs there". `lastOutputAt` is epoch
 * milliseconds. Every entry gets the query's `cwd`, since `--worktree`
 * already scoped the list. Unparseable output is `[]`.
 */
export function parseOrcaFindResponse(stdout: string, cwd: string): FoundSession[] {
  return parseOrcaTerminals(stdout, cwd).map(toFoundSession)
}

function toFoundSession(terminal: OrcaTerminal): FoundSession {
  const { writable, ...session } = terminal
  void writable // a found session does not report whether it accepts input
  return session
}

type OrcaTerminal = FoundSession & { writable: boolean }

function parseOrcaTerminals(stdout: string, cwd: string): OrcaTerminal[] {
  const entries = orcaFindResponseArray(parseJsonOrNull(stdout))
  if (entries === null) return []
  const found: OrcaTerminal[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const agentIdentity = entry['agentIdentity']
    const harness = harnessOrNull(agentIdentity)
    const alive = agentIdentity !== null && agentIdentity !== undefined
    found.push({
      cwd,
      harness,
      alive,
      lastOutputAt: isoTimestamp(entry['lastOutputAt']),
      handle: typeof entry['handle'] === 'string' ? entry['handle'] : null,
      writable: entry['writable'] === true,
    })
  }
  return found
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return null
}

/**
 * The `totalCount` of an `orca terminal list --json` reply marked `truncated: true`, or null
 * when the reply is untruncated or gives no `totalCount` above the page's length.
 */
function orcaTruncatedTotal(stdout: string): number | null {
  const parsed = parseJsonOrNull(stdout)
  const result = field(parsed, 'result')
  const total = field(result, 'totalCount')
  const shown = orcaFindResponseArray(parsed)?.length ?? 0
  return field(result, 'truncated') === true && Number.isInteger(total) && (total as number) > shown
    ? (total as number)
    : null
}

/**
 * Every terminal of the worktree; a truncated first page is listed again with `--limit` of
 * `totalCount`. Returns [] when the first listing fails; when the full listing fails or is
 * still truncated, the first page's terminals stand (an empty find would always open a duplicate).
 */
function listOrcaTerminals(runner: CommandRunner, cwd: string): OrcaTerminal[] {
  const opts = { cwd, timeoutMs: 30_000 }
  let res = runner.run(orcaFindArgv({ cwd }), opts)
  if (!ran(res)) return []
  const total = orcaTruncatedTotal(res.stdout)
  if (total !== null) {
    const full = runner.run(orcaFindArgv({ cwd }, total), opts)
    if (ran(full) && orcaTruncatedTotal(full.stdout) === null) res = full
  }
  return parseOrcaTerminals(res.stdout, cwd)
}

/**
 * The handle of the terminal for `cwd` to act on, or null. With a remembered handle
 * (`bound`) that is that terminal if Orca still lists it live and writable, and nothing
 * otherwise: another session's terminal at the same worktree is not this one's. Without
 * one it is the one live, writable agent terminal on `cwd` (of `harness` when given), or
 * null when there are none or several: delivering into the wrong session is worse than no
 * delivery. Handles change when Orca restarts, so resolve one right before using it.
 */
export function resolveOrcaHandle(
  runner: CommandRunner,
  cwd: string,
  bound: string | null = null,
  harness?: Harness,
): string | null {
  const terminals = listOrcaTerminals(runner, cwd)
  if (bound !== null) {
    return terminals.some((t) => t.handle === bound && t.writable) ? bound : null
  }
  const matches = terminals.filter(
    (t) => t.alive && t.writable && t.handle && (harness === undefined || t.harness === harness),
  )
  return matches.length === 1 ? (matches[0]?.handle ?? null) : null
}

/**
 * Whether a failed `terminal create` says Orca does not know the worktree. The exact
 * wording is not recorded (`docs/planning/research/orca.md`), so this matches any
 * mention of a worktree in its output.
 */
function isOrcaUnknownWorktree(res: { stdout: string; stderr: string }): boolean {
  return /worktree/i.test(res.stderr) || /worktree/i.test(res.stdout)
}

/**
 * The Orca host: opens terminal tabs in Orca through its CLI, found as `orca` on PATH or the app's bundled CLI.
 * darwin only. Remembers the terminal handle of each session under `runtimeDir`/`registryDir` ({@link HostStateOptions}).
 */
export function makeOrcaHost(
  opts: {
    binary?: string | null | undefined
    runner?: CommandRunner | undefined
    /** Registered on an unknown-worktree miss, then the create is retried once. */
    repoRoot?: string | undefined
  } & HostStateOptions,
): Host {
  const binary = () => (opts.binary === undefined ? orcaBinary() : opts.binary)
  const registryDir = registryDirOf('orca', opts)
  const boundHandle = (target: FindQuery): string | null => boundPane(registryDir, target)
  return {
    name: 'orca',
    acksSend: true,
    // Observed on macOS only; a platform that was not run is left out.
    platforms: ['darwin'],
    available() {
      if (opts.binary === undefined && !supportsPlatform(this)) return false
      return binary() !== null
    },
    terminal(req) {
      const bin = binary()
      if (bin === null) throw new Error(`orca is not on PATH and ${ORCA_BUNDLED_CLI} is absent`)
      const runner = resolveRunner(bin, opts.runner)
      const argv = orcaCreateArgv(req)
      let res = runner.run(argv, { cwd: req.cwd, timeoutMs: 60_000 })
      // Only an unknown worktree is retried. Any other failure, or a create that never exited
      // (timed out, killed), may have opened the terminal already: a second create would start
      // the agent twice.
      if (
        !ran(res) &&
        res.neverExited !== true &&
        opts.repoRoot !== undefined &&
        isOrcaUnknownWorktree(res)
      ) {
        runner.run(['repo', 'add', '--path', opts.repoRoot], { cwd: req.cwd, timeoutMs: 60_000 })
        res = runner.run(argv, { cwd: req.cwd, timeoutMs: 60_000 })
      }
      if (!ran(res)) {
        throw new Error(
          `orca terminal create failed: ${failureText(res)}\n` +
            `If Orca does not know this worktree, open it there first: orca worktree list`,
        )
      }
      const handle = parseOrcaCreatedHandle(res.stdout)
      if (handle !== null && req.sessionId !== undefined) {
        rememberSessionPane(registryDir, req.sessionId, handle, req.cwd)
      }
      // Not `create --focus`: see orcaCreateArgv.
      if (handle !== null && req.focus !== false) {
        runner.run(orcaSwitchArgv(handle), { cwd: req.cwd, timeoutMs: 30_000 })
      }
      return 0
    },
    // Orca's own `terminal create` call carries no session identity of its
    // own to hand back, but `wrapperSession` (`../harness.ts`) can still
    // resolve one independently of Orca, when the harness itself exposes a
    // way to (codex's own rollout-file scan) — see its doc for why
    // claude/cursor/pi currently always come back null regardless of host.
    session: sessionViaTerminal,
    send(req: SendRequest): SendReceipt {
      const bin = binary()
      if (bin === null) return { accepted: false, ack: false }
      const runner = resolveRunner(bin, opts.runner)
      const trySend = () => {
        const handle = resolveOrcaHandle(runner, req.cwd, boundHandle(req), req.harness)
        if (handle === null) return null
        try {
          return runner.run(orcaSendArgv(handle, req.text), { cwd: req.cwd, timeoutMs: 30_000 })
        } catch {
          // The runner throws on text it cannot pass at all (a NUL byte); `send` never throws.
          return null
        }
      }
      let res = trySend()
      if (res !== null && isOrcaHandleStale(res.stdout)) res = trySend()
      if (res === null || !ran(res)) return { accepted: false, ack: false }
      return parseOrcaSendResponse(res.stdout)
    },
    find(query: FindQuery): FoundSession[] {
      const bin = binary()
      if (bin === null) return []
      // A find failure means "nothing found", not an exception.
      const found = listOrcaTerminals(resolveRunner(bin, opts.runner), query.cwd)
      const bound = boundHandle(query)
      return (bound === null ? found : found.filter((t) => t.handle === bound)).map(toFoundSession)
    },
    focus(query: FindQuery): boolean {
      const bin = binary()
      if (bin === null) return false
      const runner = resolveRunner(bin, opts.runner)
      const handle = resolveOrcaHandle(runner, query.cwd, boundHandle(query))
      if (handle === null) return false
      return ran(runner.run(orcaSwitchArgv(handle), { cwd: query.cwd, timeoutMs: 30_000 }))
    },
    close(query: FindQuery): boolean {
      const bin = binary()
      if (bin === null) return false
      try {
        // Closing is destructive: a session whose terminal was never remembered (opened before
        // handles were) is left open rather than closing whichever agent terminal is first there.
        const bound = boundHandle(query)
        if (query.sessionId !== undefined && bound === null) return false
        const runner = resolveRunner(bin, opts.runner)
        const handle = resolveOrcaHandle(runner, query.cwd, bound)
        if (handle === null) return false
        return (
          runner.run(orcaCloseArgv(handle), { cwd: query.cwd, timeoutMs: 30_000 }).exitCode === 0
        )
      } catch {
        return false
      }
    },
  }
}
