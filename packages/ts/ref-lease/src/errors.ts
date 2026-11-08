/**
 * The errors this package throws. Every one extends {@link RefLeaseError}, so a
 * caller can catch the whole family with one `instanceof` and branch on the
 * subclass, or on `kind`, for the cases it handles.
 *
 * `kind` is a stable string. It keeps the same spelling in every
 * implementation of the protocol, so a test that compares outcomes across
 * languages compares `kind`, never a message.
 */

/**
 * Every `kind` a {@link RefLeaseError} can carry. `other` is the base class's
 * own kind, for an error a caller raises from its own lease logic.
 */
export type RefLeaseErrorKind =
  | 'cas-failed'
  | 'ref-not-found'
  | 'namespace-conflict'
  | 'git-failed'
  | 'payload-unreadable'
  | 'other'

/**
 * The base of every error this package throws. A caller may also throw it, or
 * extend it, for failures of its own lease logic; those carry kind `other`.
 */
export class RefLeaseError extends Error {
  readonly kind: RefLeaseErrorKind = 'other'
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RefLeaseError'
  }
}

/** Fields of a {@link CasFailed}. */
export interface CasFailedInit {
  /** The ref the compare-and-swap targeted. */
  ref: string
  /** The sha the write expected the ref to hold; `null` for a create. */
  expectedSha: string | null
  /** The sha the ref was found at, when known. */
  actualSha?: string | null
  /** Replaces the default message. */
  message?: string
}

/**
 * A compare-and-swap lost: the ref was not at the expected sha (or, for a
 * create, already existed). Another writer moved it first. The caller fetches
 * the ref again and decides whether to retry.
 */
export class CasFailed extends RefLeaseError {
  override readonly kind = 'cas-failed'
  readonly ref: string
  readonly expectedSha: string | null
  readonly actualSha: string | null
  constructor(init: CasFailedInit) {
    const actualSha = init.actualSha ?? null
    super(
      init.message ??
        `CAS failed on ref ${JSON.stringify(init.ref)}: ` +
          `expected_sha=${JSON.stringify(init.expectedSha)} ` +
          `actual_sha=${JSON.stringify(actualSha)}`,
    )
    this.name = 'CasFailed'
    this.ref = init.ref
    this.expectedSha = init.expectedSha
    this.actualSha = actualSha
  }
}

/** Fields of a {@link RefNotFound}. */
export interface RefNotFoundInit {
  /** The ref that does not exist at the authority. */
  ref: string
  /** Replaces the default message. */
  message?: string
}

/** A fetch asked for a ref the authority does not have. */
export class RefNotFound extends RefLeaseError {
  override readonly kind = 'ref-not-found'
  readonly ref: string
  constructor(init: RefNotFoundInit) {
    super(init.message ?? `ref not found: ${JSON.stringify(init.ref)}`)
    this.name = 'RefNotFound'
    this.ref = init.ref
  }
}

/** Fields of a {@link NamespaceConflict}. */
export interface NamespaceConflictInit {
  /** The literal ref that blocks the namespace, such as `refs/locks`. */
  ref: string
  /** The sha that ref points at. */
  sha?: string | null
  /** What the reader should do; appended to the default message. */
  remediation?: string | null
  /** Replaces the default message. */
  message?: string
}

/**
 * The authority holds a literal ref at the namespace path itself (`refs/locks`),
 * and git cannot store a ref at a path and refs under it at once. Every create
 * under the namespace would fail with a git plumbing error.
 */
export class NamespaceConflict extends RefLeaseError {
  override readonly kind = 'namespace-conflict'
  readonly ref: string
  /** `ref` without its `refs/` prefix. */
  readonly namespace: string
  readonly sha: string | null
  readonly remediation: string | null
  constructor(init: NamespaceConflictInit) {
    const sha = init.sha ?? null
    const remediation = init.remediation ?? null
    super(
      init.message ??
        `namespace conflict: a literal ref at ${init.ref} blocks creation of ${init.ref}/...` +
          (sha === null ? '' : ` (sha=${sha})`) +
          (remediation ? `; ${remediation}` : ''),
    )
    this.name = 'NamespaceConflict'
    this.ref = init.ref
    this.namespace = init.ref.startsWith('refs/') ? init.ref.slice('refs/'.length) : init.ref
    this.sha = sha
    this.remediation = remediation
  }
}

/** Fields of a {@link GitFailed}. */
export interface GitFailedInit {
  /** The protocol operation that ran git, such as `CAS-CREATE` or `FETCH-REF`. */
  op: string
  /** git's exit code; `null` when it never reported one. */
  exitCode: number | null
  /** git's stderr, or the spawn error when git did not run. */
  stderr: string
  message: string
  /**
   * The classified failure from `@osdlc/typed-git`, when git ran through it: its
   * `kind` tells an unreachable remote from an authentication or TLS failure.
   */
  cause?: unknown
}

/**
 * git failed for a reason that is not a lost compare-and-swap or a missing ref:
 * the authority is unreachable, a hook declined the push, the URL is bad, a ref
 * path clashes. Retrying will not help until the cause is fixed.
 */
export class GitFailed extends RefLeaseError {
  override readonly kind = 'git-failed'
  readonly op: string
  readonly exitCode: number | null
  readonly stderr: string
  constructor(init: GitFailedInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'GitFailed'
    this.op = init.op
    this.exitCode = init.exitCode
    this.stderr = init.stderr
  }
}

/** Fields of a {@link PayloadUnreadable}. */
export interface PayloadUnreadableInit {
  ref: string
  /** The lease commit that was read. */
  sha: string
  message: string
  cause?: unknown
}

/**
 * The ref exists, but its commit holds no payload file, or the payload is not
 * JSON. A decode function's own error is not wrapped in this: it propagates as
 * thrown.
 */
export class PayloadUnreadable extends RefLeaseError {
  override readonly kind = 'payload-unreadable'
  readonly ref: string
  readonly sha: string
  constructor(init: PayloadUnreadableInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'PayloadUnreadable'
    this.ref = init.ref
    this.sha = init.sha
  }
}
