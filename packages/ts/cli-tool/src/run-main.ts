/**
 * The body of a bin shim.
 *
 * A CLI's `main` returns an exit code and never ends the process; this is the
 * one place that turns that number into the process's fate. It assigns
 * `process.exitCode` rather than calling `process.exit`, because exiting
 * outright truncates buffered stdout — a piped run can lose its last lines,
 * and the bug only shows up under a pipe.
 *
 * A thrown error becomes one line on stderr and {@link EXIT.error}. A thrown
 * failure (a `FailureError`, which includes `CommandFailed`) is rendered by
 * {@link renderFailure} and exits with the code {@link exitCodeFor} gives its
 * kind, so a missing tool, a signed-out `gh` and a dead network read the same
 * in every tool. A stack trace is the wrong default for a command someone
 * typed: it says where the code was, not what they should do. A tool wanting
 * traces can catch inside its own `main`.
 */

import { EXIT } from './exit.ts'
import { exitCodeFor, failureOf, renderFailure } from './failure.ts'
import { processContext, type CliContext } from './io.ts'

/**
 * Options for running a main function: the tool's name, and the context and arguments to use in place of the process's own.
 */
export interface RunMainOptions {
  /** Prefixes the error line, so a message says which tool produced it. */
  name: string
  /** Defaults to this process's streams, directory and environment. */
  context?: CliContext
  /** Defaults to `process.argv.slice(2)`. */
  argv?: readonly string[]
}

/**
 * A tool's main function: takes the arguments and the context and returns the exit code, directly or in a promise.
 */
export type MainFn = (argv: readonly string[], ctx: CliContext) => number | Promise<number>

/** Run `main` and set the process's exit code from what it returns. */
export async function runMain(main: MainFn, options: RunMainOptions): Promise<void> {
  const ctx = options.context ?? processContext()
  const argv = options.argv ?? process.argv.slice(2)
  try {
    process.exitCode = await main(argv, ctx)
  } catch (err) {
    const failure = failureOf(err)
    if (failure !== null) {
      ctx.io.stderr(renderFailure(failure, options.name))
      process.exitCode = exitCodeFor(failure)
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    ctx.io.stderr(`${options.name}: ${message}\n`)
    process.exitCode = EXIT.error
  }
}
