/**
 * Test helper: start a long-lived child (a fake IDE, a helper script) and read
 * its output line by line. Long-lived process management with piped stdio is
 * one of the command seam's stated exceptions, so this spawns directly.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface Child {
  proc: ChildProcess
  /** Resolves with the first stdout line. */
  firstLine: Promise<string>
  /** Resolves when the child exits. */
  exited: Promise<number | null>
  kill(): void
}

/** Starts `argv[0]` with the rest as arguments; `onStderrLine` sees each stderr line. */
export function startChild(
  argv: string[],
  opts: { env?: NodeJS.ProcessEnv; onStderrLine?: (line: string) => void } = {},
): Child {
  const proc = spawn(argv[0]!, argv.slice(1), {
    env: opts.env ?? process.env,
    stdio: ['ignore', 'pipe', opts.onStderrLine === undefined ? 'ignore' : 'pipe'],
  })
  const firstLine = new Promise<string>((resolve, reject) => {
    const rl = createInterface({ input: proc.stdout! })
    rl.once('line', (line) => {
      resolve(line)
      rl.close()
    })
    proc.once('error', reject)
    proc.once('exit', (code) => reject(new Error(`child exited (${code}) before printing`)))
  })
  // A rejection nobody awaits (a child started only to run to completion) is not a failure.
  firstLine.catch(() => {})
  if (opts.onStderrLine !== undefined) {
    createInterface({ input: proc.stderr! }).on('line', opts.onStderrLine)
  }
  const exited = new Promise<number | null>((resolve) => proc.once('exit', (code) => resolve(code)))
  return { proc, firstLine, exited, kill: () => void proc.kill() }
}

/** Resolves after `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
