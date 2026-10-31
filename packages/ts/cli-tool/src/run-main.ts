/**
 * The body of a bin shim.
 *
 * A CLI's `main` returns an exit code and never ends the process. This is the
 * one place that turns that number into the process exit code. It assigns
 * `process.exitCode` rather than calling `process.exit`, because exiting at
 * once truncates buffered stdout. A piped run can lose its last lines, and the
 * bug only shows up under a pipe.
 *
 * A thrown error becomes one line on stderr, from {@link renderError} (so
 * with terminal controls removed), and {@link EXIT.error}. A thrown
 * failure (a `FailureError`, which includes `CommandFailed`) is rendered by
 * {@link renderFailure} and exits with the code {@link exitCodeFor} gives its
 * kind. So a missing tool, a signed-out `gh` and a network failure read the
 * same in every tool that throws the classified failure (`@osdlc/typed-git`,
 * `@osdlc/typed-gh` and `@osdlc/code-host` do). A bare `CommandFailed` carries
 * only command-seam's kinds, so its generic `exit` kind exits 1. A stack trace
 * is the wrong default for a command someone typed. It says where the code
 * was, not what the person should do. A tool that wants traces can catch
 * inside its own `main`.
 *
 * A first argument of `--version` or `--where` is answered here, after the
 * devlink hook and without calling `main`.
 */

import { EXIT } from './exit.ts'
import { exitCodeFor, failureOf, renderError, renderFailure } from './failure.ts'
import { processContext, type CliContext } from './io.ts'
import { renderWhere, where } from './where.ts'

/**
 * Options for running a main function: the tool's name, and the context and
 * arguments to use in place of the process's own.
 */
export interface RunMainOptions {
  /** Prefixes the error line, so a message says which tool produced it. */
  name: string
  /** Defaults to this process's streams, directory and environment. */
  context?: CliContext
  /** Defaults to `process.argv.slice(2)`. */
  argv?: readonly string[]
  /**
   * When set, a first argument of `--version` prints `<name> <version>`, as
   * `defineApp` does, and exits 0 without calling `main`. Pass the `VERSION` that `cli-tool-stamp-version` writes.
   */
  version?: string
  /**
   * Runs before `--version`, `--where` and `main`; a number is the exit code
   * and ends the run, null goes on. Pass `devlinkHook(spec)` from
   * `@osdlc/cli-tool/devlink` to run the tool from a development checkout, as
   * `way` and `sdlc` do.
   */
  devlink?: DevlinkHook
  /**
   * The script that is running, which `--where` reports. Defaults to
   * `process.argv[1]`. A devlink hook that names its own script (its
   * `describe` returns one) wins, so the file and the checkout come from one
   * path.
   * @experimental
   */
  script?: string
  /**
   * The binary that is running, which `--where` reports in place of a
   * bun-compiled binary's virtual script path. Defaults to `process.execPath`.
   * @experimental
   */
  execPath?: string
}

/**
 * What {@link RunMainOptions.devlink} takes: answer `dev`, or hand the run to
 * another checkout, and return its exit code; null runs this process's `main`.
 * A plain function is one.
 */
export interface DevlinkHook {
  (argv: readonly string[], ctx: CliContext): number | null
  /**
   * After the hook returned null: where this process runs from and which
   * layer chose it, for `--where`. Null or absent leaves the `chosen by` line
   * out.
   */
  describe?: () => DevlinkWhere | null
}

/**
 * What a {@link DevlinkHook} tells `--where`.
 * @experimental
 */
export interface DevlinkWhere {
  /** The tool's checkout the running script belongs to, or null for an install. */
  checkout: string | null
  /**
   * The layer that chose this process. `env`, `cwd` or `link` when a launcher
   * handed off to it, `local` when a bash launcher ran its own checkout, and
   * `self` when no hand-off happened. Another value is a launcher's own.
   */
  layer: string
  /** The `chosen by` line, in plain words. */
  text: string
  /** For the `link` layer: the link file that named the checkout. */
  linkFile?: string
  /**
   * The script the hook found `checkout` from. `--where` reports it as the
   * file in place of {@link RunMainOptions.script}; it is not printed itself.
   */
  script?: string
}

/**
 * A tool's main function. It takes the arguments and the context and returns
 * the exit code, directly or in a promise.
 */
export type MainFn = (argv: readonly string[], ctx: CliContext) => number | Promise<number>

/** Run `main` and set the process's exit code from what it returns. */
export async function runMain(main: MainFn, options: RunMainOptions): Promise<void> {
  const ctx = options.context ?? processContext()
  const argv = options.argv ?? process.argv.slice(2)
  if (options.devlink !== undefined) {
    const code = options.devlink(argv, ctx)
    if (code !== null) {
      process.exitCode = code
      return
    }
  }
  if (options.version !== undefined && argv[0] === '--version') {
    ctx.io.stdout(`${options.name} ${options.version}\n`)
    process.exitCode = EXIT.ok
    return
  }
  if (argv[0] === '--where') {
    const described = options.devlink?.describe?.() ?? null
    const w = where({
      name: options.name,
      version: options.version,
      script: described?.script ?? options.script ?? process.argv[1],
      execPath: options.execPath ?? process.execPath,
      devlink: described,
    })
    ctx.io.stdout(argv.includes('--json') ? `${JSON.stringify(w)}\n` : renderWhere(w))
    process.exitCode = EXIT.ok
    return
  }
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
    ctx.io.stderr(renderError(message, options.name))
    process.exitCode = EXIT.error
  }
}
