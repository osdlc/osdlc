/**
 * Handing the terminal to a task. The CLI's `run` uses it now; the terminal
 * UI and the web view's server hand off the same way.
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
 * The signals the terminal sends the whole foreground group. While the task
 * runs they are the task's to handle, so this process only waits for it.
 */
const TERMINAL_SIGNALS: readonly NodeJS.Signals[] =
  process.platform === 'win32' ? ['SIGINT'] : ['SIGINT', 'SIGQUIT']

/**
 * Run `plan` with this process's terminal and wait for it. `argv` is spawned
 * without a shell, with `plan.env` added to the environment.
 *
 * Ctrl-C reaches the task and this process alike, since both are in the
 * terminal's foreground group. This process ignores it while the task runs,
 * so it can report how the task ended, as a shell does.
 */
export function handOff(plan: RunPlan): HandOffResult {
  const ignore = (): void => {}
  for (const signal of TERMINAL_SIGNALS) process.on(signal, ignore)
  try {
    const [binary, ...rest] = plan.argv
    const res = streamRunner(binary!).run(rest, { cwd: plan.cwd, env: plan.env, quiet: true })
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
