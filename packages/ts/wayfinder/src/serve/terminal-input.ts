/**
 * Enter in the `way serve` terminal. A background job that reads its terminal
 * gets `SIGTTIN`, which stops it, so `way serve &` would stop serving. Lines
 * are read only while the process is in the terminal's foreground process
 * group. Ctrl-Z stops reading before the process stops, and a resume (`fg` or
 * `bg`) checks again. In the background the check repeats, since `fg` on a
 * running job sends no signal.
 */

import { spawnRunnerAsync } from '@osdlc/command-seam'

/** How long the foreground check may take. */
const PS_TIMEOUT_MS = 2_000

/** How often a background process checks whether it is in the foreground. */
const POLL_MS = 1_000

/**
 * True when `ps -o tpgid= -o pgid=` output says the process leads the
 * terminal's foreground group: both ids are equal and positive. A process
 * with no terminal has a `tpgid` of 0 or -1.
 */
export function foregroundFromPs(out: string): boolean {
  const [tpgid, pgid, extra] = out.trim().split(/\s+/)
  if (extra !== undefined || tpgid === undefined || pgid === undefined) return false
  return /^\d+$/.test(tpgid) && Number(tpgid) > 0 && tpgid === pgid
}

/**
 * Whether this process is in its terminal's foreground group. Always true on
 * Windows, which has no job control. False when `ps` fails, so the terminal
 * is not read.
 */
export async function inForeground(): Promise<boolean> {
  if (process.platform === 'win32') return true
  const proc = await spawnRunnerAsync('ps', { absolutePathOnly: true }).run(
    ['-o', 'tpgid=', '-o', 'pgid=', '-p', String(process.pid)],
    { cwd: '/', timeoutMs: PS_TIMEOUT_MS },
  )
  return proc.exitCode === 0 && foregroundFromPs(proc.stdout)
}

/** The job-control signals the reader follows. Tests pass a stand-in. */
export interface JobSignals {
  on(signal: 'SIGTSTP' | 'SIGCONT', listener: () => void): unknown
  off(signal: 'SIGTSTP' | 'SIGCONT', listener: () => void): unknown
  /** Stop this process, as Ctrl-Z would have. */
  suspend(): void
}

/** The process's own job-control signals. None on Windows. */
export const processJobSignals: JobSignals | null =
  process.platform === 'win32'
    ? null
    : {
        on: (signal, listener) => process.on(signal, listener),
        off: (signal, listener) => process.off(signal, listener),
        suspend: () => process.kill(process.pid, 'SIGSTOP'),
      }

/** What {@link readTerminalLines} needs. */
export interface TerminalLinesOptions {
  /** Whether the process may read the terminal now. Default {@link inForeground}. */
  foreground?: (() => Promise<boolean>) | undefined
  /** Default {@link processJobSignals}. */
  signals?: JobSignals | null | undefined
  /** How often to check again while in the background. Default 1 second. */
  pollMs?: number | undefined
}

/** A running reader. */
export interface TerminalLines {
  /** Settles after the first foreground check, with whether lines are read. */
  ready: Promise<boolean>
  /** Stop reading and drop the signal listeners. */
  stop(): void
}

/**
 * Call `onLine` for each Enter typed on `input`, while the process is in the
 * foreground.
 */
export function readTerminalLines(
  input: NodeJS.ReadableStream,
  onLine: () => void,
  options: TerminalLinesOptions = {},
): TerminalLines {
  const foreground = options.foreground ?? inForeground
  const signals = options.signals === undefined ? processJobSignals : options.signals
  const pollMs = options.pollMs ?? POLL_MS
  let reading = false
  let stopped = false
  let poll: ReturnType<typeof setTimeout> | undefined

  const onData = (chunk: Buffer | string): void => {
    if (String(chunk).includes('\n')) onLine()
  }
  const attach = (): void => {
    if (reading || stopped) return
    reading = true
    input.on('data', onData)
    input.resume()
  }
  const detach = (): void => {
    if (!reading) return
    reading = false
    input.off('data', onData)
    input.pause()
  }
  const check = async (): Promise<boolean> => {
    clearTimeout(poll)
    const now = await foreground().catch(() => false)
    if (stopped) return false
    if (now) attach()
    else {
      detach()
      clearTimeout(poll)
      poll = setTimeout(() => void check(), pollMs)
      poll.unref?.()
    }
    return reading
  }
  // Stop reading before the stop, so a later `bg` does not read the terminal.
  const onStop = (): void => {
    detach()
    signals?.suspend()
  }
  const onContinue = (): void => {
    void check()
  }
  signals?.on('SIGTSTP', onStop)
  signals?.on('SIGCONT', onContinue)

  return {
    ready: check(),
    stop() {
      stopped = true
      clearTimeout(poll)
      detach()
      signals?.off('SIGTSTP', onStop)
      signals?.off('SIGCONT', onContinue)
    },
  }
}
