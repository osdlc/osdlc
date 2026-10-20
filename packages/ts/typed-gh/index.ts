/**
 * `@osdlc/typed-gh` — a typed GitHub client for TypeScript, over the `gh`
 * CLI. The GitHub-side companion of `@osdlc/typed-git`.
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

export { AsyncGh, type AsyncCallOptions, type AsyncGhOptions } from './async.ts'

export { Gh, defaultRunnerFactory, type GhOptions, type RunnerFactory } from './sync.ts'

export {
  api,
  authStatus,
  createPr,
  editPr,
  editPrBody,
  graphql,
  createLabel,
  createReview,
  editLabel,
  installed,
  issueList,
  issueView,
  labelList,
  nodesAt,
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
  repoList,
  repoView,
  searchPrs,
  setIssueLabel,
  PR_LIST_FIELDS,
  PR_REF_FIELDS,
  PR_VIEW_FIELDS,
  REPO_FIELDS,
  SEARCH_PR_FIELDS,
  type ApiOptions,
  type ApiResponse,
  type AuthStatus,
  type CreateLabelOptions,
  type CreatePrOptions,
  type CreateReviewOptions,
  type GhTarget,
  type GraphqlOptions,
  type GraphqlVariable,
  type GhVerb,
  type IssueListOptions,
  type ListResult,
  type PrListOptions,
  type PrMergeMethod,
  type RepoListOptions,
  type ReviewComment,
  type ReviewThread,
  type SearchPrsOptions,
} from './verbs.ts'

export { anyCheckFailed, normalizeAuthorLogin, parsePullRequest } from './parse.ts'

export {
  ownerRepoSlug,
  parseOwnerRepo,
  parsePrRef,
  parsePrUrl,
  type PrRef,
  type PullRequestRef,
} from './repo.ts'

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
  PrSearchHit,
  PullRequestState,
  Repository,
  RepositoryVisibility,
  Review,
  ReviewDecision,
  ReviewState,
} from './types.ts'

// The seam's error and runner types appear in this package's signatures, so
// they are re-exported. Its functions are not: import them from
// `@osdlc/command-seam`.
export {
  CommandFailed,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '@osdlc/command-seam'
