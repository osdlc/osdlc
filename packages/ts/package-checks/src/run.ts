/** How the checks run other programs, through @osdlc/command-seam. */

import { failureText, spawnRunner, streamRunner, type EnvOverrides } from '@osdlc/command-seam'

/** A failed command, with what it wrote. */
export class RunFailed extends Error {
  readonly stdout: string
  constructor(message: string, stdout: string) {
    super(message)
    this.name = 'RunFailed'
    this.stdout = stdout
  }
}

/**
 * Runs `command` and returns its stdout. A non-zero exit throws
 * {@link RunFailed}: the message starts with the command line, then what it
 * wrote to stderr (or stdout).
 */
export function capture(command: string, argv: string[], cwd: string, env?: EnvOverrides): string {
  const r = spawnRunner(command).run(argv, { cwd, env })
  if (r.exitCode === 0 && r.neverExited !== true) return r.stdout
  throw new RunFailed(
    `${[command, ...argv].join(' ')} failed: ${failureText(r, { both: true }) || `exit ${r.exitCode}`}`,
    r.stdout,
  )
}

/**
 * Runs `command` with the output shown as it runs, and returns the result's
 * exit code: the child's, or 1 when it never reported one.
 */
export function stream(command: string, argv: string[], cwd: string, env?: EnvOverrides): number {
  return streamRunner(command).run(argv, { cwd, env }).exitCode
}
