/**
 * `@osdlc/repo-cleaner` — what has been merged into the default branch, and
 * what can go away.
 *
 * `sweep` inventories worktrees, local branches and remote branches across
 * one repository or many, and judges each row: `delete`, `review`, `keep` or
 * `blocked`, with the risks its deletion carries and the evidence behind it.
 * The sweep deletes nothing. `plan` saves the rows and their evidence;
 * `check` resolves a person's approval against a plan and shows the steps a
 * run would take; `run` takes them, compare-and-swap, verifying each.
 *
 * A host that knows more than git does (an issue tracker, say) passes
 * `annotate` to re-rank the rows, rather than reaching into classification,
 * which is why every row carries its evidence and why `notes` is a list.
 */

export { sweep, inspectWorktree, type Runners, type SweepOptions } from './sweep.ts'
export {
  PLAN_VERSION,
  plan,
  readPlan,
  writePlan,
  type Plan,
  type PlanRepo,
  type PlanRow,
} from './plan.ts'
export {
  check,
  run,
  type Allow,
  type Approval,
  type CheckOptions,
  type Preview,
  type ResolvedApproval,
  type Resolved,
  type RunOptions,
} from './clean.ts'
export {
  RECEIPT_VERSION,
  ReceiptSchema,
  type DropReason,
  type Dropped,
  type Receipt,
  type Step,
} from './receipt.ts'
export { render, type RunSummary, type Style } from './render.ts'
export { defaultProcessProbe, type ProcessHolder, type ProcessProbe } from './processes.ts'
export { providers, type PrProvider, type ProviderChoice } from './providers/index.ts'
export type { Annotate } from './hooks.ts'
export {
  KINDS,
  RISKS,
  RepoCleanerError,
  type Action,
  type Blocker,
  type BranchEvidence,
  type BranchRow,
  type Bucket,
  type Counts,
  type ErrorCode,
  type Kind,
  type LandingEvidence,
  type PrEvidence,
  type RemoteEvidence,
  type RemoteRow,
  type RepoInfo,
  type RepoSweep,
  type Risk,
  type Row,
  type RowId,
  type SubmoduleEvidence,
  type Sweep,
  type SweepProgress,
  type SweptWith,
  type Verdict,
  type WorktreeEvidence,
  type WorktreeRow,
} from './types.ts'
