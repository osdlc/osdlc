/**
 * The shell runner: the one place in this package that runs a shell string.
 *
 * Every other runner passes argv straight to a binary, so nothing is parsed
 * as shell. A configured command such as `bun install --filter '@x/y'` or
 * `a && b` is a shell string by nature, and it runs as `sh -c -- <verb>`.
 * Keeping that call in one place makes shell use easy to find and audit, and
 * keeps the invocation the same everywhere.
 *
 * Built on the capture runners, so it uses their types
 * ({@link CommandResult}, {@link CommandRunOptions}, `CommandFailed`) and
 * their timeout, env and stdin handling.
 */

import { spawnRunnerAsync, type AsyncCommandRunner, type AsyncCommandRunOptions } from './async.ts'
import {
  normalizeTimeout,
  spawnRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from './sync.ts'

/**
 * Positional parameters for the verb. They ride as separate argv entries,
 * never spliced into the string, so they are inert data.
 */
export interface ShellPositionals {
  /** Sets `$0`, the name the script sees for itself, used in its error messages. Default `sh`. */
  scriptName?: string | undefined
  /** Visible to the script as `$1`, `$2`, … */
  args?: readonly string[] | undefined
}

/** {@link CommandRunOptions} plus {@link ShellPositionals}. */
export interface ShellRunOptions extends CommandRunOptions, ShellPositionals {}

/** {@link ShellPositionals} plus the async runner's options. */
export interface AsyncShellRunOptions extends AsyncCommandRunOptions, ShellPositionals {}

/** Runs a shell string. `verb` is interpreted by `sh`, so quote data with `shellQuote`. */
export interface ShellRunner {
  run(verb: string, opts: ShellRunOptions): CommandResult
}

/**
 * The async version of {@link ShellRunner}.
 *
 * @experimental
 */
export interface AsyncShellRunner {
  run(verb: string, opts: AsyncShellRunOptions): Promise<CommandResult>
}

/**
 * The `sh -c -- <verb>` argv; `$0`/`$1…` are appended only when given. The
 * `--` keeps a verb that starts with `-` or `+` from being read as an option.
 */
function shellArgv(
  verb: string,
  scriptName: string | undefined,
  args: readonly string[] | undefined,
): string[] {
  const rest = args ?? []
  if (scriptName === undefined && rest.length === 0) return ['-c', '--', verb]
  return ['-c', '--', verb, scriptName ?? 'sh', ...rest]
}

/**
 * A {@link ShellRunner} over `sh`. Pass `sh` to run through a different
 * {@link CommandRunner}, such as a test fake. An invalid `timeoutMs` throws
 * before `sh` is called, as it does on the capture runners.
 *
 * @param sh - The runner that receives `['-c', '--', verb]`, then
 * `scriptName` and `args` when given. Defaults to `spawnRunner('sh')`.
 */
export function shellRunner(sh: CommandRunner = spawnRunner('sh')): ShellRunner {
  return {
    run: (verb, { scriptName, args, ...opts }) => {
      normalizeTimeout(opts.timeoutMs)
      return sh.run(shellArgv(verb, scriptName, args), opts)
    },
  }
}

/**
 * The async version of {@link shellRunner}. Wrap a sync fake with `asAsync`
 * to pass it in. An invalid `timeoutMs` rejects before `sh` is called.
 *
 * @param sh - The runner that receives `['-c', '--', verb]`, then
 * `scriptName` and `args` when given. Defaults to `spawnRunnerAsync('sh')`.
 * @experimental
 */
export function shellRunnerAsync(
  sh: AsyncCommandRunner = spawnRunnerAsync('sh'),
): AsyncShellRunner {
  return {
    run: async (verb, { scriptName, args, ...opts }) => {
      normalizeTimeout(opts.timeoutMs)
      return sh.run(shellArgv(verb, scriptName, args), opts)
    },
  }
}

/**
 * Run `verb` once through `sh -c --` and capture the result. Needs `sh` on
 * `PATH`. Never throws for a failed command, like `spawnRunner`; programmer
 * errors such as an invalid `timeoutMs` throw.
 *
 * @param verb - A shell string. Quote any data in it with `shellQuote`, or
 * pass it through `args`.
 * @param opts - The capture options plus `scriptName` (`$0`) and `args` (`$1`…).
 * @returns The captured result.
 *
 * @example
 * ```ts
 * const r = runShell('ls "$1" | wc -l', { cwd: '.', args: ['my dir'] })
 * console.log(r.stdout.trim())
 * ```
 */
export function runShell(verb: string, opts: ShellRunOptions): CommandResult {
  return shellRunner().run(verb, opts)
}

/**
 * The async version of {@link runShell}. Never rejects for a failed command;
 * rejects for programmer errors such as an invalid `timeoutMs`.
 */
export function runShellAsync(verb: string, opts: AsyncShellRunOptions): Promise<CommandResult> {
  return shellRunnerAsync().run(verb, opts)
}
