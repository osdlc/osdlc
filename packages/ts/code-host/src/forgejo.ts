/**
 * `ForgejoCodeHost`: the `CodeHost` port over Forgejo's REST API.
 *
 * `CodeHost` (`./types.ts`) is synchronous, and `fetch` always returns a
 * `Promise`. So this adapter reaches Forgejo the way `./github.ts` reaches
 * GitHub: it runs a CLI through the command seam and waits for it. GitHub has
 * `gh`. Forgejo has no such CLI, so this runs `curl` directly
 * (`-sS -w '<marker><code>'`, parsed by `parseCurlResponse` below).
 *
 * Auth is a Forgejo personal access token, sent as
 * `Authorization: token <token>` (per the Forgejo API docs). The token is a
 * constructor argument. `./select.ts#selectCodeHost` reads it from an
 * environment variable. An adapter that looked up its own secret would be
 * harder to test and to reuse.
 *
 * `host`, `owner` and `repo` are constructor arguments too. `gh` finds the
 * current repository itself, but there is no Forgejo CLI to ask, and a
 * self-hosted instance has no fixed hostname. `./select.ts` reads all three
 * from the `origin` remote before it builds this adapter.
 */

import { classifyFailure, type CommandFailure, type CommandRunner } from '@osdlc/command-seam'
import { err, FailureError, ok, unwrap, type Result } from '@osdlc/result'
import { rollupChecks, type CheckEntry } from './checks.ts'
import type { CodeHostFailure } from './failure.ts'
import { CodeHostUnsupported, CommentNotFoundError } from './types.ts'
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

/**
 * The default env var a Forgejo personal access token is read from. Forgejo has
 * no CLI like `gh` that manages its own auth, so the caller supplies the token.
 * A caller can name another variable with the `forgejoTokenEnv` option.
 */
export const DEFAULT_FORGEJO_TOKEN_ENV = 'FORGEJO_TOKEN'

const STATUS_MARKER = '\nHTTPSTATUS:'

/** What to do when curl is not installed. */
export const CURL_INSTALL_HINT = 'Install curl.'

/** curl's exit code for "operation timed out". */
const CURL_TIMEOUT_EXIT = 28

/**
 * curl exit codes that mean the host could not be reached: 6 could not resolve
 * host, 7 failed to connect, 35 TLS handshake, 52 empty reply, 55/56 send and
 * receive errors, 60 certificate not trusted.
 */
const CURL_NETWORK_EXITS: ReadonlySet<number> = new Set([6, 7, 35, 52, 55, 56, 60])

/** Rows asked for per page of a paginated listing: Forgejo's default `MAX_RESPONSE_ITEMS`. */
const PAGE_SIZE = 50

/** One `curl -w` response, split back into its body and status code. Exported for its own unit test. */
export function parseCurlResponse(stdout: string): { status: number; body: string } | null {
  const at = stdout.lastIndexOf(STATUS_MARKER)
  if (at === -1) return null
  const status = Number(stdout.slice(at + STATUS_MARKER.length).trim())
  if (!Number.isFinite(status)) return null
  return { status, body: stdout.slice(0, at) }
}

/** Raw shapes of Forgejo's REST responses, with only the fields this adapter reads. */
interface RawUser {
  login?: unknown
}
interface RawLabel {
  name?: unknown
}
interface RawBranchRef {
  ref?: unknown
  sha?: unknown
  repo?: { full_name?: unknown } | null
}
interface RawPr {
  number?: unknown
  html_url?: unknown
  title?: unknown
  state?: unknown
  merged?: unknown
  draft?: unknown
  user?: RawUser | null
  base?: RawBranchRef | null
  head?: RawBranchRef | null
  mergeable?: unknown
  merged_at?: unknown
  updated_at?: unknown
  labels?: RawLabel[]
}
interface RawComment {
  id?: unknown
  user?: RawUser | null
  body?: unknown
  created_at?: unknown
}
interface RawReview {
  id?: unknown
  user?: RawUser | null
  body?: unknown
  state?: unknown
  submitted_at?: unknown
  /** Fields of `PullReview` in the Forgejo API docs. */
  dismissed?: unknown
  stale?: unknown
}
interface RawReviewComment {
  id?: unknown
  user?: RawUser | null
  path?: unknown
  line?: unknown
  body?: unknown
  html_url?: unknown
  created_at?: unknown
  updated_at?: unknown
}
interface RawStatus {
  state?: unknown
  context?: unknown
  target_url?: unknown
}
interface RawCombinedStatus {
  statuses?: RawStatus[]
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/**
 * Whether a PR's head lives in another repository than its base, compared
 * without case. An unknown head or base repo reads as a fork: fail closed, so
 * a caller never takes a fork's branch name for a branch on origin.
 */
function isForkHead(headRepo: string | null, baseRepo: string | null): boolean {
  return headRepo === null || baseRepo === null || headRepo.toLowerCase() !== baseRepo.toLowerCase()
}

/** Forgejo documents no way to mark a bot login, so the login is used as is. */
function toActor(login: string | null): Actor | null {
  return login === null || login === '' ? null : { login, isBot: false }
}

/**
 * Maps the combined-status `state` values (`pending|success|error|failure|
 * warning|skipped`, per the Forgejo API docs) to verdicts for the shared
 * `rollupChecks`. A missing state reads as pending; `warning`, `skipped` and
 * any unknown state count as a pass.
 */
function checksSummaryFrom(statuses: readonly RawStatus[]): CheckSummary {
  // Forgejo documents no billing block like GitHub Actions' "job was not
  // started", so `blocked` is always empty.
  return rollupChecks(
    statuses.map((s): CheckEntry => {
      const state = str(s.state) ?? 'pending'
      const name = str(s.context)
      return {
        name: name ?? 'unknown',
        verdict:
          state === 'failure' || state === 'error'
            ? 'failure'
            : state === 'pending'
              ? 'pending'
              : 'success',
        // A failing status with no context is listed by name only, never with a URL.
        url: name === null ? null : str(s.target_url),
      }
    }),
  )
}

/**
 * Forgejo has no `reviewDecision` field, so this derives one from the review
 * list. Each reviewer's latest review counts. Any `REQUEST_CHANGES` gives
 * `changes_requested`, then any `APPROVED` gives `approved`, else
 * `review_required`. With no review left to count, the result is `null`. The
 * `ReviewStateType` values `APPROVED` and `REQUEST_CHANGES` are inferred, not
 * confirmed by the spec. An unrecognized state still counts as a review for
 * `review_required`, but never as an approval or a rejection.
 *
 * `dismissed` and `stale` are documented fields (Reviews section). A review
 * with either set is skipped before the latest review is picked, as Forgejo's
 * own UI treats it as no longer standing. One case is left unhandled on
 * purpose: whether a later COMMENT, PENDING or REQUEST_REVIEW review from the
 * same reviewer cancels an earlier APPROVED. That rule is not documented, and
 * a wrong guess is worse than the current result.
 */
function reviewDecisionFrom(reviews: readonly RawReview[]): CodeHostPr['reviewDecision'] {
  const latestByUser = new Map<string, RawReview>()
  for (const r of reviews) {
    if (r.dismissed === true || r.stale === true) continue
    const login = str(r.user?.login)
    if (login === null) continue
    const at = str(r.submitted_at) ?? ''
    const existing = latestByUser.get(login)
    const existingAt = (existing !== undefined ? str(existing.submitted_at) : null) ?? ''
    if (existing === undefined || at >= existingAt) latestByUser.set(login, r)
  }
  const states = [...latestByUser.values()].map((r) => str(r.state))
  if (states.some((s) => s === 'REQUEST_CHANGES')) return 'changes_requested'
  if (states.some((s) => s === 'APPROVED')) return 'approved'
  return states.length > 0 ? 'review_required' : null
}

function commentActivity(entries: readonly RawComment[]): CodeHostPr['activity'] {
  return entries
    .filter((c) => typeof c.id === 'number' || typeof c.id === 'string')
    .map((c) => ({
      id: String(c.id),
      kind: 'comment' as const,
      author: toActor(str(c.user?.login)),
      at: str(c.created_at),
      editedAt: null,
      body: str(c.body) ?? '',
      reviewState: null,
      location: null,
    }))
}

function reviewActivity(entries: readonly RawReview[]): CodeHostPr['activity'] {
  return entries
    .filter((r) => typeof r.id === 'number' || typeof r.id === 'string')
    .map((r) => ({
      id: String(r.id),
      kind: 'review' as const,
      author: toActor(str(r.user?.login)),
      at: str(r.submitted_at),
      editedAt: null,
      body: str(r.body) ?? '',
      reviewState: str(r.state),
      location: null,
    }))
}

function reviewCommentActivity(entries: readonly RawReviewComment[]): CodeHostPr['activity'] {
  return entries
    .filter((c) => typeof c.id === 'number' || typeof c.id === 'string')
    .map((c) => {
      const path = str(c.path)
      const line = typeof c.line === 'number' ? c.line : undefined
      const url = str(c.html_url)
      const at = str(c.created_at)
      const updatedAt = str(c.updated_at)
      return {
        id: String(c.id),
        kind: 'review-comment' as const,
        author: toActor(str(c.user?.login)),
        at,
        editedAt: updatedAt !== at ? updatedAt : null,
        body: str(c.body) ?? '',
        reviewState: null,
        location: {
          ...(path !== null ? { file: path } : {}),
          ...(line !== undefined ? { line } : {}),
          threadId: String(c.id),
          ...(url !== null ? { url } : {}),
        },
      }
    })
}

/** Maps one Forgejo `PullRequest` (plus its comments/reviews/review-comments/checks) onto `CodeHostPr`. */
export function forgejoPrFrom(
  pr: RawPr,
  comments: readonly RawComment[],
  reviews: readonly RawReview[],
  reviewComments: readonly RawReviewComment[],
  statuses: readonly RawStatus[],
): CodeHostPr {
  // Forgejo's `mergeable` is a boolean, not GitHub's three-state enum. Its
  // `false` covers both a conflict and "cannot merge yet", and no other field
  // tells them apart. So a PR still being checked, or whose check errored,
  // reads as `'conflicting'`. This is a limit of the API.
  //
  // Drafts are the one case the payload does separate, through `draft`.
  // Forgejo returns `mergeable: false` for a draft, which is not a conflict,
  // so a draft's `false` reads as `'unknown'`.
  const mergeable: CodeHostPr['mergeable'] =
    pr.draft === true
      ? 'unknown'
      : pr.mergeable === true
        ? 'mergeable'
        : pr.mergeable === false
          ? 'conflicting'
          : 'unknown'

  const headRepoName = str(pr.head?.repo?.full_name)
  const baseRepoName = str(pr.base?.repo?.full_name)
  const activity: CodeHostPr['activity'] = [
    ...commentActivity(comments),
    ...reviewActivity(reviews),
    ...reviewCommentActivity(reviewComments),
  ]

  return {
    number: typeof pr.number === 'number' ? pr.number : 0,
    url: str(pr.html_url) ?? '',
    title: str(pr.title) ?? '',
    state: pr.merged === true ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
    isDraft: pr.draft === true,
    author: toActor(str(pr.user?.login)),
    baseRef: str(pr.base?.ref) ?? '',
    headRef: str(pr.head?.ref) ?? '',
    headSha: str(pr.head?.sha),
    headIsFork: isForkHead(headRepoName, baseRepoName),
    mergedAt: str(pr.merged_at),
    mergeable,
    checks: checksSummaryFrom(statuses),
    reviewDecision: reviewDecisionFrom(reviews),
    activity,
  }
}

export class ForgejoCodeHost implements CodeHost {
  readonly name = 'forgejo' as const
  private readonly runner: CommandRunner
  private readonly cwd: string
  private readonly host: string
  private readonly owner: string
  private readonly repo: string
  private readonly token: string
  private readonly tokenEnv: string

  constructor(opts: {
    runner: CommandRunner
    cwd: string
    host: string
    owner: string
    repo: string
    token: string
    /** The variable the token came from, named in the hint when the host refuses it. `FORGEJO_TOKEN` when omitted. */
    tokenEnv?: string
  }) {
    this.runner = opts.runner
    this.cwd = opts.cwd
    this.host = opts.host
    this.owner = opts.owner
    this.repo = opts.repo
    this.token = opts.token
    this.tokenEnv = opts.tokenEnv ?? DEFAULT_FORGEJO_TOKEN_ENV
  }

  /**
   * The `Authorization` header as a `curl` config-file line (see
   * `-K`/`--config` in `curl(1)`), not a `-H` argument. An argument stays in
   * the process's command line, where `ps`, `/proc/<pid>/cmdline` and other
   * process listings can read it. `-K -` reads this line from stdin instead,
   * which the seam's `input` option feeds.
   *
   * Quoting follows `curl(1)`'s config-file syntax: a value with a space needs
   * double quotes, and `\` and `"` inside it must be escaped, or they would end
   * the quoted value early. CR and LF are dropped: the config is read line by
   * line, so a newline in the token (a CRLF `.env`, say) would start another
   * curl option, such as `url =` or `output =`.
   */
  private authConfig(): string {
    const escaped = this.token
      .replace(/[\r\n]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
    return `header = "Authorization: token ${escaped}"\n`
  }

  /**
   * One authenticated `curl` call against `/api/v1/<path>`. Fails when curl
   * did not run or could not reach the host. The caller reads the HTTP status
   * ({@link call} turns an error status into a failure).
   */
  private request(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Result<{ status: number; body: string }, CodeHostFailure> {
    const argv = [
      // Must be the first argument to take effect. It skips `~/.curlrc`, so a
      // config file the caller does not control cannot add headers, a proxy
      // or a `-K` to every request.
      '-q',
      '-sS',
      '-w',
      `${STATUS_MARKER}%{http_code}`,
      '-K',
      '-',
    ]
    if (body !== undefined) {
      argv.push('-H', 'Content-Type: application/json', '-X', method, '-d', JSON.stringify(body))
    } else if (method !== 'GET') {
      argv.push('-X', method)
    }
    const url = `https://${this.host}/api/v1/${path}`
    argv.push(url)
    // `cwd` does not affect curl (every URL is absolute), but
    // `CommandRunOptions.cwd` is required. `input` is the `-K -` config text
    // above, which keeps the token out of argv.
    const result = this.runner.run(argv, { cwd: this.cwd, input: this.authConfig() })
    // The failure names the URL, never the argv: a request body is the caller's text.
    const failed = classifyFailure(result, { binary: 'curl', argv: [url] })
    if (failed !== null) return err(this.curlFailure(failed))
    const parsed = parseCurlResponse(result.stdout)
    if (parsed === null) {
      return err({
        kind: 'unreadable',
        message: `Forgejo at ${this.host} answered, but the response could not be read.`,
        host: 'forgejo',
      })
    }
    return ok(parsed)
  }

  /** The failure for a curl run that did not complete: the command seam's kind, with the network kinds named. */
  private curlFailure(failed: CommandFailure): CodeHostFailure {
    const base = { host: 'forgejo' as const, cause: failed }
    const detail = failed.detail === undefined ? {} : { detail: failed.detail }
    if (failed.kind === 'not-installed') {
      return {
        kind: 'not-installed',
        message: failed.message,
        hint: CURL_INSTALL_HINT,
        ...detail,
        ...base,
      }
    }
    if (failed.kind === 'exit' && failed.exitCode === CURL_TIMEOUT_EXIT) {
      return {
        kind: 'timeout',
        message: `Forgejo at ${this.host} did not answer in time.`,
        hint: 'Check your network connection and try again.',
        ...detail,
        ...base,
      }
    }
    if (
      failed.kind === 'exit' &&
      failed.exitCode !== null &&
      CURL_NETWORK_EXITS.has(failed.exitCode)
    ) {
      return {
        kind: 'network',
        message: `Forgejo at ${this.host} could not be reached.`,
        hint: 'Check your network connection and that the host is reachable.',
        ...detail,
        ...base,
      }
    }
    return { kind: failed.kind, message: failed.message, ...detail, ...base }
  }

  /** The failure for an HTTP error status the host answered. */
  private statusFailure(status: number, body: string): CodeHostFailure {
    const snippet = body.trim().slice(0, 300)
    const detail = snippet === '' ? `HTTP ${status}` : `HTTP ${status}: ${snippet}`
    const base = { host: 'forgejo' as const, status, detail }
    if (status === 401 || status === 403) {
      return {
        kind: 'not-authenticated',
        message: `Forgejo at ${this.host} refused the token.`,
        hint: `Set ${this.tokenEnv} to a valid token.`,
        ...base,
      }
    }
    if (status === 404) {
      return {
        kind: 'not-found',
        message: `Forgejo at ${this.host} has no such repository or pull request, or the token cannot see it.`,
        hint: 'Check the repository name and that the token can see it.',
        ...base,
      }
    }
    if (status === 429) {
      return {
        kind: 'rate-limited',
        message: `Forgejo at ${this.host} rate limit was reached.`,
        hint: 'Wait a few minutes and try again.',
        ...base,
      }
    }
    return { kind: 'http', message: `Forgejo at ${this.host} answered HTTP ${status}.`, ...base }
  }

  /** {@link request}, with an error status as a failure. */
  private call(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Result<{ status: number; body: string }, CodeHostFailure> {
    const res = this.request(method, path, body)
    if (!res.ok) return res
    if (res.value.status < 200 || res.value.status >= 300) {
      return err(this.statusFailure(res.value.status, res.value.body))
    }
    return res
  }

  /** `GET` a JSON value; a body that is not JSON is `unreadable`. */
  private getJson(path: string): Result<unknown, CodeHostFailure> {
    const res = this.call('GET', path)
    if (!res.ok) return res
    try {
      return ok(JSON.parse(res.value.body) as unknown)
    } catch {
      return err(this.unreadable())
    }
  }

  private unreadable(): CodeHostFailure {
    return {
      kind: 'unreadable',
      message: `Forgejo at ${this.host} answered, but the response could not be read.`,
      host: 'forgejo',
    }
  }

  /** `GET` a JSON array; anything else is `unreadable`. */
  private getArrayResult(path: string): Result<unknown[], CodeHostFailure> {
    const res = this.getJson(path)
    if (!res.ok) return res
    return Array.isArray(res.value) ? ok(res.value) : err(this.unreadable())
  }

  /**
   * Raw PR listing for `owner/repo`, filtered and capped. Forgejo's `pulls`
   * listing is paginated, so this reads page after page until `limit` matching
   * rows are in or a short page says there are no more. The author filter runs
   * on each page before the cap, as `gh pr list --author --limit` does, so
   * `limit` counts the author's PRs, not the newest PRs of anyone.
   */
  private listRawPrs(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
    repo?: string
  }): Result<RawPr[], CodeHostFailure> {
    const state = q.state ?? 'open'
    const target = q.repo ?? `${this.owner}/${this.repo}`
    // With no author filter every row counts, so a small limit needs only a small page.
    const pageSize =
      q.author === undefined && q.limit !== undefined
        ? Math.max(1, Math.min(q.limit, PAGE_SIZE))
        : PAGE_SIZE
    const out: RawPr[] = []
    for (let page = 1; q.limit === undefined || out.length < q.limit; page++) {
      const rows = this.getArrayResult(
        `repos/${target}/pulls?state=${state}&page=${page}&limit=${pageSize}`,
      )
      if (!rows.ok) return rows
      out.push(
        ...(rows.value as RawPr[]).filter(
          (pr) => q.author === undefined || str(pr.user?.login) === q.author,
        ),
      )
      if (rows.value.length < pageSize) break
    }
    return ok(out.slice(0, q.limit ?? undefined))
  }

  listPrs(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
  }): Result<CodeHostPrSummary[], CodeHostFailure> {
    const rows = this.listRawPrs(q)
    if (!rows.ok) return rows
    return ok(
      rows.value.map((pr) => ({
        number: typeof pr.number === 'number' ? pr.number : 0,
        headRef: str(pr.head?.ref) ?? '',
        author: toActor(str(pr.user?.login)),
        labels: (pr.labels ?? []).map((l) => str(l.name) ?? '').filter((n) => n !== ''),
        isDraft: pr.draft === true,
        updatedAt: str(pr.updated_at),
      })),
    )
  }

  listPrDetails(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
    repo?: string
  }): Result<CodeHostPrDetail[], CodeHostFailure> {
    const rows = this.listRawPrs(q)
    if (!rows.ok) return rows
    const target = q.repo ?? `${this.owner}/${this.repo}`
    const details: CodeHostPrDetail[] = []
    for (const pr of rows.value) {
      const number = typeof pr.number === 'number' ? pr.number : 0
      // One request per PR, because the listing has no review count. A failed
      // request fails the whole listing. Reading it as "no reviews" would let
      // a caller rewrite a PR that has reviews.
      const reviews = this.getArrayResult(`repos/${target}/pulls/${number}/reviews`)
      if (!reviews.ok) return reviews
      const headRepo = str(pr.head?.repo?.full_name)
      const baseRepo = str(pr.base?.repo?.full_name) ?? target
      details.push({
        number,
        title: str(pr.title) ?? '',
        url: str(pr.html_url) ?? '',
        baseRef: str(pr.base?.ref) ?? '',
        headRef: str(pr.head?.ref) ?? '',
        headSha: str(pr.head?.sha),
        isDraft: pr.draft === true,
        labels: (pr.labels ?? []).map((l) => str(l.name) ?? '').filter((n) => n !== ''),
        reviewCount: reviews.value.length,
        isCrossRepository: isForkHead(headRepo, baseRepo),
      })
    }
    return ok(details)
  }

  getPr(
    number: number,
    _opts: { since: string | null },
  ): Result<CodeHostPr | null, CodeHostFailure> {
    const res = this.request('GET', `repos/${this.owner}/${this.repo}/pulls/${number}`)
    if (!res.ok) return res
    // 404 on one PR number is the answer "there is no such PR", as it is for `gh pr view`.
    if (res.value.status === 404) return ok(null)
    if (res.value.status < 200 || res.value.status >= 300) {
      return err(this.statusFailure(res.value.status, res.value.body))
    }
    let pr: RawPr
    try {
      pr = JSON.parse(res.value.body) as RawPr
    } catch {
      return err(this.unreadable())
    }

    // If any call below fails, the whole `getPr` fails. A failed status call
    // read as "no statuses" would give `rollup: 'none'`, which looks like a PR
    // with no checks that can be merged. A failed reviews call would read as
    // no reviews. The caller gets the failure and decides.
    const commentsRes = this.getArrayResult(
      `repos/${this.owner}/${this.repo}/issues/${number}/comments`,
    )
    if (!commentsRes.ok) return commentsRes
    const comments = commentsRes.value as RawComment[]
    const reviewsRes = this.getArrayResult(
      `repos/${this.owner}/${this.repo}/pulls/${number}/reviews`,
    )
    if (!reviewsRes.ok) return reviewsRes
    const reviews = reviewsRes.value as RawReview[]

    // Forgejo has no single endpoint for per-line comments like GitHub's REST
    // `pulls/<n>/comments`. Inline comments sit under each review, so this
    // costs one request per review.
    const reviewComments: RawReviewComment[] = []
    for (const r of reviews) {
      if (typeof r.id !== 'number' && typeof r.id !== 'string') continue
      const entries = this.getArrayResult(
        `repos/${this.owner}/${this.repo}/pulls/${number}/reviews/${r.id}/comments`,
      )
      if (!entries.ok) return entries
      reviewComments.push(...(entries.value as RawReviewComment[]))
    }

    const headSha = str(pr.head?.sha)
    let combined: RawCombinedStatus = { statuses: [] }
    if (headSha !== null) {
      const status = this.getJson(`repos/${this.owner}/${this.repo}/commits/${headSha}/status`)
      if (!status.ok) return status
      combined = status.value as RawCombinedStatus
    }

    return ok(forgejoPrFrom(pr, comments, reviews, reviewComments, combined.statuses ?? []))
  }

  postComment(number: number, body: string): { id: string; createdAt: string } {
    const res = unwrap(
      this.call('POST', `repos/${this.owner}/${this.repo}/issues/${number}/comments`, { body }),
    )
    try {
      const parsed = JSON.parse(res.body) as { id?: unknown; created_at?: unknown }
      return {
        id: typeof parsed.id === 'number' || typeof parsed.id === 'string' ? String(parsed.id) : '',
        createdAt: str(parsed.created_at) ?? new Date().toISOString(),
      }
    } catch {
      return { id: '', createdAt: new Date().toISOString() }
    }
  }

  updateComment(_number: number, commentId: string, body: string): void {
    const res = this.request(
      'PATCH',
      `repos/${this.owner}/${this.repo}/issues/comments/${commentId}`,
      { body },
    )
    if (res.ok && res.value.status === 404) throw new CommentNotFoundError(commentId, 'HTTP 404')
    if (res.ok && (res.value.status < 200 || res.value.status >= 300)) {
      throw new FailureError(this.statusFailure(res.value.status, res.value.body))
    }
    unwrap(res)
  }

  listComments(
    number: number,
  ): Result<{ id: string; createdAt: string; body: string }[], CodeHostFailure> {
    const rows = this.getArrayResult(`repos/${this.owner}/${this.repo}/issues/${number}/comments`)
    if (!rows.ok) return rows
    const out: { id: string; createdAt: string; body: string }[] = []
    for (const c of rows.value as { id?: unknown; body?: unknown; created_at?: unknown }[]) {
      if (typeof c.id !== 'number' && typeof c.id !== 'string') continue
      out.push({
        id: String(c.id),
        createdAt: typeof c.created_at === 'string' ? c.created_at : '',
        body: typeof c.body === 'string' ? c.body : '',
      })
    }
    return ok(out)
  }

  /** Forgejo has no ready/draft toggle (its `WIP:` title prefix is a different mechanism). */
  setDraft(_number: number, _draft: boolean): void {
    throw new CodeHostUnsupported('forgejo', 'setDraft')
  }

  updateBranch(number: number, style: 'merge' | 'rebase'): void {
    unwrap(
      this.call('POST', `repos/${this.owner}/${this.repo}/pulls/${number}/update?style=${style}`),
    )
  }

  /**
   * This adapter reads no thread resolution state from Forgejo, so it cannot
   * say whether threads are resolved. It returns an `unsupported` failure
   * ("unknown"), which a caller that blocks merges on threads treats as a
   * refusal.
   */
  reviewThreads(_number: number): Result<ReviewThreadState[], CodeHostFailure> {
    return err({
      kind: 'unsupported',
      message: `Forgejo at ${this.host} review threads cannot be read.`,
      host: 'forgejo',
    })
  }

  /** Not supported yet. */
  mergePr(_number: number, _opts: { headSha: string; method: MergeMethod }): void {
    throw new CodeHostUnsupported('forgejo', 'mergePr')
  }

  /** Not supported yet. */
  createPr(_input: CreatePrInput): { number: number; url: string } {
    throw new CodeHostUnsupported('forgejo', 'createPr')
  }

  /**
   * A Forgejo PR URL is `https://<host>/<owner>/<repo>/pulls/<n>`, with
   * `pulls`, not GitHub's `pull`. Only a URL on this instance's host counts,
   * per `CodeHost.parsePrUrl`. A URL from another Forgejo instance is a real
   * PR, but not one this adapter can act on.
   */
  parsePrUrl(url: string): PrRef | null {
    const m = /^(?:https?:\/\/)?([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/pulls\/(\d+)(?:[/?#].*)?$/i.exec(
      url.trim(),
    )
    if (m === null || m[1]!.toLowerCase() !== this.host.toLowerCase()) return null
    const number = Number(m[4])
    if (!Number.isSafeInteger(number) || number <= 0) return null
    return { codeHost: 'forgejo', owner: m[2]!, repo: m[3]!, number }
  }

  prForBranch(branch: string): Result<number | null, CodeHostFailure> {
    const rows = this.listPrs({ state: 'open' })
    if (!rows.ok) return rows
    return ok(rows.value.find((pr) => pr.headRef === branch)?.number ?? null)
  }
}
