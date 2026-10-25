/**
 * Parsers from `gh --json` payloads to the typed model.
 *
 * Nothing here has side effects, so code that runs its own calls can reuse
 * it without starting a process, and the hard cases can be tested as data.
 *
 * It handles two payload differences:
 *
 *  1. A bot's login is spelled three ways. GraphQL (`gh api graphql`, and a
 *     comment's author in `gh pr view --json`) gives the bare login
 *     (`github-actions`). gh's own `--json` export of a pull request's
 *     author prefixes it (`app/github-actions`, with `is_bot: true`). REST
 *     (`gh api`) suffixes it (`github-actions[bot]`). Comparing one with
 *     another never matches, and no error shows it. Then a bot's comments
 *     are treated as human review feedback. Logins are normalized here, once,
 *     to the bare form.
 *  2. `statusCheckRollup` holds two node types. A modern `CheckRun` carries
 *     `name`/`status`/`conclusion`. A legacy `StatusContext` carries
 *     `context`/`state`. Both map to one verdict, so a caller never has to
 *     know which it got.
 */

import type {
  Actor,
  CheckConclusion,
  CheckRun,
  Comment,
  Label,
  MergeableState,
  PrSearchHit,
  PullRequest,
  Repository,
  Review,
  ReviewDecision,
} from './types.ts'

// ── primitives ──────────────────────────────────────────────────────────────

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function str(x: unknown, fallback = ''): string {
  return typeof x === 'string' ? x : fallback
}

function strOrNull(x: unknown): string | null {
  return typeof x === 'string' && x !== '' ? x : null
}

function bool(x: unknown): boolean {
  return x === true
}

/**
 * A comment/review id. GraphQL sends a string node id, REST a numeric one.
 * Either becomes a string. A numeric id of 2^53 or more has already lost precision
 * in `JSON.parse` by the time it gets here.
 */
function idOrNull(x: unknown): string | null {
  if (typeof x === 'string' && x !== '') return x
  if (typeof x === 'number' && Number.isFinite(x)) return String(x)
  return null
}

function list(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}

// ── actors ──────────────────────────────────────────────────────────────────

/**
 * The bare login: a single trailing `[bot]` (REST) or a leading `app/` (gh's
 * `--json` export of a bot author) is stripped, so every spelling of one bot
 * compares equal. A user login cannot hold `/` or `[`, so neither strip can
 * change one.
 */
export function normalizeAuthorLogin(login: string): string {
  if (login.endsWith('[bot]')) return login.slice(0, -'[bot]'.length)
  if (login.startsWith('app/')) return login.slice('app/'.length)
  return login
}

/**
 * Parse an author node from GraphQL (`author`) or REST (`user`).
 * Null when there is no login, or the login is empty once `[bot]` or `app/` is removed.
 */
export function parseActor(x: unknown): Actor | null {
  if (!isRecord(x)) return null
  const raw = str(x['login'])
  const login = normalizeAuthorLogin(raw)
  if (login === '') return null
  return {
    login,
    // Only some payloads carry `is_bot`. The suffix and prefix mark a bot too.
    isBot: bool(x['is_bot']) || login !== raw,
  }
}

// ── checks ──────────────────────────────────────────────────────────────────

/**
 * Conclusions that mean the check failed.
 *
 * `ACTION_REQUIRED` is not here on purpose. It means a person must do
 * something, not that the build broke, and callers treat it as neutral.
 * Adding a member changes every caller's verdicts, so decide it on purpose.
 */
const FAILED_CONCLUSIONS = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE'])

/** Legacy StatusContext `state` values that mean failure. */
const FAILED_STATES = new Set(['FAILURE', 'ERROR'])

/** One `statusCheckRollup` entry, whichever node type it is. */
export function parseCheckRun(x: unknown): CheckRun | null {
  if (!isRecord(x)) return null

  // Legacy StatusContext: `context` + `state`, no conclusion.
  const context = strOrNull(x['context'])
  if (context !== null) {
    const state = str(x['state']).toUpperCase()
    return {
      name: context,
      status: null,
      conclusion: null,
      verdict: FAILED_STATES.has(state) ? 'failure' : state === 'SUCCESS' ? 'success' : 'pending',
      url: strOrNull(x['targetUrl']),
    }
  }

  const name = strOrNull(x['name'])
  if (name === null) return null
  const status = str(x['status']).toUpperCase()
  const conclusion = strOrNull(x['conclusion']) as CheckConclusion
  // `detailsUrl` is the modern CheckRun field and `targetUrl` the legacy
  // StatusContext one. A payload sometimes carries either on a node with a
  // `name`, so read both.
  const url = strOrNull(x['detailsUrl']) ?? strOrNull(x['targetUrl'])

  // Still running, so not a pass. If "no failure yet" counted as green, a red build could merge.
  if (status !== '' && status !== 'COMPLETED') {
    return { name, status, conclusion, verdict: 'pending', url }
  }
  const verdict =
    conclusion === null
      ? 'pending'
      : FAILED_CONCLUSIONS.has(conclusion)
        ? 'failure'
        : conclusion === 'SUCCESS'
          ? 'success'
          : 'neutral'
  return { name, status: status === '' ? null : status, conclusion, verdict, url }
}

/** True iff any check in the rollup failed. */
export function anyCheckFailed(checks: readonly CheckRun[]): boolean {
  return checks.some((c) => c.verdict === 'failure')
}

// ── the pull request ────────────────────────────────────────────────────────

/** Parse a `labels` field (PR, issue, or a bare `gh label list` array) into {@link Label} rows. Every label list in this package goes through it. Skips an item with no name, or an empty name, which reads the same as no name. */
export function parseLabels(x: unknown): Label[] {
  const out: Label[] = []
  for (const item of list(x)) {
    if (!isRecord(item)) continue
    const name = strOrNull(item['name'])
    if (name === null) continue
    out.push({ name, color: str(item['color']), description: str(item['description']) })
  }
  return out
}

function parseComments(x: unknown): Comment[] {
  const out: Comment[] = []
  for (const item of list(x)) {
    if (!isRecord(item)) continue
    out.push({
      id: idOrNull(item['id']),
      // GraphQL says `author`, REST says `user`.
      author: parseActor(item['author'] ?? item['user']),
      body: str(item['body']),
      createdAt: strOrNull(item['createdAt'] ?? item['created_at']),
    })
  }
  return out
}

function parseReviews(x: unknown): Review[] {
  const out: Review[] = []
  for (const item of list(x)) {
    if (!isRecord(item)) continue
    out.push({
      id: idOrNull(item['id']),
      author: parseActor(item['author'] ?? item['user']),
      body: str(item['body']),
      state: str(item['state']),
      submittedAt: strOrNull(item['submittedAt'] ?? item['submitted_at']),
    })
  }
  return out
}

/** `mergeable` has three states. Anything unknown, or absent, is UNKNOWN. */
function parseMergeable(x: unknown): MergeableState {
  const v = str(x).toUpperCase()
  return v === 'MERGEABLE' || v === 'CONFLICTING' ? v : 'UNKNOWN'
}

/** gh returns `""` for "no decision yet". The model says `null`. */
function parseReviewDecision(x: unknown): ReviewDecision {
  const v = strOrNull(x)
  return v === 'APPROVED' || v === 'CHANGES_REQUESTED' || v === 'REVIEW_REQUIRED' ? v : null
}

/**
 * One PR from a `gh --json` object, or null when it carries no usable number.
 *
 * Every field gets a value. A field `gh` was not asked for gets its "not
 * known" value, not `undefined`, so the result is safe to build from
 * any field subset.
 */
export function parsePullRequest(raw: unknown): PullRequest | null {
  if (!isRecord(raw)) return null
  const number = raw['number']
  if (typeof number !== 'number' || !Number.isInteger(number)) return null

  const checks: CheckRun[] = []
  for (const node of list(raw['statusCheckRollup'])) {
    const c = parseCheckRun(node)
    if (c !== null) checks.push(c)
  }

  return {
    number,
    state: str(raw['state']).toUpperCase(),
    title: str(raw['title']),
    body: str(raw['body']),
    url: str(raw['url']),
    isDraft: bool(raw['isDraft']),
    baseRefName: str(raw['baseRefName']),
    headRefName: str(raw['headRefName']),
    headRefOid: strOrNull(raw['headRefOid']),
    isCrossRepository: bool(raw['isCrossRepository']),
    mergeable: parseMergeable(raw['mergeable']),
    mergeStateStatus: str(raw['mergeStateStatus'], 'UNKNOWN').toUpperCase(),
    reviewDecision: parseReviewDecision(raw['reviewDecision']),
    author: parseActor(raw['author'] ?? raw['user']),
    labels: parseLabels(raw['labels']),
    checks,
    comments: parseComments(raw['comments']),
    reviews: parseReviews(raw['reviews']),
    mergedAt: strOrNull(raw['mergedAt'] ?? raw['merged_at']),
    createdAt: strOrNull(raw['createdAt'] ?? raw['created_at']),
    updatedAt: strOrNull(raw['updatedAt'] ?? raw['updated_at']),
  }
}

// ── repositories and search ─────────────────────────────────────────────────

/** A `gh repo list`/`view --json` row as a {@link Repository}, or null without `nameWithOwner`. */
export function parseRepository(raw: unknown): Repository | null {
  if (!isRecord(raw)) return null
  const nameWithOwner = str(raw['nameWithOwner'])
  const slash = nameWithOwner.indexOf('/')
  if (slash <= 0 || slash === nameWithOwner.length - 1) return null
  const branch = raw['defaultBranchRef']
  return {
    nameWithOwner,
    owner: nameWithOwner.slice(0, slash),
    name: nameWithOwner.slice(slash + 1),
    description: str(raw['description']),
    defaultBranch: isRecord(branch) ? strOrNull(branch['name']) : null,
    visibility: strOrNull(raw['visibility']),
    isArchived: bool(raw['isArchived']),
    url: str(raw['url']),
  }
}

/** A `gh search prs --json` row as a {@link PrSearchHit}, or null without a `number`. */
export function parsePrSearchHit(raw: unknown): PrSearchHit | null {
  if (!isRecord(raw)) return null
  const number = raw['number']
  if (typeof number !== 'number') return null
  const repo = raw['repository']
  const slug = isRecord(repo) ? str(repo['nameWithOwner']) : ''
  const slash = slug.indexOf('/')
  return {
    number,
    title: str(raw['title']),
    // Search answers in lower case. `PullRequest.state` is upper case.
    state: str(raw['state']).toUpperCase(),
    url: str(raw['url']),
    isDraft: bool(raw['isDraft']),
    repository:
      slash > 0 && slash < slug.length - 1
        ? { owner: slug.slice(0, slash), repo: slug.slice(slash + 1) }
        : null,
    author: parseActor(raw['author']),
    labels: parseLabels(raw['labels']),
    createdAt: strOrNull(raw['createdAt']),
    updatedAt: strOrNull(raw['updatedAt']),
    closedAt: strOrNull(raw['closedAt']),
  }
}
