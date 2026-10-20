/**
 * `@osdlc/typed-git/client` — the git clients and their seams, without the
 * git-reference parser.
 *
 * Identical to the package entry minus `parseGitUrl` / `gitSshUrl`, which
 * pull in `hosted-git-info`. A consumer that only drives git — a runner
 * discovery pass, a guard script — imports from here and keeps that off its
 * module graph. It stays in `dependencies` either way, so this is a bundle
 * saving, not an install one.
 *
 * The package entry is defined as this module plus the URL exports, so there
 * is one definition of the surface rather than two lists to keep in step.
 */

export { Git, type GitSyncCallOptions } from './sync.ts'
export { AsyncGit } from './async.ts'
export { parseRemoteUrl, type RemoteCoordinate } from './remote-url.ts'

export {
  cliBackend,
  partialBackend,
  UnsupportedRequest,
  type GitBackend,
  type GitCallOptions,
  type GitRequest,
  type GitRequestKind,
  type GitResults,
} from './backend.ts'

export { type GitOutcome, type Soft, type TriedAsync, type TriedSync } from './outcome.ts'

export {
  forceWithLeaseArg,
  gate,
  parseRefRows,
  REF_FORMAT,
  type AddOptions,
  type AheadBehind,
  type CheckoutOptions,
  type CloneOptions,
  type CommitOptions,
  type ConfigSetOptions,
  type ConflictSide,
  type DiffEntry,
  type DiffNameOnlyOptions,
  type DiffNameStatusOptions,
  type DiffStatOptions,
  type DiffTreeOptions,
  type FetchOptions,
  type ForEachRefOptions,
  type ForceLease,
  type GitVerb,
  type GrepOptions,
  type InitOptions,
  type IntegrationOutcome,
  type LogOptions,
  type IgnoreMatch,
  type LsFilesOptions,
  type LsRemoteOptions,
  type LsTreeOptions,
  type MergeOptions,
  type MergeOutcome,
  type MergeTreeOptions,
  type MergeTreeOutcome,
  type NumstatEntry,
  type RebaseOptions,
  type RebaseOutcome,
  type RemoteRef,
  type StatusPorcelainOptions,
  type TaggedFile,
  type TreeEntry,
  type UnmergedEntry,
  type Worktree,
  type WorktreeMoveOptions,
} from './verbs.ts'

// The subprocess seam is re-exported so a caller wiring a runner or catching
// a failure needs one import, not two. `@osdlc/command-seam` is the package
// that owns these; it is usable on its own, without a git client.
export {
  asAsync,
  CommandFailed,
  runChecked,
  runCheckedAsync,
  spawnRunner,
  spawnRunnerAsync,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '@osdlc/command-seam'
