/**
 * `ForgejoCodeHost` — the `CodeHost` port over Forgejo's REST API.
 *
 * `CodeHost` (`./types.ts`) is deliberately SYNCHRONOUS — see that file's own
 * top-of-file doc comment: every current caller is sync end to end, and going async here would
 * color the whole call graph for no caller that needs it. A `fetch`-based
 * REST client cannot satisfy that: `fetch` always returns a `Promise`, with
 * no synchronous escape hatch. So this adapter reaches Forgejo the same way
 * `./github.ts` reaches GitHub — by shelling out, through the command seam,
 * to a CLI that does the network I/O in a subprocess this adapter blocks on.
 * `gh` is that CLI for GitHub; Forgejo has no equivalent, so this uses `curl`
 * directly (`-sS -w '<marker><code>'`, parsed by `parseCurlResponse` below).
 *
 * Auth: a Forgejo personal access token, `Authorization: token <token>`
 * (per the Forgejo API docs). This adapter takes the
 * token as a plain constructor argument — where it comes from is
 * `./select.ts#selectCodeHost`'s job (an environment variable), not this
 * file's; an adapter that manages its own secret lookup is harder to test
 * and harder to reuse from a second host.
 *
 * `host`/`owner`/`repo` are also constructor arguments rather than
 * discovered here: unlike `gh`, which infers the current repository from
 * its own git-aware config, there is no Forgejo CLI to ask, and a
 * self-hosted instance has no fixed hostname to guess. `./select.ts`
 * resolves all three from the `origin` remote once, before constructing
 * this adapter.
 */

import type { CommandRunner } from '@osdlc/command-seam'
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
 * no `gh`-equivalent CLI to manage its own auth, so the caller must hold this
 * itself. A caller can name another variable via the `forgejoTokenEnv` option.
 */
export const DEFAULT_FORGEJO_TOKEN_ENV = 'FORGEJO_TOKEN'

const STATUS_MARKER = '\nHTTPSTATUS:'

/** One `curl -w` response, split back into its body and status code. Exported for its own unit test. */
export function parseCurlResponse(stdout: string): { status: number; body: string } | null {
  const at = stdout.lastIndexOf(STATUS_MARKER)
  if (at === -1) return null
  const status = Number(stdout.slice(at + STATUS_MARKER.length).trim())
  if (!Number.isFinite(status)) return null
  return { status, body: stdout.slice(0, at) }
}

/** Raw shapes off Forgejo's REST responses — only the fields this adapter reads. */
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
  /** Confirmed fields on `PullReview` per the Forgejo API docs. */
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

/** No `[bot]`-suffix (or any other bot-marking) convention is documented for Forgejo — plain passthrough. */
function toActor(login: string | null): Actor | null {
  return login === null || login === '' ? null : { login, isBot: false }
}

/**
 * Combined-status `state` vocabulary (`pending|success|error|failure|warning|
 * skipped`, per the Forgejo API docs) mapped onto the same
 * rollup priority `github.ts`'s `checksSummaryFrom` uses: a clear failure
 * wins, then a clear in-progress state, else it's passing.
 */
function checksSummaryFrom(statuses: readonly RawStatus[]): CheckSummary {
  const states = statuses.map((s) => str(s.state) ?? 'pending')
  const rollup: CheckSummary['rollup'] = states.some((s) => s === 'failure' || s === 'error')
    ? 'failure'
    : states.some((s) => s === 'pending')
      ? 'pending'
      : statuses.length === 0
        ? 'none'
        : 'success'
  const failed = statuses.filter((s) => s.state === 'failure' || s.state === 'error')
  const failing = failed.map((s) => str(s.context) ?? 'unknown')
  const failingUrls = failed
    .filter((s): s is RawStatus & { context: string; target_url: string } => {
      return str(s.context) !== null && str(s.target_url) !== null
    })
    .map((s) => ({ name: s.context, url: s.target_url }))
  // Forgejo has no documented billing/spending-limit failure mode analogous
  // to GitHub Actions' "job was not started" — `blocked` is always empty here.
  return { rollup, failing, failingUrls, blocked: [] }
}

/**
 * Forgejo has no `reviewDecision` field — derive it from the review list:
 * each reviewer's most-recently-submitted review wins, then GitHub's own
 * rule applies to that reduced set. The `ReviewStateType` string values
 * below (`APPROVED`/`REQUEST_CHANGES`) are **inferred, not confirmed** by
 * the spec — an
 * unrecognized state still counts toward "a review exists" for
 * `review_required`, but never toward an approve/reject verdict.
 *
 * `dismissed`/`stale` ARE confirmed fields (same doc, Reviews section) — a
 * review flagged either way is excluded before "most-recently-submitted"
 * even looks at it, the same as Forgejo's own UI treats a dismissed or
 * stale review as no longer standing. What deliberately stays unhandled:
 * whether a later COMMENT/PENDING/REQUEST_REVIEW review should retract an
 * earlier APPROVED from the same reviewer — GitHub's own reset rule for
 * that case isn't in the confirmed field list either, and guessing it wrong
 * would be worse than this function's honest fallback to `review_required`.
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
  // A plain boolean, not GitHub's 3-state enum — see this module's top doc,
  // and the Forgejo API docs, which confirms
  // Forgejo's own API "collapses CONFLICTING and the merge-ineligible half
  // of UNKNOWN into one `false`" with no further field to tell them apart.
  // That's a real API limitation this adapter can't see past for a PR still
  // being checked or one whose check errored — those stay `'conflicting'`
  // for now, a documented simplification, not a bug this diff can fix.
  //
  // A draft is the one merge-ineligible case the payload DOES let us tell
  // apart (`draft` is its own field) — Forgejo returns `mergeable: false`
  // for drafts (they're not merge-ready by definition) but that is never a
  // real conflict, so a classifier would otherwise mislabel every
  // draft PR as conflicting. Treat a draft's `false` as `'unknown'` instead.
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
    // Unknown head repo reads as a fork: fail closed.
    headIsFork: headRepoName === null || headRepoName.toLowerCase() !== baseRepoName?.toLowerCase(),
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

  constructor(opts: {
    runner: CommandRunner
    cwd: string
    host: string
    owner: string
    repo: string
    token: string
  }) {
    this.runner = opts.runner
    this.cwd = opts.cwd
    this.host = opts.host
    this.owner = opts.owner
    this.repo = opts.repo
    this.token = opts.token
  }

  /**
   * The `Authorization` header, as a `curl` config-file line (see
   * `-K`/`--config` in `curl(1)`) rather than a `-H` argv entry — an argv
   * value sits in that process's command line for the rest of its life
   * (`ps`, `/proc/<pid>/cmdline`, any process-listing tool on a shared box),
   * while `-K -` reads this off a pipe the seam's `input` option feeds
   * through stdin, the same place a plain `curl -u user:pass` (or `git`'s
   * own credential helpers) already keep secrets out of. Quoting per
   * `curl(1)`'s config-file syntax: a value with a space needs double
   * quotes, and `\`/`"` inside it need escaping or they would end the quoted
   * value early.
   */
  private authConfig(): string {
    const escaped = this.token.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `header = "Authorization: token ${escaped}"\n`
  }

  /** One authenticated `curl` call against `/api/v1/<path>`; null on any transport failure. */
  private request(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): { status: number; body: string } | null {
    const argv = [
      // Must be the very first argument to take effect: skips `~/.curlrc`,
      // so a config file the caller does not control cannot inject its own
      // headers, proxy, or `-K` onto every request this adapter makes.
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
    argv.push(`https://${this.host}/api/v1/${path}`)
    // `cwd` is irrelevant to a `curl` call's outcome (every argument is a
    // full URL) but `CommandRunOptions.cwd` is not optional — the command
    // seam always spawns relative to a working directory. `input` is the
    // `-K -` config text above, carrying the token off argv and onto stdin.
    const result = this.runner.run(argv, { cwd: this.cwd, input: this.authConfig() })
    if (result.exitCode !== 0) return null
    return parseCurlResponse(result.stdout)
  }

  /** `GET` a JSON array; `null` on any transport/parse failure. */
  private getArrayOrNull(path: string): unknown[] | null {
    const res = this.request('GET', path)
    if (res === null || res.status < 200 || res.status >= 300) return null
    try {
      const parsed: unknown = JSON.parse(res.body)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  /** `GET` a JSON array; `[]` on any transport/parse failure — a listing endpoint degrades to empty, never throws. */
  private getArray(path: string): unknown[] {
    return this.getArrayOrNull(path) ?? []
  }

  /** Raw PR listing for `owner/repo`, filtered and capped; `null` when the call failed. */
  private listRawPrs(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
    repo?: string
  }): RawPr[] | null {
    const state = q.state ?? 'open'
    const target = q.repo ?? `${this.owner}/${this.repo}`
    const paging = q.limit === undefined ? '' : `&limit=${q.limit}`
    const res = this.request('GET', `repos/${target}/pulls?state=${state}${paging}`)
    if (res === null || res.status < 200 || res.status >= 300) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(res.body)
    } catch {
      return null
    }
    if (!Array.isArray(parsed)) return null
    return (parsed as RawPr[])
      .filter((pr) => q.author === undefined || str(pr.user?.login) === q.author)
      .slice(0, q.limit ?? undefined)
  }

  listPrs(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
  }): CodeHostPrSummary[] | null {
    const rows = this.listRawPrs(q)
    if (rows === null) return null
    return rows.map((pr) => ({
      number: typeof pr.number === 'number' ? pr.number : 0,
      headRef: str(pr.head?.ref) ?? '',
      author: toActor(str(pr.user?.login)),
      labels: (pr.labels ?? []).map((l) => str(l.name) ?? '').filter((n) => n !== ''),
      isDraft: pr.draft === true,
      updatedAt: str(pr.updated_at),
    }))
  }

  listPrDetails(q: {
    state?: 'open' | 'closed' | 'all'
    author?: string
    limit?: number
    repo?: string
  }): CodeHostPrDetail[] | null {
    const rows = this.listRawPrs(q)
    if (rows === null) return null
    const target = q.repo ?? `${this.owner}/${this.repo}`
    const details: CodeHostPrDetail[] = []
    for (const pr of rows) {
      const number = typeof pr.number === 'number' ? pr.number : 0
      // One request per PR: the listing carries no review count. A failed
      // request fails the whole listing rather than reading as "no reviews",
      // which would let the rebase guard rewrite a reviewed PR.
      const reviews = this.getArrayOrNull(`repos/${target}/pulls/${number}/reviews`)
      if (reviews === null) return null
      const headRepo = str(pr.head?.repo?.full_name)
      details.push({
        number,
        title: str(pr.title) ?? '',
        url: str(pr.html_url) ?? '',
        baseRef: str(pr.base?.ref) ?? '',
        headRef: str(pr.head?.ref) ?? '',
        headSha: str(pr.head?.sha),
        isDraft: pr.draft === true,
        labels: (pr.labels ?? []).map((l) => str(l.name) ?? '').filter((n) => n !== ''),
        reviewCount: reviews.length,
        isCrossRepository: headRepo !== null && headRepo.toLowerCase() !== target.toLowerCase(),
      })
    }
    return details
  }

  getPr(number: number, _opts: { since: string | null }): CodeHostPr | null {
    const res = this.request('GET', `repos/${this.owner}/${this.repo}/pulls/${number}`)
    if (res === null || res.status < 200 || res.status >= 300) return null
    let pr: RawPr
    try {
      pr = JSON.parse(res.body) as RawPr
    } catch {
      return null
    }

    const comments = this.getArray(
      `repos/${this.owner}/${this.repo}/issues/${number}/comments`,
    ) as RawComment[]
    const reviews = this.getArray(
      `repos/${this.owner}/${this.repo}/pulls/${number}/reviews`,
    ) as RawReview[]

    // Forgejo has no flat per-line-comment endpoint like GitHub's REST
    // `pulls/<n>/comments` — inline comments are nested under each review,
    // so folding them into one `activity` list costs one request per
    // review (N+1). Documented tradeoff, same shape as `github.ts`'s own
    // per-PR REST cost for its equivalent fetch.
    const reviewComments: RawReviewComment[] = []
    for (const r of reviews) {
      if (typeof r.id !== 'number' && typeof r.id !== 'string') continue
      const entries = this.getArray(
        `repos/${this.owner}/${this.repo}/pulls/${number}/reviews/${r.id}/comments`,
      ) as RawReviewComment[]
      reviewComments.push(...entries)
    }

    const headSha = str(pr.head?.sha)
    const combined =
      headSha === null
        ? { statuses: [] }
        : (() => {
            const r = this.request(
              'GET',
              `repos/${this.owner}/${this.repo}/commits/${headSha}/status`,
            )
            if (r === null || r.status < 200 || r.status >= 300) return { statuses: [] }
            try {
              return JSON.parse(r.body) as RawCombinedStatus
            } catch {
              return { statuses: [] }
            }
          })()

    return forgejoPrFrom(pr, comments, reviews, reviewComments, combined.statuses ?? [])
  }

  postComment(number: number, body: string): { id: string; createdAt: string } {
    const res = this.request('POST', `repos/${this.owner}/${this.repo}/issues/${number}/comments`, {
      body,
    })
    if (res === null || res.status < 200 || res.status >= 300) {
      throw new Error(
        `ForgejoCodeHost.postComment: request failed (status ${res?.status ?? 'none'})`,
      )
    }
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
    if (res !== null && res.status === 404) throw new CommentNotFoundError(commentId, 'HTTP 404')
    if (res === null || res.status < 200 || res.status >= 300) {
      throw new Error(
        `ForgejoCodeHost.updateComment: request failed (status ${res?.status ?? 'none'})`,
      )
    }
  }

  listComments(number: number): { id: string; createdAt: string; body: string }[] | null {
    const res = this.request('GET', `repos/${this.owner}/${this.repo}/issues/${number}/comments`)
    if (res === null || res.status < 200 || res.status >= 300) return null
    try {
      const parsed = JSON.parse(res.body) as {
        id?: unknown
        body?: unknown
        created_at?: unknown
      }[]
      if (!Array.isArray(parsed)) return null
      const out: { id: string; createdAt: string; body: string }[] = []
      for (const c of parsed) {
        if (typeof c.id !== 'number' && typeof c.id !== 'string') continue
        out.push({
          id: String(c.id),
          createdAt: typeof c.created_at === 'string' ? c.created_at : '',
          body: typeof c.body === 'string' ? c.body : '',
        })
      }
      return out
    } catch {
      return null
    }
  }

  /** Forgejo has no ready/draft toggle (its `WIP:` title prefix is a different mechanism). */
  setDraft(_number: number, _draft: boolean): void {
    throw new CodeHostUnsupported('forgejo', 'setDraft')
  }

  updateBranch(number: number, style: 'merge' | 'rebase'): void {
    const res = this.request(
      'POST',
      `repos/${this.owner}/${this.repo}/pulls/${number}/update?style=${style}`,
    )
    if (res === null || res.status < 200 || res.status >= 300) {
      throw new Error(
        `ForgejoCodeHost.updateBranch: request failed (status ${res?.status ?? 'none'})`,
      )
    }
  }

  /**
   * Forgejo exposes review comments but no thread-resolution grouping this
   * adapter reads, so a merge gate cannot learn whether threads are settled:
   * `null` ("unknown"), which a gating caller treats as a refusal.
   */
  reviewThreads(_number: number): ReviewThreadState[] | null {
    return null
  }

  /** Not supported yet: merging on Forgejo is not part of the orchestrator's 1.0 path. */
  mergePr(_number: number, _opts: { headSha: string; method: MergeMethod }): void {
    throw new CodeHostUnsupported('forgejo', 'mergePr')
  }

  /** Not supported yet: opening a PR on Forgejo is a later code-host milestone. */
  createPr(_input: CreatePrInput): { number: number; url: string } {
    throw new CodeHostUnsupported('forgejo', 'createPr')
  }

  /**
   * A Forgejo PR URL is `https://<host>/<owner>/<repo>/pulls/<n>` —
   * `pulls`, not GitHub's `pull`. Only a URL naming THIS instance's host
   * counts, per `CodeHost.parsePrUrl`'s own contract ("null when `url` names
   * no PR this code host recognizes") — a URL from a different Forgejo
   * instance is a real PR, just not one this adapter can act on.
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

  prForBranch(branch: string): number | null {
    const rows = this.listPrs({ state: 'open' })
    if (rows === null) return null
    return rows.find((pr) => pr.headRef === branch)?.number ?? null
  }
}
