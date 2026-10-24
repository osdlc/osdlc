/**
 * `runVerb` and `runVerbAsync` run one {@link GhVerb} through a runner the
 * caller owns, with everything the verb asks for applied.
 *
 * A verb carries more than `argv`: `input` (a payload on stdin), `env` (the
 * target host as `GH_HOST`), and `checked` (whether a non-zero exit throws).
 * `verb.parse(await runner.run(verb.argv))` drops the first two with no
 * error, so a query goes to github.com and a review is never sent. These two
 * functions apply all of it. `Gh` and `AsyncGh` call them too.
 */

import type {
  AsyncCommandRunner,
  AsyncCommandRunOptions,
  CommandRunner,
  CommandRunOptions,
} from '@osdlc/command-seam'

import { runCheckedGh, runCheckedGhAsync, settle } from './doors.ts'
import type { GhVerb } from './verbs.ts'

/** What a verb run is given besides the verb: the directory and the cap on the call. */
export interface RunVerbOptions {
  cwd: string
  /** Hard cap on the call, as in command-seam. */
  timeoutMs?: number | undefined
}

/** {@link RunVerbOptions} for {@link runVerbAsync}, with the abort signal. */
export interface RunVerbAsyncOptions extends RunVerbOptions {
  /** Aborts the call. The runner stops the child process. */
  signal?: AbortSignal | undefined
}

/**
 * Run `verb` through `runner` and return its parsed value. It applies the
 * verb's `input`, `env` and `checked`, and the `timeoutMs` option. A failed
 * `gh` throws a `FailureError` carrying the classified `GhFailure`. Output
 * that cannot be read throws one of kind `unreadable`. A query for one thing
 * returns `null` when GitHub says there is no such thing.
 *
 * A plain `(binary, argv, opts) => result` function is not a runner. Wrap it
 * as `{ run: (argv, opts) => fn('gh', argv, opts) }`.
 */
export function runVerb<T>(verb: GhVerb<T>, runner: CommandRunner, opts: RunVerbOptions): T {
  const run: CommandRunOptions = { cwd: opts.cwd }
  if (verb.input !== undefined) run.input = verb.input
  if (verb.env !== undefined) run.env = verb.env
  if (opts.timeoutMs !== undefined) run.timeoutMs = opts.timeoutMs
  const result = verb.checked ? runCheckedGh(runner, verb.argv, run) : runner.run(verb.argv, run)
  return settle(verb, result, runner.binary)
}

/** {@link runVerb} for an `AsyncCommandRunner`. It rejects where `runVerb` throws. */
export async function runVerbAsync<T>(
  verb: GhVerb<T>,
  runner: AsyncCommandRunner,
  opts: RunVerbAsyncOptions,
): Promise<T> {
  const run: AsyncCommandRunOptions = { cwd: opts.cwd }
  if (verb.input !== undefined) run.input = verb.input
  if (verb.env !== undefined) run.env = verb.env
  if (opts.timeoutMs !== undefined) run.timeoutMs = opts.timeoutMs
  if (opts.signal !== undefined) run.signal = opts.signal
  const result = verb.checked
    ? await runCheckedGhAsync(runner, verb.argv, run)
    : await runner.run(verb.argv, run)
  return settle(verb, result, runner.binary)
}
