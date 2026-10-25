/**
 * Handing the terminal to a task. The CLI's `run`, the terminal UI and the
 * web view's server hand off the same way.
 */

import { constants } from 'node:os'

// Live-streaming exception to the command seam: the task gets this process's
// terminal (`stdio: "inherit"`), which only `streamRunner` does.
import { streamRunner } from '@osdlc/command-seam'

import type { RunPlan } from './session.ts'

/** How a handed-off task ended. */
export interface HandOffResult {
  /** The task's exit code, `128 + n` when signal `n` ended it, 1 when it never started. */
  exit: number
  /** Why it never started: no such binary, or no such directory. */
  error?: string | undefined
}

/**
 * The signals this process ignores while the task runs. SIGINT and SIGQUIT
 * come from the terminal to the whole foreground group, so they are the
 * task's to handle. SIGTERM and SIGHUP may be sent to this process alone, by
 * `kill` or a supervisor. The spawn is synchronous, so they cannot be passed
 * on to the task; ignoring them keeps this process waiting for the task
 * rather than leaving it running with no parent. To stop both, signal the
 * process group (`kill -TERM -<pgid>`) or press Ctrl-C.
 */
const TERMINAL_SIGNALS: readonly NodeJS.Signals[] =
  process.platform === 'win32' ? ['SIGINT'] : ['SIGINT', 'SIGQUIT', 'SIGTERM', 'SIGHUP']

/**
 * Run `plan` with this process's terminal and wait for it. `argv` is spawned
 * without a shell, with `plan.env` added to the environment.
 *
 * Ctrl-C reaches the task and this process alike, since both are in the
 * terminal's foreground group. This process ignores it while the task runs,
 * so it can report how the task ended, as a shell does. An argv the system
 * cannot spawn, such as one holding a NUL, is `{ exit: 1, error }`.
 */
export function handOff(plan: Pick<RunPlan, 'argv' | 'env' | 'cwd'>): HandOffResult {
  const ignore = (): void => {}
  for (const signal of TERMINAL_SIGNALS) process.on(signal, ignore)
  try {
    const [binary, ...rest] = plan.argv
    if (binary === undefined) return { exit: 1, error: 'the task has no command' }
    let res: ReturnType<ReturnType<typeof streamRunner>['run']>
    try {
      res = streamRunner(binary).run(rest, { cwd: plan.cwd, env: plan.env, quiet: true })
    } catch (err) {
      return { exit: 1, error: err instanceof Error ? err.message : String(err) }
    }
    if (res.reason === 'spawn') return { exit: 1, error: res.error ?? 'could not start' }
    if (res.reason === 'signal' && res.signal !== undefined) {
      const number = (constants.signals as Record<string, number>)[res.signal]
      return { exit: number === undefined ? 1 : 128 + number }
    }
    return { exit: res.exitCode }
  } finally {
    // A signal that arrived during the run is dispatched on a later turn.
    // Removing the listener before then would let it end this process.
    setTimeout(() => {
      for (const signal of TERMINAL_SIGNALS) process.off(signal, ignore)
    }, 50).unref()
  }
}
