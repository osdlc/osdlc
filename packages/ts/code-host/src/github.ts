/**
 * `GithubCodeHost` — the `CodeHost` port over `@osdlc/typed-gh`'s `Gh` client.
 *
 * `getPr` avoids a duplication: callers used to hand-roll their own "re-ask `gh pr view` while mergeability is UNKNOWN" retry
 * loop (`fetchLiveState`/`mergeStateUnsettled`) against the raw `CommandRunner`
 * — the exact thing `Gh.prViewSettled`/`needsMergeStateRetry` already do.
 * This adapter calls them.
 *
 * Per-line/inline review comments have no GraphQL equivalent (`gh pr view
 * --json` has no `reviewThreads`/per-line field), so `getPr` fetches them over
 * REST (`repos/{owner}/{repo}/pulls/<n>/comments`) through `Gh.api` and folds
 * them into `activity` as `kind: 'review-comment'`.
 */

import {
  classifyGhFailure,
  Gh,
  normalizeAuthorLogin,
  parsePrUrl as ghParsePrUrl,
  PR_LIST_FIELDS,
  PR_REF_FIELDS,
  PR_VIEW_FIELDS,
  type CheckRun,
  type GhFailure,
  type PullRequest,
} from '@osdlc/typed-gh'

import {
  classifyFailure,
  CommandFailed,
  type CommandResult,
  type CommandRunner,
} from '@osdlc/command-seam'
import { err, FailureError, mapErr, ok, type Result } from '@osdlc/result'
import { fromGhFailure, type CodeHostFailure } from './failure.ts'
import { CommentNotFoundError } from './types.ts'
import type {
  Actor,
  CheckSummary,
  CodeHost,
  CodeHostPr,
  CodeHostPrDetail,
  CodeHostPrSummary,
  CreatePrInput,
  MergeMethod,
  PrRef,
  ReviewThreadState,
} from './types.ts'

/** One entry from the REST `pulls/<n>/comments` per-line-comment endpoint. */
interface RestReviewComment {
  id: unknown
  user?: { login?: unknown } | null
  path?: unknown
  line?: unknown
  original_line?: unknown
  body?: unknown
  in_reply_to_id?: unknown
  html_url?: unknown
  created_at?: unknown
  updated_at?: unknown
}

/**
 * The REST per-line-comments endpoint returns a `[bot]`-suffixed login
 * (`github-actions[bot]`), unlike the GraphQL-sourced `Actor`s `typed-gh`
 * already normalizes for `pr.comments`/`pr.reviews` above — fold
 * it the same way here, or a `review-comment`'s displayed author would be the
 * only `Activity` entry showing the raw suffixed form.
 */
function toActor(login: string | null | undefined): Actor | null {
  if (login === null || login === undefined || login === '') return null
  const normalized = normalizeAuthorLogin(login)
  return { login: normalized, isBot: normalized !== login }
}

function checksSummaryFrom(checks: readonly CheckRun[]): CheckSummary {
  const rollup = checks.some((c) => c.verdict === 'failure')
    ? 'failure'
    : checks.some((c) => c.verdict === 'pending')
      ? 'pending'
      : checks.length === 0
        ? 'none'
        : 'success'
  const failed = checks.filter((c) => c.verdict === 'failure')
  const failing = failed.map((c) => c.name)
  const failingUrls = failed
    .filter((c): c is CheckRun & { url: string } => c.url !== null)
    .map((c) => ({ name: c.name, url: c.url }))
  // `blocked` is never populated here — this function is pure (no network
  // access), and detecting a billing/spending-limit block needs a `gh api`
  // annotations fetch per failing check. `GithubCodeHost.getPr` fills it in,
  // after this call, only when `failing.length > 0` — see `detectBlockedChecks`.
  return { rollup, failing, failingUrls, blocked: [] }
}

/**
 * A GitHub Actions check run's numeric REST id, recovered from its
 * `detailsUrl` (`.../actions/runs/<runId>/job/<jobId>`) — the one place it's
 * available at all: `gh pr view --json statusCheckRollup`'s GraphQL payload
 * never includes `databaseId`, and for an Actions-backed check the job id
 * embedded in that URL IS the check run's REST id (verified against a live
 * failing PR: `gh api repos/{o}/{r}/commits/{sha}/check-runs`
 * reports the same id `detailsUrl`'s `/job/<id>` names). A check whose URL
 * isn't shaped like an Actions job link (a third-party CI status, a legacy
 * `StatusContext`) yields `null` and is left alone by `detectBlockedChecks`
 * below — this can only ever narrow a CI-FAILED verdict to CI-BLOCKED for a
 * check it CAN inspect, never misclassify one it can't.
 */
export function actionsJobId(url: string): string | null {
  const m = /\/actions\/runs\/\d+\/job\/(\d+)(?:[/?#]|$)/.exec(url)
  return m === null ? null : m[1]!
}

/**
 * The fixed prefix GitHub's own system annotation uses for an account-level
 * block ("The job was not started because recent account payments have
 * failed or your spending limit needs to be increased. Please check the
 * 'Billing & plans' section in your settings" — verified against a real
 * blocked check run via `gh api
 * repos/<owner>/<repo>/check-runs/<id>/annotations`). Anchored at the start:
 * `/\bwas not started\b/i` (the prior pattern) also matched a user step's own
 * `::error::` output — Actions turns those into annotations too — so a test
 * step logging e.g. "Error: dev server was not started within 30s" would
 * downgrade a real failure to CI-BLOCKED. Never for a real code/test
 * failure, which always has at least one step that actually ran.
 */
const BLOCKED_ANNOTATION_PATTERN = /^The job was not started because\b/

interface RawAnnotation {
  message?: unknown
  /** GitHub's system annotation for this block is always `failure`, `path: '.github'` — checked alongside the message prefix so a user-step annotation can never match on message text alone. */
  annotation_level?: unknown
  path?: unknown
}

/**
 * Which of `failingUrls`' checks failed because GitHub never started the
 * job — fetched from each check run's annotations
 * (`repos/{owner}/{repo}/check-runs/{id}/annotations`), ONLY for checks
 * already known to be failing, never the whole rollup: a green PR costs zero
 * extra `gh api` calls, and a red PR costs exactly one call per failing
 * Actions-backed check (a third-party/legacy check with no recoverable id is
 * skipped, not charged a call that could never resolve). Degrades to "not
 * blocked" (excluded from the returned list) on any transport/parse failure
 * for that one check: a fetch or parse failure simply leaves that check
 * counted as failing (CI-FAILED), so an annotations-fetch hiccup never
 * silently downgrades a real failure to CI-BLOCKED or drops it entirely.
 */
export function detectBlockedChecks(
  gh: Gh,
  failingUrls: readonly { name: string; url: string }[],
): string[] {
  const blocked: string[] = []
  for (const { name, url } of failingUrls) {
    const jobId = actionsJobId(url)
    if (jobId === null) continue
    const result = gh.api(`repos/{owner}/{repo}/check-runs/${jobId}/annotations`)
    if (!result.ok) continue
    // A body that did not parse (null) reads as "no annotations".
    const annotations: RawAnnotation[] = Array.isArray(result.body)
      ? (result.body as RawAnnotation[])
      : []
    const isBlocked = annotations.some(
      (a) =>
        typeof a.message === 'string' &&
        BLOCKED_ANNOTATION_PATTERN.test(a.message) &&
        a.annotation_level === 'failure' &&
        a.path === '.github',
    )
    if (isBlocked) blocked.push(name)
  }
  return blocked
}

/**
 * Per-line review comments via the REST endpoint, through `Gh.api`. Degrades
 * to `[]` on any failure (non-zero exit, parse error) rather than throwing —
 * matches `feedback.ts`'s old `fetchReviewComments`: a review-comments fetch
 * failure means "no per-line comments this round," not a reason to fail the
 * whole `getPr` call.
 */
function fetchReviewComments(gh: Gh, prNumber: number): RestReviewComment[] {
  const result = gh.api(`repos/{owner}/{repo}/pulls/${prNumber}/comments`)
  if (!result.ok) return []
  return Array.isArray(result.body) ? (result.body as RestReviewComment[]) : []
}

function reviewCommentActivity(entries: readonly RestReviewComment[]): CodeHostPr['activity'] {
  const out: CodeHostPr['activity'] = []
  for (const raw of entries) {
    if (typeof raw.id !== 'number' && typeof raw.id !== 'string') continue
    const login = typeof raw.user?.login === 'string' ? raw.user.login : null
    const path = typeof raw.path === 'string' ? raw.path : undefined
    // `line` is null when the comment sits on an outdated diff position — fall back to `original_line`.
    const line =
      typeof raw.line === 'number'
        ? raw.line
        : typeof raw.original_line === 'number'
          ? raw.original_line
          : undefined
    const inReplyToId = raw.in_reply_to_id
    // No true thread-node-id is available through this REST endpoint;
    // `in_reply_to_id ?? id` is the pragmatic per-thread grouping id.
    const threadId = String(
      typeof inReplyToId === 'number' || typeof inReplyToId === 'string' ? inReplyToId : raw.id,
    )
    const url = typeof raw.html_url === 'string' ? raw.html_url : undefined
    const at = typeof raw.created_at === 'string' ? raw.created_at : null
    const updatedAt = typeof raw.updated_at === 'string' ? raw.updated_at : null
    out.push({
      id: String(raw.id),
      kind: 'review-comment',
      author: toActor(login),
      at,
      editedAt: updatedAt !== at ? updatedAt : null,
      body: typeof raw.body === 'string' ? raw.body : '',
      reviewState: null,
      location: {
        ...(path !== undefined ? { file: path } : {}),
        ...(line !== undefined ? { line } : {}),
        threadId,
        ...(url !== undefined ? { url } : {}),
      },
    })
  }
  return out
}

/**
 * Exported for an async caller (a dashboard fan-out, say) that fetches via `@osdlc/typed-gh`'s pure
 * `prView` verb directly (this whole port is deliberately synchronous, see
 * this module's top-of-file doc), then maps the result through this same
 * function so a classifier's verdict logic runs identically for both callers.
 */
export function codeHostPrFrom(
  pr: PullRequest,
  reviewComments: CodeHostPr['activity'],
): CodeHostPr {
  const mergeable: CodeHostPr['mergeable'] =
    // Either field alone signals a conflict (`mergeable === 'CONFLICTING'
    // || mergeStateStatus === 'DIRTY'`, independent of the other field) —
    // this OR must be checked before falling back to `mergeable` alone, or a
    // PR GitHub reports as `MERGEABLE` with a stale-DIRTY merge-state (a real
    // combination) silently loses its conflict signal.
    pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY'
      ? 'conflicting'
      : pr.mergeable === 'MERGEABLE'
        ? 'mergeable'
        : 'unknown'
  const reviewDecision: CodeHostPr['reviewDecision'] =
    pr.reviewDecision === 'APPROVED'
      ? 'approved'
      : pr.reviewDecision === 'CHANGES_REQUESTED'
        ? 'changes_requested'
        : pr.reviewDecision === 'REVIEW_REQUIRED'
          ? 'review_required'
          : null

  const activity: CodeHostPr['activity'] = [
    ...pr.comments.map((c) => ({
      id: c.id ?? '',
      kind: 'comment' as const,
      author: c.author,
      at: c.createdAt,
      editedAt: null,
      body: c.body,
      reviewState: null,
      location: null,
    })),
    ...pr.reviews.map((r) => ({
      id: r.id ?? '',
      kind: 'review' as const,
      author: r.author,
      at: r.submittedAt,
      editedAt: null,
      body: r.body,
      reviewState: r.state,
      location: null,
    })),
    ...reviewComments,
  ]

  return {
    number: pr.number,
    url: pr.url,
    title: pr.title,
    state: pr.state === 'MERGED' ? 'merged' : pr.state === 'CLOSED' ? 'closed' : 'open',
    isDraft: pr.isDraft,
    author: pr.author,
    baseRef: pr.baseRefName,
    headRef: pr.headRefName,
    headSha: pr.headRefOid,
    headIsFork: pr.isCrossRepository,
    mergedAt: pr.mergedAt,
    mergeable,
    checks: checksSummaryFrom(pr.checks),
    reviewDecision,
    activity,
  }
}

/**
 * The classified failure of a failed `gh api` write, for a mutation to throw. The
 * argv is passed without the `-f body=…` pair, so the comment text is not carried
 * on the failure; a signed-out `gh` is `not-authenticated`, not a bare `exit`.
 */
function writeFailure(argv: string[], res: CommandResult): CodeHostFailure {
  return fromGhFailure(classifyGhFailure(new CommandFailed(argv, res, 'gh')))
}

export class GithubCodeHost implements CodeHost {
  readonly name = 'github' as const
  // The port's queries return a `Result`, which is `Gh`'s `try` door; a
  // mutation throws, which is its plain door.
  private readonly gh: Gh

  constructor(cwd: string, opts: { runner: CommandRunner }) {
    this.gh = new Gh(cwd, { runner: opts.runner })
  }

  listPrs(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
  }): Result<CodeHostPrSummary[], CodeHostFailure> {
    const rows = tried(
      this.gh.try.prList({
        state: q.state,
        author: q.author,
        limit: q.limit,
        // `PR_REF_FIELDS` plus only what `CodeHostPrSummary` reads. No `mergeable`/
        // `mergeStateStatus`: those make a listing expensive.
        fields: [...PR_REF_FIELDS, 'author', 'labels', 'isDraft', 'updatedAt'],
      }),
    )
    if (!rows.ok) return rows
    return ok(
      rows.value.rows.map((pr) => ({
        number: pr.number,
        headRef: pr.headRefName,
        author: pr.author,
        labels: pr.labels.map((l) => l.name),
        isDraft: pr.isDraft,
        updatedAt: pr.updatedAt,
      })),
    )
  }

  listPrDetails(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
    repo?: string
  }): Result<CodeHostPrDetail[], CodeHostFailure> {
    const rows = tried(
      this.gh.try.prList({
        state: q.state,
        author: q.author,
        limit: q.limit,
        repo: q.repo,
        // `reviews` is not in the default listing, and the rebase guard needs it.
        fields: [...PR_LIST_FIELDS, 'reviews'],
      }),
    )
    if (!rows.ok) return rows
    return ok(
      rows.value.rows.map((pr) => ({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        baseRef: pr.baseRefName,
        headRef: pr.headRefName,
        headSha: pr.headRefOid,
        isDraft: pr.isDraft,
        labels: pr.labels.map((l) => l.name),
        reviewCount: pr.reviews.length,
        isCrossRepository: pr.isCrossRepository,
      })),
    )
  }

  getPr(
    number: number,
    _opts: { since: string | null },
  ): Result<CodeHostPr | null, CodeHostFailure> {
    // No caller does an incremental "since" fetch today — always the
    // full state — so `since` is accepted for interface-parity with a future
    // caller and ignored here, same as every current call site.
    const viewed = tried(this.gh.try.prViewSettled(number, { fields: PR_VIEW_FIELDS }))
    if (!viewed.ok) return viewed
    const pr = viewed.value
    if (pr === null) return ok(null)
    const reviewComments = reviewCommentActivity(fetchReviewComments(this.gh, number))
    const codeHostPr = codeHostPrFrom(pr, reviewComments)
    // Billing/spending-limit block detection: only when there's at least one
    // failing check to inspect — see `detectBlockedChecks`'s doc for why this
    // never costs a green PR anything.
    if (codeHostPr.checks.failing.length === 0) return ok(codeHostPr)
    const blocked = detectBlockedChecks(this.gh, codeHostPr.checks.failingUrls)
    if (blocked.length === 0) return ok(codeHostPr)
    return ok({ ...codeHostPr, checks: { ...codeHostPr.checks, blocked } })
  }

  postComment(number: number, body: string): { id: string; createdAt: string } {
    // POST through the REST API (not `gh pr comment`, which prints only a URL) so the new comment's
    // id and created_at come straight off the response: no re-listing, so no page limit to miss.
    const res = this.gh.raw([
      'api',
      '-X',
      'POST',
      `repos/{owner}/{repo}/issues/${number}/comments`,
      '-f',
      `body=${body}`,
    ])
    if (res.exitCode !== 0) {
      throw new FailureError(writeFailure(['api', '-X', 'POST', `issues/${number}/comments`], res))
    }
    try {
      const parsed = JSON.parse(res.stdout) as { id?: unknown; created_at?: unknown }
      return {
        id: typeof parsed.id === 'number' || typeof parsed.id === 'string' ? String(parsed.id) : '',
        createdAt:
          typeof parsed.created_at === 'string' ? parsed.created_at : new Date().toISOString(),
      }
    } catch {
      // Posted (the call succeeded) but the response was unreadable: an empty id, not a fabricated one.
      return { id: '', createdAt: new Date().toISOString() }
    }
  }

  updateComment(_number: number, commentId: string, body: string): void {
    // Issue-comment ids are repo-wide, so the PR number is not part of the call. The failure is read
    // off gh's stderr, never off the argv (which holds the body).
    const res = this.gh.raw([
      'api',
      '-X',
      'PATCH',
      `repos/{owner}/{repo}/issues/comments/${commentId}`,
      '-f',
      `body=${body}`,
    ])
    if (res.exitCode === 0) return
    const stderr = res.stderr.trim()
    if (/\(HTTP 404\)/.test(stderr)) throw new CommentNotFoundError(commentId, stderr)
    throw new FailureError(
      writeFailure(['api', '-X', 'PATCH', `issues/comments/${commentId}`], res),
    )
  }

  listComments(
    number: number,
  ): Result<{ id: string; createdAt: string; body: string }[], CodeHostFailure> {
    const argv = ['api', `repos/{owner}/{repo}/issues/${number}/comments?per_page=100`]
    const res = this.gh.raw(argv)
    // `gh api` through `raw`, not `gh.api`: the failure needs the whole run to be classified.
    if (classifyFailure(res, { binary: 'gh', argv }) !== null) {
      return {
        ok: false,
        error: fromGhFailure(classifyGhFailure(new CommandFailed(argv, res, 'gh'))),
      }
    }
    let body: unknown
    try {
      body = JSON.parse(res.stdout)
    } catch {
      body = null
    }
    if (!Array.isArray(body)) {
      return err({
        kind: 'unreadable',
        message: 'GitHub answered, but its comment list could not be read.',
        host: 'github',
      })
    }
    const out: { id: string; createdAt: string; body: string }[] = []
    for (const c of body as { id?: unknown; body?: unknown; created_at?: unknown }[]) {
      if (typeof c.id !== 'number' && typeof c.id !== 'string') continue
      out.push({
        id: String(c.id),
        createdAt: typeof c.created_at === 'string' ? c.created_at : '',
        body: typeof c.body === 'string' ? c.body : '',
      })
    }
    return ok(out)
  }

  setDraft(number: number, draft: boolean): void {
    this.gh.prSetDraft(number, draft)
  }

  updateBranch(number: number, style: 'merge' | 'rebase'): void {
    // `--rebase` for rebase is per the design doc's own note on
    // `gh pr update-branch` ("inferred", not verified against a real `gh`
    // install) — unverified here too; no existing call site to cross-check
    // against.
    this.gh.prUpdateBranch(number, style)
  }

  reviewThreads(number: number): Result<ReviewThreadState[], CodeHostFailure> {
    return tried(this.gh.try.prReviewThreads(number))
  }

  mergePr(number: number, opts: { headSha: string; method: MergeMethod }): void {
    this.gh.prMerge(number, opts)
  }

  createPr(input: CreatePrInput): { number: number; url: string } {
    const url = this.gh.createPr(input)
    const ref = ghParsePrUrl(url)
    if (ref === null) throw new Error(`gh pr create printed a URL naming no PR: ${url}`)
    return { number: ref.number, url }
  }

  parsePrUrl(url: string): PrRef | null {
    const ref = ghParsePrUrl(url)
    return ref === null
      ? null
      : { codeHost: 'github', owner: ref.owner, repo: ref.repo, number: ref.number }
  }

  prForBranch(branch: string): Result<number | null, CodeHostFailure> {
    const pr = tried(this.gh.try.openPrFor(branch))
    if (!pr.ok) return pr
    return ok(pr.value === null ? null : pr.value.number)
  }
}

/** A `gh.try.*` result with its failure as a {@link CodeHostFailure}. */
function tried<T>(result: Result<T, GhFailure>): Result<T, CodeHostFailure> {
  return mapErr(result, fromGhFailure)
}
