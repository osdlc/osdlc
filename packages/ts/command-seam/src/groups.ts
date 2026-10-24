/**
 * Live process groups, and forwarding of termination signals to them.
 *
 * A child started with `processGroup: true` leads its own group and no longer
 * receives the terminal's Ctrl-C. When the host is then killed by `SIGINT`,
 * `SIGTERM` or `SIGHUP`, the child and everything it started would be orphaned
 * (ppid 1). The runners register each such group here, and
 * {@link installGroupSignalForwarding} makes the host kill them when it is
 * signalled. A group stays registered until it is empty. Once its run has
 * settled, the host's normal exit leaves what is left of it running, such as a
 * daemon. A forwarded signal still kills it.
 *
 * Once a signal has been forwarded and this module owns the exit, the host is
 * stopping. The runners refuse to start a new group, and
 * {@link forwardedSignal} tells the host's own code to stop.
 *
 * The signal listeners exist only while a group is starting or registered. A
 * JS listener replaces the default "terminate" action and runs only when the
 * event loop turns. A listener left attached would make a host that is
 * blocked in a sync spawn ignore a signal it would otherwise die from.
 */

import { constants } from 'node:os'

const osSignals = constants.signals as Record<string, number>

/** Live group leaders, in start order, and whether each one's run has settled. */
const live = new Map<number, { settled: boolean }>()
/** Group spawns in progress. The listeners are attached before their pid is known. */
let spawning = 0

/**
 * Options for {@link installGroupSignalForwarding}.
 *
 * @experimental
 */
export interface GroupSignalForwardingOptions {
  /** Signals to forward. Default `SIGINT`, `SIGTERM` and `SIGHUP`. */
  signals?: readonly NodeJS.Signals[] | undefined
  /**
   * How long the groups have between `SIGTERM` and `SIGKILL`, in ms. Default
   * 1000: long enough for git to remove its lock files.
   */
  graceMs?: number | undefined
  /**
   * Called to end the process, with `128 + signal number`. The default sets
   * `process.exitCode` and lets the event loop drain, so piped stdout is not
   * cut short. It calls `process.exit` after 500 ms if handles still keep the
   * loop open. Tests replace it.
   */
  exit?: ((code: number) => void) | undefined
}

const DEFAULT_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP']
const POLL_MS = 25

interface Config {
  signals: readonly NodeJS.Signals[]
  graceMs: number
  exit: (code: number) => void
}

/** Set while forwarding is installed. */
let config: Config | undefined
/** Set while the listeners are attached: forwarding installed and a group starting or live. */
let armed: { off: () => void } | undefined
/**
 * The first signal forwarded since install whose exit this module owns (the
 * host has no listener of its own for it). Cleared only by uninstall.
 */
let forwarded: NodeJS.Signals | undefined
/** Set while a graceful kill is waiting out its grace. */
let killing = false
/** A repeat signal already sent `SIGKILL`, so the graceful kill stops waiting. */
let escalated = false

/**
 * Register a group leader. The returned function unregisters it. Call it once
 * the group is gone, so a reused pid is never signalled. Registering the
 * first group attaches the signal listeners (when forwarding is installed).
 * Removing the last one detaches them.
 *
 * @internal
 */
export function trackGroup(pid: number): () => void {
  live.set(pid, { settled: false })
  arm()
  return () => {
    live.delete(pid)
    disarmIfIdle()
  }
}

/**
 * Start a group leader with `start` and register it. The listeners are
 * attached before `start` runs. The child can print, and the host can be
 * signalled, before `spawn` returns. A signal that comes before the listeners
 * would kill the host by default and orphan the group. `untrack` is `undefined` when the
 * child got no pid.
 *
 * @internal
 */
export function spawnTrackedGroup<C extends { readonly pid?: number | undefined }>(
  start: () => C,
): { child: C; untrack: (() => void) | undefined } {
  spawning += 1
  arm()
  try {
    const child = start()
    return { child, untrack: child.pid === undefined ? undefined : trackGroup(child.pid) }
  } finally {
    spawning -= 1
    disarmIfIdle()
  }
}

/**
 * Mark the run of the group led by `pid` as settled. The host's exit then no
 * longer kills what is left of the group. A forwarded signal still does. A runner
 * does not call this for a group it is stopping itself.
 *
 * @internal
 */
export function settleGroup(pid: number): void {
  const entry = live.get(pid)
  if (entry !== undefined) entry.settled = true
}

/**
 * Why a new group must not start, or `undefined` when it may. The runners call
 * this before they spawn with `processGroup: true`.
 *
 * @internal
 */
export function groupStartRefusal(): string | undefined {
  if (forwarded === undefined) return undefined
  return `not started: the host got ${forwarded} and is stopping`
}

/**
 * Run `release` once the group led by `pid` has no member. That is at once if
 * it is already empty, else when a poll on an unref'd timer finds it empty.
 *
 * The timer is unref'd on purpose. A ref'd poll would keep the host alive as
 * long as a member the group left behind. On a Bun version where an unref'd
 * timer does not fire (see `async.ts`), the entry stays registered. The
 * listeners then stay attached and a signal still kills that member, which
 * is the safe failure.
 *
 * @internal
 */
export function releaseWhenEmpty(pid: number, release: () => void): void {
  if (!groupExists(pid)) {
    release()
    return
  }
  const timer = setInterval(() => {
    if (groupExists(pid)) return
    clearInterval(timer)
    release()
  }, 250)
  timer.unref()
}

/**
 * True while the group led by `pid` still has a member.
 *
 * @internal
 */
export function groupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

/** Send `sig` to the group led by `pid`, only while it is registered. */
function signalGroup(pid: number, sig: NodeJS.Signals): void {
  if (!live.has(pid)) return
  try {
    process.kill(-pid, sig)
  } catch {
    // Already gone.
  }
}

/**
 * The pids of the live process groups started with `processGroup: true`.
 *
 * @experimental
 */
export function liveProcessGroups(): number[] {
  return [...live.keys()]
}

/**
 * The signal the host was sent and forwarded to its groups, or `undefined`
 * while none has been. Set only when forwarding owns the exit, that is, when
 * the host has no listener of its own for that signal. Once set, the host is
 * stopping. A loop that runs one command after another should check it and
 * stop, and the runners refuse to start a new `processGroup` run. The
 * uninstall function clears it.
 *
 * @experimental
 */
export function forwardedSignal(): NodeJS.Signals | undefined {
  return forwarded
}

/**
 * The exit code for {@link forwardedSignal}: `128 + signal number`, or
 * `undefined` while no signal has been forwarded. A host that sets its own
 * exit code after its work returns keeps this one over it:
 * `process.exitCode = forwardedExitCode() ?? code`.
 *
 * @experimental
 */
export function forwardedExitCode(): number | undefined {
  return forwarded === undefined ? undefined : 128 + signalNumber(forwarded)
}

function arm(): void {
  if (config === undefined || armed !== undefined || (live.size === 0 && spawning === 0)) return
  const { signals, graceMs, exit } = config
  const onExit = () => {
    // The host is exiting and nothing async runs after this. Kill every group
    // whose run is still in flight now. What a settled run left behind stays.
    for (const [pid, { settled }] of live) if (!settled) signalGroup(pid, 'SIGKILL')
  }
  const handlers = signals.map((sig) => {
    const handler = () => {
      const code = 128 + signalNumber(sig)
      if (forwarded !== undefined || killing) {
        // A repeat signal: stop waiting.
        escalated = true
        for (const pid of live.keys()) signalGroup(pid, 'SIGKILL')
        if (!othersListen(sig)) exit(code)
        return
      }
      // A host listener owns the exit and may keep running (a REPL cancelling
      // a job, a daemon reloading on SIGHUP). Kill the groups, but do not
      // refuse later runs.
      const othersOwnExit = othersListen(sig)
      if (!othersOwnExit) forwarded = sig
      killing = true
      escalated = false
      void killAll(graceMs).then(() => {
        killing = false
        if (!escalated && !othersOwnExit) exit(code)
      })
    }
    // Added first, because Node and Bun remove a host's `process.once` wrapper
    // before calling it. A handler that ran after it would not count that
    // listener.
    process.prependListener(sig, handler)
    return [sig, handler] as const
  })
  process.on('exit', onExit)
  armed = {
    off: () => {
      for (const [sig, handler] of handlers) process.off(sig, handler)
      process.off('exit', onExit)
    },
  }
}

function disarm(): void {
  armed?.off()
  armed = undefined
}

function disarmIfIdle(): void {
  if (live.size === 0 && spawning === 0) disarm()
}

/** Another listener than ours is attached for `sig`: it owns the exit. */
function othersListen(sig: NodeJS.Signals): boolean {
  return process.listenerCount(sig) > 1
}

/**
 * Enable forwarding of termination signals to live process groups.
 *
 * While at least one group started with `processGroup: true` is live, `SIGINT`,
 * `SIGTERM` and `SIGHUP` send `SIGTERM` to every registered group, then
 * `SIGKILL` to those still registered after `graceMs`, then end the process
 * with `128 + signal number`, the shell convention. A second signal during the
 * grace, or any later one, skips straight to `SIGKILL` and the exit. From the
 * first signal on, {@link forwardedSignal} returns it and the runners refuse
 * to start a new `processGroup` run, until the uninstall function resets
 * that. A `process` `exit` handler, attached with the listeners, also
 * `SIGKILL`s every group whose run is still in flight, so a host that exits
 * first does not leave one behind. A member that a settled run left behind,
 * such as a daemon, outlives the host's exit. A forwarded signal still kills
 * it.
 *
 * The listeners are attached just before the first group starts and removed
 * when the last one goes, so a host with no live group keeps each signal's
 * default action. If the host has its own listener for the signal
 * (`process.once` counts too), the groups still get `SIGTERM` at once and
 * `SIGKILL` after `graceMs` (or on `exit`, if sooner and the run is in
 * flight). But that listener keeps the exit, and later runs are not refused.
 * Calling it again while installed does nothing and returns the same
 * uninstall function. `SIGKILL` of the host cannot be caught and still
 * orphans its groups. POSIX only. On Windows it does nothing.
 *
 * @returns A function that removes the forwarding.
 * @experimental
 */
export function installGroupSignalForwarding(opts: GroupSignalForwardingOptions = {}): () => void {
  if (process.platform === 'win32') return () => {}
  if (config !== undefined) return uninstall
  config = {
    signals: opts.signals ?? DEFAULT_SIGNALS,
    graceMs: opts.graceMs ?? 1000,
    exit: opts.exit ?? defaultExit,
  }
  arm()
  return uninstall
}

function uninstall(): void {
  disarm()
  config = undefined
  forwarded = undefined
  killing = false
  escalated = false
}

/**
 * Set the exit code and let output drain, then force the exit after 500 ms.
 * The timer is not unref'd, because an unref'd timer does not always fire on
 * every Bun version, and keeping the loop open for 500 ms after a signal
 * costs little.
 */
function defaultExit(code: number): void {
  process.exitCode = code
  setTimeout(() => process.exit(code), 500)
}

/**
 * `SIGTERM` every registered group, wait up to `graceMs` for them to go, then
 * `SIGKILL` those still registered. Stops early when `escalated` says a repeat
 * signal already did the kill.
 */
async function killAll(graceMs: number): Promise<void> {
  // Drop entries whose group is already empty, so a stale pid is never signalled.
  for (const pid of liveProcessGroups()) if (!groupExists(pid)) live.delete(pid)
  for (const pid of liveProcessGroups()) signalGroup(pid, 'SIGTERM')
  const deadline = performance.now() + graceMs
  while (!escalated && performance.now() < deadline) {
    if (!liveProcessGroups().some(groupExists)) return
    await new Promise((res) => setTimeout(res, POLL_MS))
  }
  if (escalated) return
  for (const pid of liveProcessGroups()) if (groupExists(pid)) signalGroup(pid, 'SIGKILL')
}

function signalNumber(sig: NodeJS.Signals): number {
  const n = osSignals[sig]
  return typeof n === 'number' ? n : 15
}
