import { isCommandFailed, type CommandFailed } from '@osdlc/command-seam'

/**
 * The one failure type a diffkit command shows as a message, not a stack.
 */
export class DiffkitError extends Error {
  /** True when the command line, not the repository, was at fault; the CLI then exits with the usage code. */
  readonly usage: boolean
  constructor(message: string, usage = false) {
    super(message)
    this.usage = usage
  }
}

/**
 * The `CommandFailed` behind a thrown failure: a bare `CommandFailed`, or the
 * `cause` of the `FailureError` typed-git and typed-gh throw. Recognised by
 * shape, not `instanceof`.
 */
export function commandFailedOf(e: unknown): CommandFailed | null {
  if (isCommandFailed(e)) return e
  const cause =
    typeof e === 'object' && e !== null
      ? (e as { failure?: { cause?: unknown } }).failure?.cause
      : null
  return isCommandFailed(cause) ? cause : null
}
