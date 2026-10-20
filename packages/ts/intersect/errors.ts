/**
 * The error class every `@osdlc/intersect` entry point throws for a failure it
 * understands. Callers branch on `code`, not on the message text.
 */

/** Why an {@link IntersectError} was thrown. */
export type IntersectErrorCode =
  /** Two entries given to `index` share an `id`. */
  | 'DUPLICATE_REGISTRY_ID'
  /** A pattern nests `{` groups more than 64 deep. */
  | 'PATTERN_TOO_DEEP'
  /** A pattern uses syntax this package does not support (see the README). */
  | 'UNSUPPORTED_SYNTAX'
  /** An argument has the wrong type, for example a number where a pattern is expected. */
  | 'INVALID_ARGUMENT'
  /** `./fs` could not read the disk: a missing or non-directory `cwd`, or an unreadable directory. */
  | 'IO_ERROR'

/** An error with a stable, machine-readable {@link IntersectError.code}. */
export class IntersectError extends Error {
  /** What went wrong. The set is part of the public API; the message is not. */
  readonly code: IntersectErrorCode

  constructor(code: IntersectErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'IntersectError'
    this.code = code
  }
}
