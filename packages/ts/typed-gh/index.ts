/**
 * `@osdlc/typed-gh` — a typed GitHub client for TypeScript, over the `gh`
 * CLI. The GitHub-side twin of `@osdlc/typed-git`.
 *
 * Three things it is:
 *
 *   - **A model.** `PullRequest`, `Review`, `CheckRun` and their enums, so a
 *     caller stops reading `payload["mergeable"] as string | undefined`. Every
 *     field is total: one a query did not ask for lands at its "not known"
 *     value, because absent and unknowable are the same answer.
 *   - **Pure argv builders and parsers.** The verb table and `parse.ts` never
 *     spawn anything, so an async fan-out drives them through its own runner
 *     without duplicating a line of parsing.
 *   - **A client.** `Gh`, tri-modal like `Git`: queries return parsed values
 *     and never throw, mutations throw `CommandFailed`, `raw` is the hatch.
 *
 * Authentication is `gh`'s. No token is read, stored, or forwarded.
 */

export { AsyncGh } from './async.ts'

export { Gh, defaultRunnerFactory, type RunnerFactory } from './sync.ts'

export {
  api,
  authStatus,
  createPr,
  editPr,
  editPrBody,
  issueList,
  issueView,
  labelCreate,
  labelEdit,
  labelList,
  needsMergeStateRetry,
  openPrsForBranch,
  pickPrForBranch,
  prBody,
  prComment,
  prSetDraft,
  issueCommentEdit,
  prDiff,
  prList,
  prMerge,
  prReviewThreads,
  prUpdateBranch,
  prView,
  reviewCreate,
  setIssueLabel,
  version,
  PR_LIST_FIELDS,
  PR_REF_FIELDS,
  PR_VIEW_FIELDS,
  type ApiOptions,
  type ApiResponse,
  type AuthStatus,
  type CreateLabelOptions,
  type CreatePrOptions,
  type CreateReviewOptions,
  type GhVerb,
  type IssueListOptions,
  type PrListOptions,
  type PrMergeMethod,
  type ReviewComment,
  type ReviewThread,
} from './verbs.ts'

export {
  anyCheckFailed,
  normalizeAuthorLogin,
  parseActor,
  parseCheckRun,
  parsePullRequest,
  type PullRequestJson,
} from './parse.ts'

export { ownerRepoSlug, parseOwnerRepo, parsePrUrl, type PullRequestRef } from './repo.ts'

export type {
  Actor,
  CheckConclusion,
  CheckRun,
  Comment,
  IssueRow,
  Label,
  MergeableState,
  MergeStateStatus,
  OwnerRepo,
  PullRequest,
  PullRequestState,
  Review,
  ReviewDecision,
  ReviewState,
} from './types.ts'

// The subprocess seam is re-exported so a caller wiring a runner or catching a
// failure needs one import, not two.
export {
  CommandFailed,
  asAsync,
  runChecked,
  runCheckedAsync,
  spawnRunner,
  spawnRunnerAsync,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '@osdlc/command-seam'
