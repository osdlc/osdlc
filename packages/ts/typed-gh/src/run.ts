/**
 * `runVerb` and `runVerbAsync` — run one {@link GhVerb} through a runner the
 * caller owns, with everything the verb asks for applied.
 *
 * A verb carries more than `argv`: `input` (a payload on stdin), `env` (the
 * target host as `GH_HOST`), and `checked` (whether a non-zero exit throws).
 * `verb.parse(await runner.run(verb.argv))` drops the first two without a
 * word, so a query goes to github.com and a review is never sent. These two
 * apply all of it, as `Gh` and `AsyncGh` do; both clients call them.
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
  /** Aborts the call; the runner stops the child. */
  signal?: AbortSignal | undefined
}

/**
 * Run `verb` through `runner` and return its parsed value, honouring the
 * verb's `input`, `env`, `timeoutMs` and `checked`, and its checked or
 * unchecked contract: a failed `gh` throws a `FailureError` carrying the
 * classified `GhFailure`, output that cannot be read throws one of kind
 * `unreadable`, and a query for one thing answers `null` when GitHub says
 * there is no such thing.
 *
 * A plain `(binary, argv, opts) => result` function is not a runner: wrap it
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

/** {@link runVerb} for an `AsyncCommandRunner`; rejects where that throws. */
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
