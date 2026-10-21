/**
 * The CodeHost port: what a code host (GitHub, Forgejo, ...) must answer so
 * a classifier or router never calls `gh` or a code host's REST API directly.
 * GitHub (`./github.ts`) and Forgejo (`./forgejo.ts`) are the adapters;
 * `listPrDetails` is the bulk read for a survey.
 *
 * The port was first sketched as `Forge`. Three deliberate choices, made once
 * here rather than re-argued at every call site:
 *
 *   - Every method is SYNCHRONOUS. Callers hold `CommandRunner`s over
 *     `spawnRunner` (`@osdlc/command-seam`) and are sync end to end; going
 *     async here would color the whole call graph for no caller that needs it.
 *   - `Activity` carries `id`/`editedAt` and a third `kind: 'review-comment'`
 *     (with an optional `location`) beside `comment | review`, so a caller can
 *     sign every feedback item by id and tell a per-line diff comment (GitHub's
 *     REST `pulls/<n>/comments`) from a top-level comment or review.
 *   - `PrFacts.behind`/`ahead` are assembled by `./facts.ts` from local git:
 *     drift is not a code-host field, so no adapter ever sets them.
 */

import { z } from 'zod'

import type { CommandRunner } from '@osdlc/command-seam'

export type CodeHostName = 'github' | 'forgejo'

/** One code host auth check a doctor command runs. */
export const AuthCheckSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
  fix: z.string().describe('One line to print when the check fails.'),
})
export type AuthCheck = z.infer<typeof AuthCheckSchema>

export interface CodeHostAuthCheckDeps {
  gh: CommandRunner
  env: NodeJS.ProcessEnv
  fetch?: typeof fetch
}

export interface Actor {
  login: string
  isBot: boolean
}

/**
 * One comment, review, or inline review comment newer than the `getPr`
 * caller's `since` cursor — unfiltered. The caller applies any
 * bot/self/recency filter, once, for every code host; this type carries only
 * what such a filter and a signature over the entry need.
 */
export interface Activity {
  /** A stable identity for the entry, suitable for signing or de-duplicating. */
  id: string
  kind: 'comment' | 'review' | 'review-comment'
  author: Actor | null
  /** Created/submitted timestamp. */
  at: string | null
  /** Last-edited timestamp, when the code host reports one; null when it doesn't track or wasn't asked for. */
  editedAt: string | null
  body: string
  /** Only set for `kind: 'review'` (e.g. `APPROVED`, `CHANGES_REQUESTED`). */
  reviewState: string | null
  /** Only set for `kind: 'review-comment'` — where in the diff it sits. */
  location: { file?: string; line?: number; threadId?: string; url?: string } | null
}

export interface CheckSummary {
  rollup: 'none' | 'pending' | 'success' | 'failure'
  /** Failing check names, in the code host's own rollup order. */
  failing: string[]
  /** Failing checks' log/details URLs, when the code host gives one — same order as `failing`, may be shorter (a check with no URL is skipped, not padded with undefined). */
  failingUrls: { name: string; url: string }[]
  /**
   * The subset of `failing` whose run never actually started — GitHub billed
   * or spending-limit-blocked the account, so the check reports
   * `conclusion: failure` with no steps, and the real reason ("The job was
   * not started because...") lives only in the check run's annotations
   * (`./github.ts`'s `detectBlockedChecks`, fetched only for checks
   * already known to be failing). A caller reads this to tell
   * an account-level block apart from a real code failure instead of
   * conflating the two. Always `[]` for a
   * code host with no such concept (Forgejo has no billing-block failure mode
   * documented) or when `failing` is empty (nothing to check).
   */
  blocked: string[]
}

export interface CodeHostPr {
  number: number
  url: string
  title: string
  state: 'open' | 'closed' | 'merged'
  isDraft: boolean
  author: Actor | null
  baseRef: string
  headRef: string
  headSha: string | null
  /** True when the head branch lives in a fork, not in the base repository. */
  headIsFork: boolean
  mergedAt: string | null
  mergeable: 'mergeable' | 'conflicting' | 'unknown'
  checks: CheckSummary
  reviewDecision: 'approved' | 'changes_requested' | 'review_required' | null
  activity: Activity[]
}

/** `CodeHostPr` plus drift, measured locally (`./facts.ts`) — never a code host field. */
export interface PrFacts extends CodeHostPr {
  behind: number | null
  ahead: number | null
}

/** The cheap listing shape — enough to filter/triage without the heavy fields (mirrors `PR_REF_FIELDS`'s role in `@osdlc/typed-gh`). */
export interface CodeHostPrSummary {
  number: number
  headRef: string
  author: Actor | null
  labels: string[]
  /** Whether the PR is a draft — `orchestrator.pr_filters.exclude_drafts` (`ticks/_pr_filters.ts`) reads this to skip it before classification. */
  isDraft: boolean
  /** Last-activity time; the `prs` tick skips the full fetch while it is unchanged. `null` when the code host omitted it. */
  updatedAt: string | null
}

/**
 * One open PR with what a stack survey needs to place it in a stack and
 * choose how to bring it up to date: both branch names, the head sha a
 * force-push lease is pinned to, the labels, how many reviews a rewrite would
 * outdate, and whether the head lives in a fork.
 */
export interface CodeHostPrDetail {
  number: number
  title: string
  url: string
  baseRef: string
  headRef: string
  /** Head commit sha; `null` when the code host omitted it. */
  headSha: string | null
  isDraft: boolean
  labels: string[]
  /** Submitted reviews. */
  reviewCount: number
  /** True when the head branch lives in a fork, so its ref is not on the base repository's remote. */
  isCrossRepository: boolean
}

/** One review thread's state, as far as a merge decision needs it. */
export interface ReviewThreadState {
  isResolved: boolean
  isOutdated: boolean
  /** Login of the thread's newest comment; null when the account is gone. */
  lastCommentAuthor: string | null
}

/** Thrown by an adapter for a `CodeHost` method that code host does not support. */
export class CodeHostUnsupported extends Error {
  constructor(codeHost: CodeHostName, method: string) {
    super(`${codeHost} code host does not support ${method}`)
    this.name = 'CodeHostUnsupported'
  }
}

export type MergeMethod = 'squash' | 'merge' | 'rebase'

export type PrRef = { codeHost: CodeHostName; owner: string; repo: string; number: number }

export type PrInput =
  | { kind: 'current' }
  | { kind: 'number'; number: number }
  | { kind: 'slug'; owner: string; repo: string; number: number }
  | { kind: 'url'; ref: PrRef }

/** What {@link CodeHost.createPr} opens a PR from. */
export interface CreatePrInput {
  head: string
  base: string
  title: string
  body: string
  draft?: boolean | undefined
}

export interface CodeHost {
  readonly name: CodeHostName
  /** Open (or matching `q.state`) PRs, cheaply. `null` when the code host call failed. */
  listPrs(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
  }): CodeHostPrSummary[] | null
  /**
   * Open (or matching `q.state`) PRs with the fields a stack survey reads.
   * `q.repo` (`owner/name`) lists another repository than the checkout's own.
   * `null` when the code host call failed.
   */
  listPrDetails(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
    repo?: string
  }): CodeHostPrDetail[] | null
  /** One PR with every field a classifier or router needs. `null` when it doesn't exist or the call failed. `since` is accepted for a future incremental fetch; every adapter today ignores it and returns full state. */
  getPr(number: number, opts: { since: string | null }): CodeHostPr | null
  /** Posts a comment; throws on failure (a mutation, per the tri-modal convention — see `Gh`/`Git`). */
  postComment(number: number, body: string): { id: string; createdAt: string }
  /**
   * Rewrites the body of comment `commentId` (an id `postComment` returned) on the PR; throws on
   * failure, and throws {@link CommentNotFoundError} when the comment no longer exists (HTTP 404).
   * The run-end reconcile edits its one failure comment through it.
   */
  updateComment(number: number, commentId: string, body: string): void
  /**
   * The PR's conversation comments with the ids `postComment`/`updateComment` use (not the
   * GraphQL node ids `getPr`'s activity carries). `null` when they cannot be read. Optional:
   * a caller that wants to find a comment it posted earlier tolerates its absence.
   */
  listComments?(number: number): { id: string; createdAt: string; body: string }[] | null
  /** Marks the PR ready for review (`draft: false`) or converts it to a draft (`draft: true`); throws on failure, or `CodeHostUnsupported` where the code host has no draft toggle. */
  setDraft(number: number, draft: boolean): void
  /** Brings the PR's head up to date with its base; throws on failure. */
  updateBranch(number: number, style: 'merge' | 'rebase'): void
  /**
   * Every review thread on the PR. `null` when they cannot be read in full (a
   * failed call, too many threads, or a code host with no thread model): a
   * caller gating a merge on this must treat `null` as "unknown", never as
   * "none".
   */
  reviewThreads(number: number): ReviewThreadState[] | null
  /**
   * Merges the PR. `opts.headSha` is the head the caller judged; the code host
   * refuses (this throws) when the head has since moved, so an unreviewed push
   * cannot ride in on a stale verdict. The head branch is left in place.
   */
  mergePr(number: number, opts: { headSha: string; method: MergeMethod }): void
  /** Opens a PR; throws on failure, like `postComment`. */
  createPr(input: CreatePrInput): { number: number; url: string }
  /** `null` when `url` names no PR this code host recognizes. */
  parsePrUrl(url: string): PrRef | null
  /** The open PR whose head is exactly `branch`, or `null`. */
  prForBranch(branch: string): number | null
}

/**
 * Thrown by `CodeHost.updateComment` when the comment is gone (the code host answered 404). The
 * adapters decide it from the HTTP status or the client's stderr, never from the request, which
 * carries the comment body.
 */
export class CommentNotFoundError extends Error {
  readonly commentId: string
  constructor(commentId: string, detail: string) {
    super(`comment ${commentId} not found: ${detail}`)
    this.name = 'CommentNotFoundError'
    this.commentId = commentId
  }
}
