/**
 * `@osdlc/repo-cleaner` — what has been merged into the default branch, and
 * what can go away.
 *
 * Point it at a repository and it inventories the local branches, worktrees
 * and remote branches, classifying each as safe-to-delete, safe-to-keep or
 * needs-investigation, with the evidence behind the verdict and the literal
 * command that would act on it. The sweep never deletes anything; `applyPlan`
 * deletes the rows of a plan a person approved.
 *
 * Two signals settle most items — a merged pull request, and ancestry of the
 * default branch — and either alone is enough. A host that knows more than
 * git does (an issue tracker, say) re-ranks the returned rows
 * rather than reaching into classification, which is why every row carries
 * its facts and why `investigationParts` is a list rather than a sentence.
 */

export {
  classifyLocalBranch,
  classifyRemoteBranch,
  gatherLocalBranches,
  gatherRemoteBranches,
  localDeleteCommand,
  remoteDeleteCommand,
  resolveBranch,
} from './branches.ts'
export {
  classifyWorktree,
  gatherWorktrees,
  hasBlockers,
  worktreePruneCommand,
  worktreeRemoveCommand,
  worktreeUnlockCommand,
  type WorktreeBlocker,
} from './worktrees.ts'
export { DiscoveryFailed, discoverRepo } from './discover.ts'
export {
  ApplyArgumentError,
  applyPlan,
  parseGrant,
  parseRowRef,
  type ApplyOptions,
  type Grant,
} from './apply.ts'
export type { Annotate, HostHooks } from './hooks.ts'
export {
  PLAN_VERSION,
  PlanReadError,
  planRepo,
  readPlan,
  stampedPath,
  writePlan,
  type Plan,
  type PlanRepo,
  type PlannableRow,
} from './plan.ts'
export { ReceiptSchema, type Dropped, type Receipt, type RowRef, type Step } from './receipt.ts'
export {
  defaultProcessProbe,
  isIdleShell,
  parseLockOwner,
  parseLsofCwd,
  type DefaultProbeOptions,
  type LockOwner,
  type ProcessHolder,
  type ProcessProbe,
} from './processes.ts'
export { fetchPrs } from './prs.ts'
export {
  expandTilde,
  isCheckoutRoot,
  resolveEntries,
  type Resolution,
  type ResolveOptions,
} from './resolve.ts'
export { sweepRepo, sweepRepos, type SweepOptions, type SweepReposOptions } from './sweep.ts'
export {
  proposedCommands,
  renderJson,
  renderReceipt,
  renderRepo,
  renderScan,
  renderSummary,
  renderText,
  requiresNote,
} from './render.ts'
export {
  CONFIG_ENV,
  DEFAULT_CONFIG,
  RepoCleanerConfigSchema,
  TOOL,
  clearConfigCache,
  configPath,
  configuredRepos,
  loadConfig,
  type RepoCleanerConfig,
} from './config.ts'
export {
  ALL_SCOPES,
  AUTHORIZATIONS,
  authorizationsFor,
  emptyBucket,
  emptyScan,
  findDuplicateCheckouts,
  isUnfetched,
  makeItem,
  summarize,
  type Authorization,
  type Category,
  type Classification,
  type DuplicateCheckout,
  type PRInfo,
  type RepoInfo,
  type RepoSweep,
  type ScanStats,
  type Scope,
  type SummaryBucket,
  type SweepItem,
  type SweepResult,
  type UnresolvedEntry,
} from './types.ts'
