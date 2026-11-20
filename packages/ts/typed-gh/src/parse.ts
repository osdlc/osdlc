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
  PrActivityItem,
  PrActivityText,
  PrSearchHit,
  PrStateChangeKind,
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

/** `{ login }` as gh prints `headRepositoryOwner`; null for anything else. */
function ownerLogin(raw: unknown): string | null {
  return isRecord(raw) && typeof raw['login'] === 'string' ? raw['login'] : null
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
    headRepositoryOwner: ownerLogin(raw['headRepositoryOwner']),
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
    closedAt: searchTime(raw['closedAt']),
  }
}

// ── a pull request's activity ───────────────────────────────────────────────

/**
 * A GraphQL `Actor`, whose `__typename` says whether it is a bot. GraphQL
 * sends a bot's bare login, with no `[bot]` or `app/` to mark it.
 */
function graphqlActor(x: unknown): Actor | null {
  const actor = parseActor(x)
  if (actor === null || !isRecord(x) || x['__typename'] !== 'Bot') return actor
  return { ...actor, isBot: true }
}

function intOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isInteger(x) ? x : null
}

function oidOf(x: unknown): string | null {
  return isRecord(x) ? strOrNull(x['oid']) : null
}

/** The events whose only fields are the common ones, by GraphQL type. */
const PLAIN_EVENTS: Record<string, PrStateChangeKind> = {
  ClosedEvent: 'closed',
  ReopenedEvent: 'reopened',
  ReadyForReviewEvent: 'ready-for-review',
  ConvertToDraftEvent: 'converted-to-draft',
}

/** The timeline types the `prActivity` query has a fragment for. */
const READ_TYPES = new Set([
  'IssueComment',
  'PullRequestReview',
  'PullRequestCommit',
  ...Object.keys(PLAIN_EVENTS),
  'MergedEvent',
  'HeadRefForcePushedEvent',
  'BaseRefChangedEvent',
])

/** The text fields of a comment, a review or a review comment. */
function textOf(node: Record<string, unknown>): PrActivityText {
  return {
    body: str(node['body']),
    editedAt: strOrNull(node['lastEditedAt']),
    url: str(node['url']),
    // `fullDatabaseId` is a BigInt, which GraphQL sends as a string.
    restId: idOrNull(node['fullDatabaseId']),
  }
}

/** Items read from the answer. `truncated` is true when a list held more than the query asked for. */
type ActivityRead = { items: PrActivityItem[]; truncated: boolean }

/** The `nodes` of a connection, and whether its `totalCount` says some were not read. Null when it has no `nodes` list. */
function connectionOf(x: unknown): { nodes: unknown[]; truncated: boolean } | null {
  if (!isRecord(x) || !Array.isArray(x['nodes'])) return null
  const total = x['totalCount']
  return { nodes: x['nodes'], truncated: typeof total === 'number' && total > x['nodes'].length }
}

function reviewOf(node: Record<string, unknown>, id: string, actor: Actor | null): PrActivityItem {
  return {
    kind: 'review',
    id,
    at: strOrNull(node['submittedAt']),
    actor,
    state: str(node['state']),
    ...textOf(node),
  }
}

/**
 * A review followed by its inline comments. Null when the review has no
 * `comments` list or one of its comments cannot be read.
 */
function reviewActivity(
  node: Record<string, unknown>,
  id: string,
  actor: Actor | null,
): ActivityRead | null {
  const comments = connectionOf(node['comments'])
  if (comments === null) return null
  const items: PrActivityItem[] = [reviewOf(node, id, actor)]
  for (const c of comments.nodes) {
    const comment = reviewCommentOf(c, id)
    if (comment === null) return null
    items.push(comment)
  }
  return { items, truncated: comments.truncated }
}

/** One inline comment of the review `reviewId`, or null when it is not an object or has no `id`. */
function reviewCommentOf(c: unknown, reviewId: string): PrActivityItem | null {
  if (!isRecord(c)) return null
  const id = strOrNull(c['id'])
  if (id === null) return null
  const replyTo = c['replyTo']
  return {
    kind: 'review-comment',
    id,
    at: strOrNull(c['createdAt']),
    actor: graphqlActor(c['author']),
    ...textOf(c),
    reviewId,
    path: str(c['path']),
    line: intOrNull(c['line']),
    originalLine: intOrNull(c['originalLine']),
    outdated: bool(c['outdated']),
    replyToId: isRecord(replyTo) ? strOrNull(replyTo['id']) : null,
    replyToRestId: isRecord(replyTo) ? idOrNull(replyTo['fullDatabaseId']) : null,
  }
}

/**
 * The items of one timeline node: one, none for a type this package does not
 * read, or a review followed by its inline comments. Null when the node
 * cannot be read: it is not an object, a type it reads has no `id`, a
 * commit has no `oid`, or a review has no `comments` list.
 */
function activityOf(node: unknown): ActivityRead | null {
  if (!isRecord(node)) return null
  const type = node['__typename']
  // A type the query has no fragment for comes back as its `__typename`
  // alone, with no `id`. Skip it.
  if (typeof type === 'string' && !READ_TYPES.has(type)) return { items: [], truncated: false }
  const id = strOrNull(node['id'])
  if (id === null) return null
  const actor = graphqlActor(node['author'] ?? node['actor'])
  const one = (item: PrActivityItem) => ({ items: [item], truncated: false })

  if (type === 'IssueComment') {
    return one({ kind: 'comment', id, at: strOrNull(node['createdAt']), actor, ...textOf(node) })
  }
  if (type === 'PullRequestReview') return reviewActivity(node, id, actor)
  if (type === 'PullRequestCommit') {
    const commit = node['commit']
    const sha = oidOf(commit)
    if (!isRecord(commit) || sha === null) return null
    const author = commit['author']
    return one({
      kind: 'commit',
      id,
      at: strOrNull(commit['committedDate']),
      actor: isRecord(author) ? graphqlActor(author['user']) : null,
      sha,
      headline: str(commit['messageHeadline']),
    })
  }
  const at = strOrNull(node['createdAt'])
  const plain = typeof type === 'string' ? PLAIN_EVENTS[type] : undefined
  if (plain !== undefined) return one({ kind: plain, id, at, actor })
  if (type === 'MergedEvent') {
    return one({ kind: 'merged', id, at, actor, sha: oidOf(node['mergeCommit']) })
  }
  if (type === 'HeadRefForcePushedEvent') {
    return one({
      kind: 'head-force-pushed',
      id,
      at,
      actor,
      beforeSha: oidOf(node['beforeCommit']),
      afterSha: oidOf(node['afterCommit']),
    })
  }
  if (type === 'BaseRefChangedEvent') {
    return one({
      kind: 'base-changed',
      id,
      at,
      actor,
      from: str(node['previousRefName']),
      to: str(node['currentRefName']),
    })
  }
  // A node with no `__typename`, which the query always asks for.
  return { items: [], truncated: false }
}

/**
 * The groups the timeline left out: each review thread comment that is not
 * in `seen`, after its review when that review is not in `seen` either.
 * Those reviews only reply in an existing thread. A comment older than
 * `since` is dropped. Null when the threads cannot be read, or a comment has
 * no `id` or no review.
 */
function threadReplies(
  pr: Record<string, unknown>,
  seen: Set<string>,
  since: number | null,
): { groups: PrActivityItem[][]; truncated: boolean } | null {
  const threads = connectionOf(pr['reviewThreads'])
  if (threads === null) return null
  const groups: PrActivityItem[][] = []
  let truncated = threads.truncated
  for (const thread of threads.nodes) {
    const comments = connectionOf(isRecord(thread) ? thread['comments'] : null)
    if (comments === null) return null
    truncated ||= comments.truncated
    for (const c of comments.nodes) {
      const review = isRecord(c) ? c['pullRequestReview'] : null
      const reviewId = isRecord(review) ? strOrNull(review['id']) : null
      const comment = reviewId === null ? null : reviewCommentOf(c, reviewId)
      if (comment === null || !isRecord(review) || reviewId === null) return null
      if (seen.has(comment.id)) continue
      const at = comment.at === null ? Number.NaN : Date.parse(comment.at)
      if (since !== null && !(at >= since)) continue
      const group: PrActivityItem[] = []
      if (!seen.has(reviewId))
        group.push(reviewOf(review, reviewId, graphqlActor(review['author'])))
      group.push(comment)
      for (const item of group) seen.add(item.id)
      groups.push(group)
    }
  }
  return { groups, truncated }
}

/**
 * Puts each group before the first top-level row (not an inline comment)
 * that is newer than the group's last item, or at the end.
 */
function placeByTime(rows: PrActivityItem[], groups: PrActivityItem[][]): PrActivityItem[] {
  const out = [...rows]
  for (const group of groups) {
    const at = group.at(-1)?.at
    const time = at === null || at === undefined ? Number.NaN : Date.parse(at)
    const index = out.findIndex(
      (r) => r.kind !== 'review-comment' && r.at !== null && Date.parse(r.at) > time,
    )
    out.splice(index === -1 ? out.length : index, 0, ...group)
  }
  return out
}

/**
 * A pull request's activity from the `data` of each page of the
 * `prActivity` query. See {@link prActivity} for the order and `truncated`.
 * `since` is the `since` sent, in milliseconds.
 *
 * Null when any page lacks `repository.pullRequest.timelineItems.nodes`, the
 * first page lacks its `reviewThreads`, or any node cannot be read, so a page
 * that came back short is never read as less activity.
 */
export function parsePrActivity(
  pages: readonly unknown[],
  since: number | null = null,
): { rows: PrActivityItem[]; truncated: boolean } | null {
  const rows: PrActivityItem[] = []
  let truncated = false
  let first: Record<string, unknown> | null = null
  for (const page of pages) {
    const repository = isRecord(page) ? page['repository'] : null
    const pr = isRecord(repository) ? repository['pullRequest'] : null
    const timeline = isRecord(pr) ? pr['timelineItems'] : null
    const nodes = isRecord(timeline) ? timeline['nodes'] : null
    if (!isRecord(pr) || !Array.isArray(nodes)) return null
    first ??= pr
    for (const node of nodes) {
      const read = activityOf(node)
      if (read === null) return null
      rows.push(...read.items)
      truncated ||= read.truncated
    }
  }
  if (first === null) return { rows, truncated }
  const replies = threadReplies(first, new Set(rows.map((r) => r.id)), since)
  if (replies === null) return null
  return { rows: placeByTime(rows, replies.groups), truncated: truncated || replies.truncated }
}

/**
 * gh search prints Go's zero time (`0001-01-01T00:00:00Z`) for a time that is
 * not set, such as `closedAt` on an open pull request. That is no time.
 */
function searchTime(x: unknown): string | null {
  const s = strOrNull(x)
  return s === null || s.startsWith('0001-01-01') ? null : s
}
