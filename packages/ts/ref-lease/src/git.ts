/** Internal: the git client and failure reading shared by the operations. */

import { stderrOrError, type CommandResult } from '@osdlc/command-seam'
import { Git, type GitFailure } from '@osdlc/typed-git'

/**
 * Where an operation runs git. Pass `git` to supply a client of your own (a
 * custom runner, extra environment such as `GIT_SSH_COMMAND`); otherwise a
 * client is made for `cwd`, which defaults to `process.cwd()`. The repository
 * is the local side of the protocol: it holds the objects a push sends and the
 * mirror refs a fetch writes.
 */
export interface GitOptions {
  cwd?: string
  git?: Git
}

export function client(opts: GitOptions): Git {
  return opts.git ?? new Git(opts.cwd ?? process.cwd())
}

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

/** git's stderr for a failure, or the spawn error when it printed nothing. */
export function failureStderr(failure: GitFailure): string {
  return stderrOrError(failureResult(failure))
}

/** Block the thread for `ms` milliseconds, for a sync retry backoff. */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export { stderrOrError }
