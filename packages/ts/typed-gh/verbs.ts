/**
 * The verb table — every `gh` invocation this library knows, as data.
 *
 * Same shape and same reasoning as `@osdlc/typed-git`'s: a {@link GhVerb}
 * pairs the argv to run with the function that reads the result, and nothing
 * here spawns anything. That is what lets a synchronous client and an
 * asynchronous fan-out drive the same definitions without either duplicating
 * the other's parsing.
 *
 * `checked` marks a verb whose failure is thrown with stderr: every mutation,
 * and `prDiff`, which is a read. Other queries are unchecked and fold failure
 * into an absence value.
 */

import { stderrOrError, type CommandResult } from '@osdlc/command-seam'

import { parseLabels, parsePullRequest, type PullRequestJson } from './parse.ts'
import type { IssueRow, Label, PullRequest } from './types.ts'

/** One `gh` invocation: what to run, and how to read what came back. */
export interface GhVerb<T> {
  argv: string[]
  /** True for every mutation and for `prDiff` — throw on a non-zero exit instead of parsing. */
  checked: boolean
  /** Written to the child's stdin, for a verb whose payload is too large or structured for argv. */
  input?: string | undefined
  parse(result: CommandResult): T
}

/**
 * The cheapest useful set: enough to identify a PR and nothing more.
 *
 * Reach for this whenever the question is "which PR is this branch?".
 * `mergeable` and `mergeStateStatus` are absent on purpose — GitHub computes
 * them per PR on demand, so asking for them across a fan-out of branches
 * turns a cheap listing into a rate-limit incident.
 */
export const PR_REF_FIELDS = ['number', 'state', 'headRefName', 'url'] as const

/**
 * The light field set for triage: everything needed to decide what to do with
 * a PR without paying for its body, comments, reviews, or check rollup.
 *
 * `mergeable` and `mergeStateStatus` are the expensive pair — GitHub computes
 * them lazily and answers `UNKNOWN` until it has, so a cold query over many
 * PRs commonly needs a retry. `prViewSettled` on the clients does it.
 */
export const PR_LIST_FIELDS = [
  'number',
  'state',
  'title',
  'url',
  'isDraft',
  'baseRefName',
  'headRefName',
  'headRefOid',
  'isCrossRepository',
  'mergeable',
  'mergeStateStatus',
  'reviewDecision',
  'author',
  'labels',
  'mergedAt',
  'createdAt',
  'updatedAt',
] as const

/** {@link PR_LIST_FIELDS} plus the heavy ones a single PR can afford. */
export const PR_VIEW_FIELDS = [
  ...PR_LIST_FIELDS,
  'body',
  'comments',
  'reviews',
  'statusCheckRollup',
] as const

/** Parse a `--json` payload that is a single object. */
function oneOrNull(r: CommandResult): PullRequest | null {
  if (r.exitCode !== 0) return null
  let data: unknown
  try {
    data = JSON.parse(r.stdout)
  } catch {
    return null
  }
  return parsePullRequest(data as PullRequestJson)
}

/**
 * Parse a `--json` payload that is an array. Null — not `[]` — when the call
 * failed: a caller must be able to tell "no PRs" from "couldn't ask".
 */
function manyOrNull(r: CommandResult): PullRequest[] | null {
  if (r.exitCode !== 0) return null
  let data: unknown
  try {
    data = JSON.parse(r.stdout || '[]')
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  const rows: PullRequest[] = []
  for (const item of data) {
    const pr = parsePullRequest(item as PullRequestJson)
    if (pr !== null) rows.push(pr)
  }
  return rows
}

/** A mutation's result carries no value. */
function nothing(): void {}

/**
 * Parse a `gh label list --json name,color,description` payload. Null — not
 * `[]` — when the call failed, same "no rows" vs. "couldn't ask" split as
 * {@link manyOrNull}: a repo with genuinely zero labels and a `gh` call that
 * never ran must not collapse onto the same value.
 */
function manyLabelsOrNull(r: CommandResult): Label[] | null {
  if (r.exitCode !== 0) return null
  let data: unknown
  try {
    data = JSON.parse(r.stdout || '[]')
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  return parseLabels(data)
}

/** The `gh issue list`/`view --json` field set the `issues` surface needs. */
const ISSUE_FIELDS = 'number,title,body,labels,state'

/** Parse one `gh issue list`/`view --json` row into an {@link IssueRow}. */
function parseIssueRow(data: unknown): IssueRow | null {
  if (data === null || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  const number = rec['number']
  if (typeof number !== 'number') return null
  return {
    number,
    title: typeof rec['title'] === 'string' ? rec['title'] : '',
    body: typeof rec['body'] === 'string' ? rec['body'] : '',
    labels: parseLabels(rec['labels']),
    state: typeof rec['state'] === 'string' ? rec['state'] : '',
  }
}

/** Parse a `gh issue view --json` payload that is a single object. */
function oneIssueOrNull(r: CommandResult): IssueRow | null {
  if (r.exitCode !== 0) return null
  let data: unknown
  try {
    data = JSON.parse(r.stdout)
  } catch {
    return null
  }
  return parseIssueRow(data)
}

/**
 * Parse a `gh issue list --json` payload that is an array. Null — not `[]` —
 * on failure, the same "no rows" vs. "couldn't ask" split {@link manyOrNull}
 * makes for PRs.
 */
function manyIssuesOrNull(r: CommandResult): IssueRow[] | null {
  if (r.exitCode !== 0) return null
  let data: unknown
  try {
    data = JSON.parse(r.stdout || '[]')
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  const rows: IssueRow[] = []
  for (const item of data) {
    const row = parseIssueRow(item)
    if (row !== null) rows.push(row)
  }
  return rows
}

// ── queries ─────────────────────────────────────────────────────────────────

/** What to narrow a listing to. Every filter is optional; none means "all open". */
export interface PrListOptions {
  /**
   * `owner/name` to list from, instead of the repository at the client's cwd.
   * The only way to reach a repository this machine has no checkout of.
   */
  repo?: string | undefined
  state?: 'open' | 'closed' | 'merged' | 'all' | undefined
  /** Exact base branch filter (gh-side). */
  base?: string | undefined
  /**
   * Head branch filter. gh matches this as a prefix, so a caller needing an
   * exact match filters the rows itself — {@link pickPrForBranch} does.
   */
  head?: string | undefined
  /** Raw `--search` query, for anything the flags do not cover. */
  search?: string | undefined
  author?: string | undefined
  limit?: number | undefined
  /** Field subset; defaults to {@link PR_LIST_FIELDS}. */
  fields?: readonly string[] | undefined
}

/** `gh pr list …` — open PRs by default. */
export function prList(opts: PrListOptions = {}): GhVerb<PullRequest[] | null> {
  const argv = ['pr', 'list', '--state', opts.state ?? 'open']
  if (opts.repo !== undefined) argv.push('--repo', opts.repo)
  if (opts.base !== undefined) argv.push('--base', opts.base)
  if (opts.head !== undefined) argv.push('--search', `head:${opts.head}`)
  if (opts.search !== undefined) argv.push('--search', opts.search)
  if (opts.author !== undefined) argv.push('--author', opts.author)
  argv.push('--json', (opts.fields ?? PR_LIST_FIELDS).join(','))
  argv.push('--limit', String(opts.limit ?? 100))
  return { argv, checked: false, parse: manyOrNull }
}

/** `gh pr view <n> --json …` — one PR, with the heavy fields by default. */
export function prView(
  number: number,
  fields: readonly string[] = PR_VIEW_FIELDS,
): GhVerb<PullRequest | null> {
  // `parsePullRequest` yields null without a `number`, so a field subset that
  // omits it would read as "no such PR". Always ask for it, and each field once.
  const asked = [...new Set(fields.includes('number') ? fields : ['number', ...fields])]
  return {
    argv: ['pr', 'view', String(number), '--json', asked.join(',')],
    checked: false,
    parse: oneOrNull,
  }
}

/**
 * Open PRs whose head *starts with* `branch` — gh's own search semantics.
 *
 * The common shape behind "which PR is this branch?", bundling the cheap
 * field set with a small limit. Pair it with {@link pickPrForBranch}, which
 * is what turns the prefix match into an exact one.
 */
export function openPrsForBranch(branch: string, limit = 5): GhVerb<PullRequest[] | null> {
  return prList({ head: branch, limit, fields: PR_REF_FIELDS })
}

/**
 * `gh pr view <n> --json body -q .body` — just the PR body. Null when gh
 * failed. gh's `-q` output ends with a newline that is not part of the body,
 * so every trailing `\r` and `\n` is trimmed (including any that were part of
 * the body, such as the `\r\n` of a body saved with CRLF line endings).
 */
export function prBody(number: number): GhVerb<string | null> {
  return {
    argv: ['pr', 'view', String(number), '--json', 'body', '-q', '.body'],
    checked: false,
    parse: (r) => (r.exitCode === 0 ? r.stdout.replace(/[\r\n]+$/, '') : null),
  }
}

/** One `gh api` answer: HTTP status, entity tag, and the decoded JSON body. */
export interface ApiResponse {
  /** True iff gh exited 0 and the status is below 400 (2xx, or a 304 on a conditional GET). */
  ok: boolean
  /** HTTP status; read off the header block under `-i`. Without `-i` it is synthesized (200 on exit 0, 0 on failure), not observed. */
  status: number
  /** The response `ETag`, when headers were requested and one came back. */
  etag: string | null
  /** The decoded JSON body; null when empty (e.g. a 304), unparseable, or the call failed. */
  body: unknown
  /** True when a non-empty body arrived but was not valid JSON (`body` is then null). */
  malformed: boolean
  /** gh's stderr, trimmed. */
  stderr: string
  /** The runner's own message when gh never ran or was stopped (a failed spawn, a timeout). */
  error?: string | undefined
}

export interface ApiOptions {
  /** Send `If-None-Match: <etag>` (implies `includeHeaders`). */
  etag?: string | null | undefined
  /** Pass `-i` and read status/ETag off the header block. */
  includeHeaders?: boolean | undefined
}

/**
 * `gh api [-i] [-H If-None-Match: …] <endpoint>` — a GET against the REST API. `{owner}` and
 * `{repo}` placeholders in the endpoint are filled by gh from the cwd's repo.
 * Unchecked: failure is a value (`ok: false`), so a caller can tell a 304
 * from an outage.
 */
export function api(endpoint: string, opts: ApiOptions = {}): GhVerb<ApiResponse> {
  const conditional = opts.etag !== undefined && opts.etag !== null && opts.etag !== ''
  const withHeaders = conditional || opts.includeHeaders === true
  const argv = ['api']
  if (withHeaders) argv.push('-i')
  if (conditional) argv.push('-H', `If-None-Match: ${opts.etag}`)
  argv.push(endpoint)
  return { argv, checked: false, parse: (r) => parseApi(r, withHeaders) }
}

/** Split a `gh api -i` payload (status line + headers, blank line, body) and decode it. */
function parseApi(r: CommandResult, withHeaders: boolean): ApiResponse {
  let status = r.exitCode === 0 ? 200 : 0
  let etag: string | null = null
  let bodyText = r.stdout
  if (withHeaders) {
    const raw = r.stdout
    const crlf = raw.indexOf('\r\n\r\n')
    const sepIdx = crlf >= 0 ? crlf : raw.indexOf('\n\n')
    const headerBlock = sepIdx >= 0 ? raw.slice(0, sepIdx) : raw
    bodyText = sepIdx >= 0 ? raw.slice(sepIdx).replace(/^[\r\n]+/, '') : ''
    const statusMatch = headerBlock.match(/HTTP\/[\d.]+\s+(\d{3})/i)
    if (statusMatch) status = Number(statusMatch[1])
    const etagMatch = headerBlock.match(/^etag:\s*(.+)$/im)
    if (etagMatch) etag = etagMatch[1]!.trim()
  }
  let body: unknown = null
  let malformed = false
  if (r.exitCode === 0 && bodyText.trim() !== '') {
    try {
      body = JSON.parse(bodyText)
    } catch {
      malformed = true
    }
  }
  const ok = r.exitCode === 0 && status >= 200 && status < 400
  return {
    ok,
    status,
    etag,
    body,
    malformed,
    stderr: r.stderr.trim(),
    ...(r.error === undefined ? {} : { error: r.error }),
  }
}

/** `gh --version` — the install probe. True when `gh` runs. */
export function installed(): GhVerb<boolean> {
  return { argv: ['--version'], checked: false, parse: (r) => r.exitCode === 0 }
}

/**
 * What `gh auth status` said: whether it passed, and its output (stderr, else the runner's
 * `error`, else stdout), trimmed.
 */
export interface AuthStatus {
  ok: boolean
  detail: string
}

/** `gh auth status` — the credential probe. */
export function authStatus(): GhVerb<AuthStatus> {
  return {
    argv: ['auth', 'status'],
    checked: false,
    parse: (r) => ({ ok: r.exitCode === 0, detail: stderrOrError(r) || r.stdout.trim() }),
  }
}

/**
 * `gh label list --json name,color,description` — every label on the repo.
 * `limit` defaults to 1000. `gh`'s own default is 30, which would cut off a
 * repository with more labels than that without saying so.
 */
export function labelList(opts: { limit?: number | undefined } = {}): GhVerb<Label[] | null> {
  return {
    argv: [
      'label',
      'list',
      '--json',
      'name,color,description',
      '--limit',
      String(opts.limit ?? 1000),
    ],
    checked: false,
    parse: manyLabelsOrNull,
  }
}

/** What to narrow an issue listing to. Every filter is optional. */
export interface IssueListOptions {
  /** Exact label filter, applied by `gh`. */
  label?: string | undefined
  /** The most issues to return. Defaults to 200. */
  limit?: number | undefined
}

/** `gh issue list --json …` — open issues by default, optionally by label. */
export function issueList(opts: IssueListOptions = {}): GhVerb<IssueRow[] | null> {
  const argv = ['issue', 'list']
  if (opts.label !== undefined) argv.push('--label', opts.label)
  argv.push('--json', ISSUE_FIELDS, '--limit', String(opts.limit ?? 200))
  return { argv, checked: false, parse: manyIssuesOrNull }
}

/** `gh issue view <n> --json …` — one issue, same field set as {@link issueList}. */
export function issueView(number: number): GhVerb<IssueRow | null> {
  return {
    argv: ['issue', 'view', String(number), '--json', ISSUE_FIELDS],
    checked: false,
    parse: oneIssueOrNull,
  }
}

// ── mutations (checked — the caller throws CommandFailed on non-zero) ────────

/**
 * Options for {@link createPr}. `head` is the branch to merge from and `base`
 * the branch to merge into. `draft` opens the PR as a draft.
 */
export interface CreatePrOptions {
  head: string
  base: string
  title: string
  body: string
  draft?: boolean | undefined
}

/** `gh pr create …`, returning the URL gh prints (its last non-empty line). */
export function createPr(opts: CreatePrOptions): GhVerb<string> {
  const argv = ['pr', 'create', '--head', opts.head, '--base', opts.base]
  if (opts.draft) argv.push('--draft')
  argv.push('--title', opts.title, '--body', opts.body)
  return {
    argv,
    checked: true,
    parse(r) {
      const lines = r.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '')
      const url = lines[lines.length - 1]
      if (url === undefined) throw new Error('gh pr create printed no URL')
      return url
    },
  }
}

/** `gh pr edit <n>` — retitle or rewrite the body. */
export function editPr(
  number: number,
  opts: { title?: string | undefined; body?: string | undefined },
): GhVerb<void> {
  const argv = ['pr', 'edit', String(number)]
  if (opts.title !== undefined) argv.push('--title', opts.title)
  if (opts.body !== undefined) argv.push('--body', opts.body)
  return { argv, checked: true, parse: nothing }
}

/** `gh pr edit <n> --body` — rewrite just the body. */
export function editPrBody(number: number, body: string): GhVerb<void> {
  return editPr(number, { body })
}

/** `gh pr update-branch <n> [--rebase]` — bring the head up to date with its base. */
export function prUpdateBranch(number: number, style: 'merge' | 'rebase' = 'merge'): GhVerb<void> {
  const argv = ['pr', 'update-branch', String(number)]
  if (style === 'rebase') argv.push('--rebase')
  return { argv, checked: true, parse: nothing }
}

/** `gh pr ready <n> [--undo]` — mark a draft PR ready for review, or (with `draft`) convert it back to a draft. */
export function prSetDraft(number: number, draft: boolean): GhVerb<void> {
  const argv = ['pr', 'ready', String(number)]
  if (draft) argv.push('--undo')
  return { argv, checked: true, parse: nothing }
}

/**
 * `gh api -X PATCH repos/{owner}/{repo}/issues/comments/<id> -f body=…` — rewrite one
 * conversation comment.
 *
 * `commentId` is the comment's numeric REST id, as text: the `id` that
 * `gh api repos/{owner}/{repo}/issues/<n>/comments` returns. It is not the
 * GraphQL node id (such as `IC_kw…`) that `gh pr view --json comments` gives
 * in `Comment.id`; the REST path answers 404 for a node id.
 *
 * @experimental
 */
export function issueCommentEdit(commentId: string, body: string): GhVerb<void> {
  return {
    argv: [
      'api',
      '-X',
      'PATCH',
      `repos/{owner}/{repo}/issues/comments/${commentId}`,
      '-f',
      `body=${body}`,
    ],
    checked: true,
    parse: nothing,
  }
}

/** How {@link prMerge} lands the commits: `squash` into one, `merge` with a merge commit, or `rebase`. */
export type PrMergeMethod = 'squash' | 'merge' | 'rebase'

/**
 * `gh pr merge <n> --<method> --match-head-commit <sha>`. The head sha is
 * required, not optional: GitHub refuses the merge when the PR head moved
 * since the caller judged it, so a push that lands between a gate and the
 * merge can never ride in unreviewed. The branch is left alone (no
 * `--delete-branch`); deleting it is the caller's job.
 */
export function prMerge(
  number: number,
  opts: { method: PrMergeMethod; headSha: string },
): GhVerb<void> {
  const argv = [
    'pr',
    'merge',
    String(number),
    `--${opts.method}`,
    '--match-head-commit',
    opts.headSha,
  ]
  return { argv, checked: true, parse: nothing }
}

/** One review thread: whether it is resolved and who spoke last. */
export interface ReviewThread {
  isResolved: boolean
  isOutdated: boolean
  /** Login of the thread's newest comment; null when the account is gone. */
  lastCommentAuthor: string | null
}

const REVIEW_THREADS_QUERY =
  'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){pageInfo{hasNextPage} nodes{isResolved isOutdated comments(last:1){nodes{author{login}}}}}}}}'

/**
 * A PR's review threads over GraphQL (`gh pr view --json` has no thread
 * field). Null — never `[]` — when the call failed, the payload was not the
 * expected shape, or more than 100 threads exist: a caller deciding whether a
 * PR is clear to merge must read "could not tell" differently from "no
 * threads".
 */
export function prReviewThreads(number: number): GhVerb<ReviewThread[] | null> {
  return {
    argv: [
      'api',
      'graphql',
      '-F',
      'owner={owner}',
      '-F',
      'name={repo}',
      '-F',
      `number=${number}`,
      '-f',
      `query=${REVIEW_THREADS_QUERY}`,
    ],
    checked: false,
    parse(r) {
      if (r.exitCode !== 0) return null
      let data: unknown
      try {
        data = JSON.parse(r.stdout)
      } catch {
        return null
      }
      type Node = {
        isResolved?: unknown
        isOutdated?: unknown
        comments?: { nodes?: { author?: { login?: unknown } | null }[] }
      }
      const threads = (
        data as {
          data?: {
            repository?: {
              pullRequest?: {
                reviewThreads?: { pageInfo?: { hasNextPage?: unknown }; nodes?: Node[] }
              } | null
            } | null
          }
        }
      )?.data?.repository?.pullRequest?.reviewThreads
      if (threads === undefined || !Array.isArray(threads.nodes)) return null
      if (threads.pageInfo?.hasNextPage === true) return null
      return threads.nodes.map((n) => {
        const login = n.comments?.nodes?.[0]?.author?.login
        return {
          isResolved: n.isResolved === true,
          isOutdated: n.isOutdated === true,
          lastCommentAuthor: typeof login === 'string' ? login : null,
        }
      })
    },
  }
}

/** A label to create. `color` is hex digits such as `d73a4a`. */
export interface CreateLabelOptions {
  name: string
  color: string
  description: string
}

/**
 * `gh label create <name> --color <hex> --description <text> --force`.
 * `--force` makes it safe to repeat: when the label already exists, its color
 * and description are set to these instead of failing.
 */
export function createLabel(opts: CreateLabelOptions): GhVerb<void> {
  const argv = [
    'label',
    'create',
    opts.name,
    '--color',
    opts.color,
    '--description',
    opts.description,
    '--force',
  ]
  return { argv, checked: true, parse: nothing }
}

/** `gh label edit <name>` — recolor or redescribe; omits a flag not given. */
export function editLabel(
  name: string,
  opts: { color?: string | undefined; description?: string | undefined },
): GhVerb<void> {
  const argv = ['label', 'edit', name]
  if (opts.color !== undefined) argv.push('--color', opts.color)
  if (opts.description !== undefined) argv.push('--description', opts.description)
  return { argv, checked: true, parse: nothing }
}

/**
 * `gh issue edit <n> [--remove-label <current>] --add-label <new>` — swap
 * one label for another on an issue in ONE call, so the issue is never
 * briefly unlabeled or briefly holding both labels BETWEEN the remove and the
 * add — that atomicity is real and is this one call's own guarantee. It does
 * NOT cover the window before the call: `currentLabel` is whatever the caller
 * already read (perhaps minutes earlier, from a `gh issue list` snapshot),
 * never re-read here. If the issue's live label changed since then (a human,
 * or another process, relabeled it in between), `--remove-label
 * <currentLabel>` targets a label the issue no longer carries — `gh` no-ops
 * that removal silently rather than erroring — so the call still adds
 * `newLabel`, and the issue ends up holding BOTH the label it actually has
 * now and `newLabel`. A caller that cares about that race re-reads the live
 * label immediately before calling this. `currentLabel` is `null` when the
 * issue carries no prior label to remove — the `--remove-label` flag is then
 * omitted rather than passed empty.
 */
export function setIssueLabel(
  number: number,
  currentLabel: string | null,
  newLabel: string,
): GhVerb<void> {
  const argv = ['issue', 'edit', String(number)]
  if (currentLabel !== null) argv.push('--remove-label', currentLabel)
  argv.push('--add-label', newLabel)
  return { argv, checked: true, parse: nothing }
}

/** `gh pr diff <n>` — the PR's unified diff, as text. Checked: an empty diff is a value, a failed call is not. */
export function prDiff(number: number): GhVerb<string> {
  return { argv: ['pr', 'diff', String(number)], checked: true, parse: (r) => r.stdout }
}

/** `gh pr comment <n> --body <body>` — post a conversation comment, returning the URL gh prints ('' if none). */
export function prComment(number: number, body: string): GhVerb<string> {
  return {
    argv: ['pr', 'comment', String(number), '--body', body],
    checked: true,
    parse(r) {
      const lines = r.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '')
      const last = lines[lines.length - 1] ?? ''
      return /^https?:\/\//.test(last) ? last : ''
    },
  }
}

/**
 * One inline comment of a review: a line on the right (new) side of the diff.
 *
 * @experimental
 */
export interface ReviewComment {
  path: string
  /** Line number in the new version of the file. */
  line: number
  body: string
}

/**
 * What {@link createReview} posts: the commit, the summary and the inline comments.
 *
 * @experimental
 */
export interface CreateReviewOptions {
  /** The commit the review is anchored to; line numbers refer to the diff at this sha. */
  commitId: string
  /** The review summary. GitHub rejects a review whose body and comments are both empty. */
  body: string
  comments: readonly ReviewComment[]
}

/**
 * Create a PR review with inline comments, returning the review's URL (empty
 * when GitHub's reply carried none). The event is always `COMMENT`: this
 * library does not offer a way to approve or request changes. Goes through
 * `gh api` with the payload on stdin, because `gh pr review` cannot attach
 * line-anchored comments; `{owner}`/`{repo}` are filled in by `gh` from the
 * client's working directory.
 *
 * @experimental
 */
export function createReview(number: number, opts: CreateReviewOptions): GhVerb<string> {
  const payload = {
    commit_id: opts.commitId,
    body: opts.body,
    event: 'COMMENT',
    comments: opts.comments.map((c) => ({
      path: c.path,
      line: c.line,
      side: 'RIGHT',
      body: c.body,
    })),
  }
  return {
    argv: [
      'api',
      '--method',
      'POST',
      `repos/{owner}/{repo}/pulls/${number}/reviews`,
      '--input',
      '-',
    ],
    checked: true,
    input: JSON.stringify(payload),
    parse(r) {
      try {
        const url = (JSON.parse(r.stdout) as { html_url?: unknown }).html_url
        return typeof url === 'string' ? url : ''
      } catch {
        return ''
      }
    },
  }
}

// ── helpers over the parsed rows ────────────────────────────────────────────

/**
 * The row whose `headRefName` exactly equals `branch`, or null.
 *
 * gh's `head:` search is a prefix match, so `task/foo` also returns
 * `task/foo-2`. Every caller that means one branch needs this filter.
 */
export function pickPrForBranch(rows: PullRequest[] | null, branch: string): PullRequest | null {
  if (rows === null) return null
  return rows.find((r) => r.headRefName === branch) ?? null
}

/**
 * True when GitHub has not finished computing this PR's mergeability.
 *
 * The answer is not stable on a cold query: GitHub kicks off the merge
 * computation when asked and answers `UNKNOWN` until it lands. A caller that
 * treats the first `UNKNOWN` as final will mis-triage a PR that is merely
 * slow, so re-ask a few times before believing it.
 */
export function needsMergeStateRetry(pr: PullRequest): boolean {
  return pr.mergeable === 'UNKNOWN' || pr.mergeStateStatus === 'UNKNOWN'
}
