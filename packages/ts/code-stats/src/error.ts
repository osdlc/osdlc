import { failureOf } from '@osdlc/cli-tool'
import { classifyFailure, firstLine, stderrOrError, type CommandResult } from '@osdlc/command-seam'

/** Why a {@link CodeStatsError} was thrown: `bad-input`, `needs-git` or `failed`. */
export type CodeStatsErrorKind = 'bad-input' | 'needs-git' | 'failed'

/** A classified failure: a `kind` to branch on, a message and maybe a hint (`@osdlc/result`'s `Failure`). */
export type Failure = NonNullable<ReturnType<typeof failureOf>>

/**
 * A failure to show as a message rather than a stack. `bad-input` means the
 * request was at fault (a bad revision, an unknown change); `needs-git` that
 * it reads a git repository and git is not installed or there is no
 * repository here; `failed` that the repository or a command it ran failed.
 * `failure` is the classified failure behind it, when there is one: its kind
 * picks the CLI's exit code, and its hint says what to do.
 */
export class CodeStatsError extends Error {
  readonly kind: CodeStatsErrorKind
  readonly failure: Failure | null
  constructor(
    message: string,
    options: { kind?: CodeStatsErrorKind; cause?: unknown; failure?: Failure | null } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'CodeStatsError'
    this.kind = options.kind ?? 'failed'
    this.failure = options.failure ?? null
  }
}

/**
 * Runs `fn`, turning a failed `tool` command into a {@link CodeStatsError}
 * that carries the failure typed-git or typed-gh classified: `what`, then the
 * command's own first line of error when it ran, else why it could not run.
 * A git that is not installed is a `needs-git` error of its own.
 */
export function guardCommand<T>(what: string, fn: () => T, tool: 'git' | 'gh' = 'git'): T {
  try {
    return fn()
  } catch (e) {
    const failure = e instanceof CodeStatsError ? null : failureOf(e)
    if (failure === null) throw e
    if (tool === 'git' && failure.kind === 'not-installed') {
      throw new CodeStatsError('git is not installed, or not on PATH', {
        kind: 'needs-git',
        cause: e,
        failure,
      })
    }
    throw new CodeStatsError(`${what}: ${failure.message}`, { cause: e, failure })
  }
}

/**
 * The {@link CodeStatsError} for a run that `runFailed` rejected: `what`,
 * then why. That is the command's first line of error when it ran, else the
 * runner's reason, such as not installed, timed out or output cut short.
 */
export function commandError(
  what: string,
  result: CommandResult<string | Buffer>,
  binary = 'git',
): CodeStatsError {
  const failure = classifyFailure(result, { binary })
  const why =
    failure === null || failure.kind === 'exit'
      ? firstLine(stderrOrError(result), `exit ${result.exitCode}`)
      : failure.message
  return new CodeStatsError(`${what}: ${why}`, { failure })
}
