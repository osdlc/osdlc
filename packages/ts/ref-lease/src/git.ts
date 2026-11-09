/** Internal: the git client and failure reading shared by the operations. */

import { stderrOrError, type CommandResult } from '@osdlc/command-seam'
import { Git, type GitFailure } from '@osdlc/typed-git'

import { GitFailed } from './errors.ts'

/**
 * Where and how an operation runs git. `cwd` is the local repository, by
 * default `process.cwd()`: it holds the objects a push sends and the mirror
 * refs a fetch writes. `env` is merged over the process environment for every
 * git call, for settings such as `GIT_SSH_COMMAND`.
 */
export interface GitOptions {
  cwd?: string
  env?: Readonly<Record<string, string>>
}

export function client(opts: GitOptions): Git {
  return new Git(opts.cwd ?? process.cwd(), opts.env ? { env: { ...opts.env } } : undefined)
}

/**
 * git's messages in English whatever the user's locale, so the markers in
 * `classify.ts` match. typed-git's `push` sets this itself.
 */
export const C_LOCALE = { env: { LC_ALL: 'C' } } as const

/** git's own result for a failure, or one built from its message when git did not run. */
export function failureResult(failure: GitFailure): CommandResult {
  return (
    failure.cause?.result ?? {
      exitCode: failure.exitCode ?? 1,
      stdout: '',
      stderr: failure.message,
    }
  )
}

/**
 * The `GitFailed` for a git call that failed: `what` says which call, and the
 * message ends with git's exit code and stderr. `cause` keeps typed-git's
 * classified failure when there is one.
 */
export function gitFailed(
  op: string,
  what: string,
  res: Pick<CommandResult, 'exitCode' | 'stderr' | 'error'>,
  cause?: GitFailure,
): GitFailed {
  const stderr = stderrOrError(res)
  return new GitFailed({
    op,
    exitCode: res.exitCode,
    stderr,
    message: `${what}: exit=${res.exitCode} stderr=${JSON.stringify(stderr)}`,
    ...(cause === undefined ? {} : { cause }),
  })
}

/** `gitFailed` for a typed-git failure. */
export function gitFailedFrom(op: string, what: string, failure: GitFailure): GitFailed {
  return gitFailed(op, what, failureResult(failure), failure)
}

/** Block the thread for `ms` milliseconds, for a sync retry backoff. */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
