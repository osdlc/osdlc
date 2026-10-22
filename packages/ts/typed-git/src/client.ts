/**
 * `@osdlc/typed-git/client` — the git clients and their seams, without the
 * git-reference parsers and the checkout walks.
 *
 * The package entry minus two groups. The first is `parseGitUrl`,
 * `gitSshUrl`, `parseRepoRef` and their types, which pull in
 * `hosted-git-info`. The second is the checkout walks: `checkoutRoot`,
 * `discoverCheckouts`, `scanForCheckouts`, their types and their defaults. A
 * consumer that only drives git — a runner discovery pass, a guard script —
 * imports from here and keeps `hosted-git-info` off its module graph. It stays
 * in `dependencies` either way, so this is a bundle saving, not an install
 * one.
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

export { classifyGitFailure, type GitFailure, type GitFailureKind } from './failure.ts'
export { type Soft, type TriedAsync, type TriedSync } from './outcome.ts'

export {
  forceWithLeaseArg,
  parseRefRows,
  REF_FORMAT,
  type AddOptions,
  type AheadBehind,
  type CheckoutOptions,
  type CleanOptions,
  type CloneOptions,
  type CommitFlags,
  type CommitOptions,
  type ConfigGetOptions,
  type ConfigScope,
  type ConfigSetOptions,
  type ConflictSide,
  type DiffCheckOptions,
  type DiffCheckResult,
  type DiffEntry,
  type DiffNameOnlyOptions,
  type DiffNameStatusOptions,
  type DiffStatOptions,
  type DiffTextOptions,
  type DiffTreeOptions,
  type FetchOptions,
  type ForEachRefOptions,
  type ForceLease,
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
  type RemoteGetUrlOptions,
  type RemoteRef,
  type StatusEntry,
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
