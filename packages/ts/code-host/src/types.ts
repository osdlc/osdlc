/**
 * The CodeHost port: what a code host (GitHub, Forgejo, ...) must answer, so
 * a classifier or router never calls `gh` or a code host's REST API directly.
 * GitHub (`./github.ts`) and Forgejo (`./forgejo.ts`) are the adapters.
 * `listPrDetails` is the bulk read for a survey.
 *
 * Four design choices hold for every method:
 *
 *   - A query that can fail returns a `Result<T, CodeHostFailure>`
 *     (`@osdlc/result`), never `null` for a failure. The failure carries a
 *     `kind` (not signed in, no network, a missing tool, ...), a message and a
 *     hint, the same for both adapters. A declared absence is still a success:
 *     `{ ok: true, value: null }` for "no PR for that branch". A mutation throws
 *     on failure (a `FailureError` carrying the failure, or `CommandFailed`).
 *   - Every method is synchronous. Callers hold `CommandRunner`s over
 *     `spawnRunner` (`@osdlc/command-seam`) and are synchronous throughout.
 *     An async port would force every caller to become async, and no caller
 *     needs that.
 *   - `Activity` has an `id`, an `editedAt`, and a third kind,
 *     `'review-comment'` (with an optional `location`), beside `comment` and
 *     `review`. A caller can then sign every feedback item by id, and tell a
 *     per-line diff comment (GitHub's REST `pulls/<n>/comments`) from a
 *     top-level comment or review.
 *   - `PrFacts.behind` and `ahead` come from local git, in `./facts.ts`. Drift
 *     is not a code host field, so no adapter sets them.
 */

import { z } from 'zod'

import type { CommandRunner } from '@osdlc/command-seam'
import type { Result } from '@osdlc/result'

import type { CodeHostFailure } from './failure.ts'

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
 * One comment, review, or inline review comment on the PR, unfiltered. The
 * caller applies any bot, self or recency filter, once, for every code host.
 * This type carries only what such a filter and a signature over the entry
 * need.
 */
export interface Activity {
  /** A stable identity for the entry, suitable for signing or de-duplicating. */
  id: string
  kind: 'comment' | 'review' | 'review-comment'
  author: Actor | null
  /** Created/submitted timestamp. */
  at: string | null
  /** Last-edited timestamp. Null when the code host does not report one. */
  editedAt: string | null
  body: string
  /** Only set for `kind: 'review'` (e.g. `APPROVED`, `CHANGES_REQUESTED`). */
  reviewState: string | null
  /** Only set for `kind: 'review-comment'`: where in the diff it sits. */
  location: { file?: string; line?: number; threadId?: string; url?: string } | null
}

export interface CheckSummary {
  rollup: 'none' | 'pending' | 'success' | 'failure'
  /** Failing check names, in the code host's own rollup order. */
  failing: string[]
  /** Log or details URLs of failing checks, in the same order as `failing`. A check with no URL is left out, so this list may be shorter. */
  failingUrls: { name: string; url: string }[]
  /**
   * The checks in `failing` whose run never started, because GitHub blocked
   * the account for billing or a spending limit. Such a check reports
   * `conclusion: failure` with no steps. The reason ("The job was not started
   * because...") is only in the check run's annotations, which
   * `./github.ts`'s `detectBlockedChecks` reads for failing checks only. A
   * caller uses this to tell an account block from a real code failure.
   * Always `[]` on Forgejo, which documents no such failure, and when
   * `failing` is empty.
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

/** `CodeHostPr` plus drift, measured locally (`./facts.ts`). Drift is never a code host field. */
export interface PrFacts extends CodeHostPr {
  behind: number | null
  ahead: number | null
}

/** The cheap listing shape: enough to filter PRs without fetching the expensive fields. It plays the role of `PR_REF_FIELDS` in `@osdlc/typed-gh`. */
export interface CodeHostPrSummary {
  number: number
  headRef: string
  author: Actor | null
  labels: string[]
  /** Whether the PR is a draft, so a caller can skip drafts before a full fetch. */
  isDraft: boolean
  /** Last-activity time. A caller can skip the full fetch while it is unchanged. `null` when the code host omitted it. */
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

/** A pull request: the code host kind, the host it lives on (lower-cased), its repository and number. */
export type PrRef = {
  codeHost: CodeHostName
  host: string
  owner: string
  repo: string
  number: number
}

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
  /** Open (or matching `q.state`) PRs, cheaply. */
  listPrs(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
  }): Result<CodeHostPrSummary[], CodeHostFailure>
  /**
   * Open (or matching `q.state`) PRs with the fields a stack survey reads.
   * `q.repo` (`owner/name`) lists another repository than the checkout's own.
   */
  listPrDetails(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
    repo?: string
  }): Result<CodeHostPrDetail[], CodeHostFailure>
  /**
   * One PR with every field a classifier or router needs. A success of `null` when it does not
   * exist, and a failure when the call failed. `since` is reserved for an incremental fetch.
   * Every adapter ignores it and returns the full state.
   */
  getPr(number: number, opts: { since: string | null }): Result<CodeHostPr | null, CodeHostFailure>
  /** Posts a comment. Throws on failure, like every mutation here (the same rule as `Gh` and `Git`). */
  postComment(number: number, body: string): { id: string; createdAt: string }
  /**
   * Rewrites the body of comment `commentId` (an id `postComment` returned) on the PR. Throws on
   * failure, and throws {@link CommentNotFoundError} when the comment no longer exists (HTTP 404).
   */
  updateComment(number: number, commentId: string, body: string): void
  /**
   * The PR's conversation comments with the ids `postComment`/`updateComment` use (not the
   * GraphQL node ids `getPr`'s activity carries). A failure when they cannot be read. Optional:
   * a caller that wants to find a comment it posted earlier tolerates its absence.
   */
  listComments?(
    number: number,
  ): Result<{ id: string; createdAt: string; body: string }[], CodeHostFailure>
  /** Marks the PR ready for review (`draft: false`) or converts it to a draft (`draft: true`). Throws on failure, or `CodeHostUnsupported` when the code host has no draft toggle. */
  setDraft(number: number, draft: boolean): void
  /** Brings the PR's head up to date with its base. Throws on failure. */
  updateBranch(number: number, style: 'merge' | 'rebase'): void
  /**
   * Every review thread on the PR. A failure when they cannot be read in full: a
   * failed call, too many threads, or a code host with no review threads
   * (`unsupported`). A caller that blocks a merge on this must treat a failure as
   * "unknown", never as "none".
   */
  reviewThreads(number: number): Result<ReviewThreadState[], CodeHostFailure>
  /**
   * Merges the PR. `opts.headSha` is the head the caller checked. The code host
   * refuses, and this throws, when the head has moved since, so a push nobody
   * reviewed is not merged. The head branch is left in place. Throws
   * `CodeHostUnsupported` when the code host cannot merge (Forgejo today).
   */
  mergePr(number: number, opts: { headSha: string; method: MergeMethod }): void
  /**
   * Opens a PR. Throws on failure, like `postComment`, or `CodeHostUnsupported`
   * when the code host cannot open one (Forgejo today).
   */
  createPr(input: CreatePrInput): { number: number; url: string }
  /** `null` when `url` names no PR this code host recognizes. */
  parsePrUrl(url: string): PrRef | null
  /** The open PR whose head is exactly `branch`; a success of `null` when there is none. */
  prForBranch(branch: string): Result<number | null, CodeHostFailure>
}

/**
 * Thrown by `CodeHost.updateComment` when the comment is gone (the code host answered 404). The
 * adapters detect it from the HTTP status or the client's stderr, never from the request, which
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
