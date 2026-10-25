/**
 * The GitHub model, typed.
 *
 * `gh` returns GraphQL-shaped JSON whose fields depend on what you asked for.
 * So every field here always has a value: a real one, or the value that means
 * "not known". Absent and unknowable are the same answer to a caller. Giving
 * them one value keeps a caller from reading a field it never requested as a
 * fact.
 *
 * Most enums are open on purpose. GitHub adds members, and a client that
 * crashes on an unknown one is worse than a client that passes it on. Unions
 * end in `(string & {})`, so a new value still types as the enum and the known
 * members keep their autocomplete.
 *
 * Two are closed: {@link MergeableState} and {@link ReviewDecision}. Callers
 * compare them member by member to decide whether to merge, so the parser
 * maps a value it does not know to `UNKNOWN` or `null` instead of passing it
 * on.
 */

/**
 * Can this PR merge? `UNKNOWN` also covers "GitHub has not computed it yet".
 * Closed: a value the parser does not know reads as `UNKNOWN`.
 */
export type MergeableState = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'

/**
 * The merge-button state.
 *
 * `BEHIND` appears only when branch protection requires an up-to-date branch.
 * Without that rule, a branch a hundred commits behind still reports `CLEAN`.
 * So `BEHIND` is a hint that a branch is out of date, not a measure of it.
 * Compute that from the commit graph.
 */
export type MergeStateStatus =
  | 'BEHIND'
  | 'BLOCKED'
  | 'CLEAN'
  | 'DIRTY'
  | 'DRAFT'
  | 'HAS_HOOKS'
  | 'UNKNOWN'
  | 'UNSTABLE'
  | (string & {})

/** Where a pull request is in its life: open, closed without a merge, or merged. */
export type PullRequestState = 'OPEN' | 'CLOSED' | 'MERGED' | (string & {})

/**
 * The review state branch protection reads: approved, changes requested, or a
 * review still required. `null` when there is no decision, or the repository
 * requires no review. Closed: a value the parser does not know reads as `null`.
 */
export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

/** The state of one review. `PENDING` is a review its author has not submitted yet. */
export type ReviewState =
  'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING' | (string & {})

/** Who wrote something. `login` is normalized: a `[bot]` suffix is stripped. */
export interface Actor {
  login: string
  /** True when GitHub marks the account as a bot, or the login carried `[bot]`. */
  isBot: boolean
}

/** A repository label. `color` is hex digits such as `d73a4a`. A field the payload lacks is `''`. */
export interface Label {
  name: string
  color: string
  description: string
}

/**
 * A GitHub issue, from `gh issue list`/`gh issue view --json
 * number,title,body,labels,state`. It has a small field set on purpose,
 * because nothing here reads reviews, checks or comments on an issue.
 */
export interface IssueRow {
  number: number
  title: string
  body: string
  labels: Label[]
  state: string
}

/**
 * How a finished check ended, as GitHub reports it. Null while the check is
 * still running, and always null for a legacy status context. Read
 * {@link CheckRun.verdict} for one answer that covers both node types.
 */
export type CheckConclusion =
  | 'SUCCESS'
  | 'FAILURE'
  | 'NEUTRAL'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'ACTION_REQUIRED'
  | 'SKIPPED'
  | 'STALE'
  | 'STARTUP_FAILURE'
  | (string & {})
  | null

/** One check from the status rollup, with GitHub's two node types mapped to one shape. */
export interface CheckRun {
  /** A CheckRun's `name`, or a legacy StatusContext's `context`. */
  name: string
  /** `QUEUED` / `IN_PROGRESS` / `COMPLETED`. Null for a status context. */
  status: string | null
  conclusion: CheckConclusion
  /**
   * The normalized verdict. A check still running is `pending`, not a pass.
   * If "no failure yet" counted as green, a red build could merge.
   */
  verdict: 'pending' | 'success' | 'failure' | 'neutral'
  /** A CheckRun's `detailsUrl`, or a legacy StatusContext's `targetUrl`: where to read the log. Null when GitHub gives none. */
  url: string | null
}

/** One conversation comment on a pull request. */
export interface Comment {
  /**
   * GitHub's id for this comment, as a string: a GraphQL node id, or a REST id
   * turned into text. Null only when the payload omits it (`gh` always sends
   * one). A REST id of 2^53 or more loses precision when `gh` output is
   * parsed. Current ids are far below that.
   */
  id: string | null
  author: Actor | null
  body: string
  createdAt: string | null
}

/** One review on a pull request. */
export interface Review {
  /** Same as {@link Comment.id}. A REST id of 2^53 or more loses precision when `gh` output is parsed. */
  id: string | null
  author: Actor | null
  body: string
  state: ReviewState
  submittedAt: string | null
}

/**
 * A pull request.
 *
 * Fields `gh` was not asked for come back at their "not known" value, so this
 * type is safe to build from any field subset. `number` is the only field
 * without one. A payload with no number is not a PR, and parsing returns null.
 */
export interface PullRequest {
  number: number
  state: PullRequestState
  title: string
  body: string
  url: string
  isDraft: boolean
  baseRefName: string
  headRefName: string
  /** Head commit sha, when requested. Use it as the expected value for `--force-with-lease`. */
  headRefOid: string | null
  /**
   * True when the head branch is in a fork. Its ref is then not on the
   * base repository's `origin`. Fetch `refs/pull/<n>/head` instead.
   */
  isCrossRepository: boolean
  mergeable: MergeableState
  mergeStateStatus: MergeStateStatus
  reviewDecision: ReviewDecision
  author: Actor | null
  labels: Label[]
  checks: CheckRun[]
  comments: Comment[]
  reviews: Review[]
  mergedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** A repository coordinate. */
export interface OwnerRepo {
  owner: string
  repo: string
}

/** Who can see a repository. */
export type RepositoryVisibility = 'PUBLIC' | 'PRIVATE' | 'INTERNAL' | (string & {})

/**
 * A repository, from `gh repo list`/`gh repo view --json`. A field not asked
 * for comes back at its "not known" value. `nameWithOwner` is the only field
 * without one: a row without it is dropped.
 */
export interface Repository {
  /** `owner/name`, in GitHub's casing. */
  nameWithOwner: string
  /**
   * Cut from `nameWithOwner`, so in GitHub's casing, not as the caller wrote
   * it: `repoList('ACME')` gives `owner: 'acme'` when the account is `acme`.
   */
  owner: string
  /** Cut from `nameWithOwner`, so in GitHub's casing. */
  name: string
  description: string
  /** The default branch. Null when not asked for, or when the repository is empty. */
  defaultBranch: string | null
  visibility: RepositoryVisibility | null
  isArchived: boolean
  url: string
}

/**
 * One pull request found by `gh search prs`. Search has its own field set.
 * It names the repository but carries no head or base branch, so this is not
 * a {@link PullRequest}. `state` is upper-cased to match `PullRequest`.
 */
export interface PrSearchHit {
  number: number
  title: string
  state: PullRequestState
  url: string
  isDraft: boolean
  repository: OwnerRepo | null
  author: Actor | null
  labels: Label[]
  createdAt: string | null
  updatedAt: string | null
  closedAt: string | null
}
