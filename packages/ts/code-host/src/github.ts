/**
 * `GithubCodeHost`: the `CodeHost` port over `@osdlc/typed-gh`'s `Gh` client.
 *
 * `getPr` reads through `Gh.prViewSettled`, which asks `gh pr view` again
 * while mergeability is `UNKNOWN`.
 *
 * `gh pr view --json` has no field for per-line review comments, so `getPr`
 * fetches them over REST (`repos/{owner}/{repo}/pulls/<n>/comments`) through
 * `Gh.api` and adds them to `activity` as `kind: 'review-comment'`.
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
import { rollupChecks } from './checks.ts'
import { fromGhFailure, type CodeHostFailure } from './failure.ts'
import { prHost } from './pr-ref.ts'
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
 * The REST per-line comments endpoint returns logins with a `[bot]` suffix
 * (`github-actions[bot]`). `typed-gh` already normalizes the logins on
 * `pr.comments` and `pr.reviews`. This normalizes REST logins the same way, so
 * every `Activity` author has the same form.
 */
function toActor(login: string | null | undefined): Actor | null {
  if (login === null || login === undefined || login === '') return null
  const normalized = normalizeAuthorLogin(login)
  return { login: normalized, isBot: normalized !== login }
}

function checksSummaryFrom(checks: readonly CheckRun[]): CheckSummary {
  // `blocked` stays empty here because this function makes no network calls.
  // Detecting a billing block needs one `gh api` call per failing check, so
  // `GithubCodeHost.getPr` fills it in afterwards (see `detectBlockedChecks`).
  return rollupChecks(checks)
}

/**
 * A GitHub Actions check run's numeric REST id, read from its `detailsUrl`
 * (`.../actions/runs/<runId>/job/<jobId>`). The URL is the only place it
 * appears, because `gh pr view --json statusCheckRollup` never includes
 * `databaseId`. For an Actions check the job id in that URL is the check
 * run's REST id (checked against `gh api repos/{o}/{r}/commits/{sha}/check-runs`
 * on a real failing PR). A check whose URL is not an Actions job link (a
 * third-party CI status, a legacy `StatusContext`) yields `null`, and
 * `detectBlockedChecks` leaves it counted as failing.
 */
export function actionsJobId(url: string): string | null {
  const m = /\/actions\/runs\/\d+\/job\/(\d+)(?:[/?#]|$)/.exec(url)
  return m === null ? null : m[1]!
}

/**
 * The fixed prefix of GitHub's system annotation for an account block: "The
 * job was not started because recent account payments have failed or your
 * spending limit needs to be increased. Please check the 'Billing & plans'
 * section in your settings" (checked against a real blocked check run via
 * `gh api repos/<owner>/<repo>/check-runs/<id>/annotations`).
 *
 * The pattern is anchored at the start. Actions also turns a step's own
 * `::error::` output into annotations, so an unanchored match on "was not
 * started" would treat a step that logs "Error: dev server was not started
 * within 30s" as blocked, when it is a real failure.
 */
const BLOCKED_ANNOTATION_PATTERN = /^The job was not started because\b/

interface RawAnnotation {
  message?: unknown
  /** GitHub's system annotation for this block always has level `failure` and `path: '.github'`. Both are checked with the message prefix, so a step's annotation cannot match on its text alone. */
  annotation_level?: unknown
  path?: unknown
}

/**
 * Which checks in `failingUrls` failed because GitHub never started the job.
 * Read from each check run's annotations
 * (`repos/{owner}/{repo}/check-runs/{id}/annotations`), only for failing
 * checks. A PR with no failing checks costs no extra call. A failing PR costs
 * one call per failing Actions check. A check with no Actions job id is
 * skipped. When the fetch or parse fails for a check, that check is left out
 * of the result and stays counted as failing, so a failed fetch never hides
 * a real failure.
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
 * Per-line review comments from the REST endpoint, through `Gh.api`, every
 * page of them (the endpoint returns 30 per page by default). Returns `[]` on
 * any failure (non-zero exit, parse error) instead of throwing. A failed fetch
 * of these comments should not fail the whole `getPr` call.
 */
function fetchReviewComments(gh: Gh, prNumber: number): RestReviewComment[] {
  const result = gh.api(`repos/{owner}/{repo}/pulls/${prNumber}/comments?per_page=100`, {
    paginate: true,
  })
  if (!result.ok) return []
  return Array.isArray(result.body) ? (result.body as RestReviewComment[]) : []
}

function reviewCommentActivity(entries: readonly RestReviewComment[]): CodeHostPr['activity'] {
  const out: CodeHostPr['activity'] = []
  for (const raw of entries) {
    if (typeof raw.id !== 'number' && typeof raw.id !== 'string') continue
    const login = typeof raw.user?.login === 'string' ? raw.user.login : null
    const path = typeof raw.path === 'string' ? raw.path : undefined
    // `line` is null when the comment is on an outdated diff position, so fall back to `original_line`.
    const line =
      typeof raw.line === 'number'
        ? raw.line
        : typeof raw.original_line === 'number'
          ? raw.original_line
          : undefined
    const inReplyToId = raw.in_reply_to_id
    // This REST endpoint gives no thread id, so `in_reply_to_id ?? id` groups
    // comments by thread.
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
 * Maps a typed-gh `PullRequest` to a `CodeHostPr`. Exported for an async
 * caller that fetches with `@osdlc/typed-gh`'s `prView` verb itself (the port
 * is synchronous, see `./types.ts`). Both paths then produce the same shape.
 */
export function codeHostPrFrom(
  pr: PullRequest,
  reviewComments: CodeHostPr['activity'],
): CodeHostPr {
  const mergeable: CodeHostPr['mergeable'] =
    // Either field alone means a conflict. Check both before `mergeable`
    // alone: GitHub can report `MERGEABLE` with a stale `DIRTY` merge state,
    // and that PR must still read as conflicting.
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
 * on the failure. A signed-out `gh` is `not-authenticated`, not a bare `exit`.
 */
function writeFailure(argv: string[], res: CommandResult): CodeHostFailure {
  return fromGhFailure(classifyGhFailure(new CommandFailed(argv, res, 'gh')))
}

export class GithubCodeHost implements CodeHost {
  readonly name = 'github' as const
  // Queries return a `Result`, so they call `gh.try.*`. Mutations throw, so
  // they call the throwing `gh` methods.
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
        // `reviews` is not in the default listing, and `reviewCount` needs it.
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
    // `since` is ignored: this always fetches the full state.
    const viewed = tried(this.gh.try.prViewSettled(number, { fields: PR_VIEW_FIELDS }))
    if (!viewed.ok) return viewed
    const pr = viewed.value
    if (pr === null) return ok(null)
    const reviewComments = reviewCommentActivity(fetchReviewComments(this.gh, number))
    const codeHostPr = codeHostPrFrom(pr, reviewComments)
    // Look for billing blocks only when a check is failing.
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
    const argv = [
      'api',
      '--paginate',
      '--slurp',
      `repos/{owner}/{repo}/issues/${number}/comments?per_page=100`,
    ]
    const res = this.gh.raw(argv)
    // `gh api` through `raw`, not `gh.api`: the failure needs the whole run to be classified.
    // `--slurp` prints every page as one array of pages, flattened below. It is
    // the same flag `Gh.api`'s `paginate` passes, and needs gh 2.48 or later.
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
    if (!Array.isArray(body) || !body.every(Array.isArray)) {
      return err({
        kind: 'unreadable',
        message: 'GitHub answered, but its comment list could not be read.',
        host: 'github',
      })
    }
    const rows = (body as unknown[][]).flat() as {
      id?: unknown
      body?: unknown
      created_at?: unknown
    }[]
    const out: { id: string; createdAt: string; body: string }[] = []
    for (const c of rows) {
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
    // `--rebase` for rebase is inferred from the design doc. It has not been
    // checked against a real `gh` install.
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
      : {
          codeHost: 'github',
          host: prHost(ref.hostname),
          owner: ref.owner,
          repo: ref.repo,
          number: ref.number,
        }
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
