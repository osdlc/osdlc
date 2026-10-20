/**
 * `gh --json` payloads → the typed model.
 *
 * Everything here is pure, so an async fan-out can reuse it without going
 * near a subprocess, and so the awkward cases can be tested as data.
 *
 * Two shape hazards this file exists to absorb:
 *
 *  1. **Author logins differ by transport.** GraphQL (`gh pr view --json`)
 *     returns a suffix-less login (`github-actions`); REST (`gh api`) returns
 *     the suffixed one (`github-actions[bot]`). Comparing one against the
 *     other silently never matches, which is how bot noise gets treated as
 *     human review feedback. Logins are normalized to the suffix-less form
 *     here, once.
 *  2. **`statusCheckRollup` holds two different node types.** A modern
 *     `CheckRun` carries `name`/`status`/`conclusion`; a legacy
 *     `StatusContext` carries `context`/`state`. They are folded onto one
 *     verdict axis so a caller never has to know which it got.
 */

import type {
  Actor,
  CheckConclusion,
  CheckRun,
  Comment,
  Label,
  MergeableState,
  PullRequest,
  Review,
  ReviewDecision,
} from './types.ts'

/** A raw `gh --json` object. Deliberately loose: the fields depend on the ask. */
export type PullRequestJson = Record<string, unknown>

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
 * A comment/review id: GraphQL sends a string node id, REST a numeric one —
 * stringify either. A numeric id of 2^53 or more has already lost precision
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
 * Strip a single trailing `[bot]` suffix — REST shape folded to GraphQL shape.
 *
 * The one normalization that makes a login from either transport comparable.
 */
export function normalizeAuthorLogin(login: string): string {
  return login.endsWith('[bot]') ? login.slice(0, -'[bot]'.length) : login
}

/**
 * Parse an author node from either transport (`author` or REST's `user`).
 * Null when there is no login, or the login is empty once `[bot]` is removed.
 */
export function parseActor(x: unknown): Actor | null {
  if (!isRecord(x)) return null
  const raw = str(x['login'])
  const login = normalizeAuthorLogin(raw)
  if (login === '') return null
  return {
    login,
    // `is_bot` is REST/GraphQL-dependent; the suffix is the portable signal.
    isBot: bool(x['is_bot']) || raw.endsWith('[bot]'),
  }
}

// ── checks ──────────────────────────────────────────────────────────────────

/**
 * Conclusions that mean the check failed.
 *
 * `ACTION_REQUIRED` is deliberately not here: it means a human must do
 * something, not that the build broke, and the existing consumers treat it as
 * neutral. Widening this set changes triage verdicts, so it is a decision to
 * make on purpose rather than by adding a plausible-looking member.
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
  // `detailsUrl` is the modern CheckRun field; `targetUrl` is the legacy
  // StatusContext one — a raw payload occasionally carries either under a
  // `name`-shaped node, so read both rather than assume the field follows
  // the node-type split strictly.
  const url = strOrNull(x['detailsUrl']) ?? strOrNull(x['targetUrl'])

  // Still running: not a pass. Reading "no failure yet" as green merges red.
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

/** Parse a `labels` field (PR, issue, or a bare `gh label list` array) into {@link Label} rows — the one label-array parse every `gh` caller shares. Skips an item with no name, or an empty-string name (indistinguishable from absent). */
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

/** `mergeable` is tri-state; anything unrecognized (or absent) is UNKNOWN. */
function parseMergeable(x: unknown): MergeableState {
  const v = str(x).toUpperCase()
  return v === 'MERGEABLE' || v === 'CONFLICTING' ? v : 'UNKNOWN'
}

/** gh returns `""` for "no decision yet"; the model says `null`. */
function parseReviewDecision(x: unknown): ReviewDecision {
  const v = strOrNull(x)
  return v === 'APPROVED' || v === 'CHANGES_REQUESTED' || v === 'REVIEW_REQUIRED' ? v : null
}

/**
 * One PR from a `gh --json` object, or null when it carries no usable number.
 *
 * Total by construction: a field `gh` was not asked for lands at its "not
 * known" value rather than `undefined`, so the result is safe to build from
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
