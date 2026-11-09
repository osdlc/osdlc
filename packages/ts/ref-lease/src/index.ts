/**
 * Compare-and-swap leases on git refs. A lease is a ref whose commit holds a
 * JSON payload; every write is a `git push --force-with-lease`, so the
 * authority, any git remote, decides who wins a race.
 */

export {
  casCreate,
  casDelete,
  casReplace,
  DEFAULT_PAYLOAD_FILE,
  fetchNamespace,
  fetchRef,
  type CasOptions,
  type FetchedRef,
  type FetchRefOptions,
  type MirrorSkip,
} from './primitives.ts'
export {
  buildLeaseCommit,
  DEFAULT_IDENTITY,
  DETERMINISTIC_EPOCH,
  type BuildLeaseCommitOptions,
  type LeaseIdentity,
} from './commit.ts'
export { checkNamespaceConflict, type CheckNamespaceConflictOptions } from './guard.ts'
export { canonicalJson } from './canonical-json.ts'
export {
  CasFailed,
  GitFailed,
  NamespaceConflict,
  PayloadUnreadable,
  RefLeaseError,
  RefNotFound,
  type CasFailedInit,
  type GitFailedInit,
  type NamespaceConflictInit,
  type PayloadUnreadableInit,
  type RefLeaseErrorKind,
  type RefNotFoundInit,
} from './errors.ts'
export { type GitOptions } from './git.ts'
