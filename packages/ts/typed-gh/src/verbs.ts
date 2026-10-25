/**
 * The verb table: every `gh` call this library knows, as data.
 *
 * It has the same shape as `@osdlc/typed-git`'s. A {@link GhVerb} pairs the
 * argv to run with the function that reads the result, and nothing here
 * starts a process. So the sync client, the async client and callers with
 * their own runner all use the same definitions and the same parsing.
 *
 * `checked` marks a verb the runner throws for on a non-zero exit, with
 * stderr. That is every mutation, and `prDiff`, which is a read. Other
 * queries run unchecked, and `parse` turns a failure into `null`, which is
 * what `soft` returns. The clients' methods that throw read them through
 * `settle` (see `doors.ts`) instead. There a failure throws, except where the
 * verb declares `absent` or is a `probe`.
 */

import { stderrOrError, type CommandResult } from '@osdlc/command-seam'

import { parseLabels, parsePrSearchHit, parsePullRequest, parseRepository } from './parse.ts'
import { isAbsent, type Thing } from './failure.ts'
import { isRepoSlug, parsePrUrl } from './repo.ts'
import type { IssueRow, Label, PrSearchHit, PullRequest, Repository } from './types.ts'

/** Whether a failed run says GitHub has no such `thing`. Reads the same text the classifier reads. */
function noSuch(thing: Thing): (r: CommandResult) => boolean {
  return (r) => isAbsent(thing, `${r.stderr}\n${r.stdout}`)
}

/** One `gh` invocation: what to run, and how to read what came back. */
export interface GhVerb<T> {
  argv: string[]
  /** True for every mutation and for `prDiff`: throw on a non-zero exit instead of parsing. */
  checked: boolean
  /**
   * True when the call only reads and changes nothing on GitHub. Every query
   * is read-only, and so is `prDiff`. No mutation is. A caller that
   * keeps an allowlist of safe calls can check this before running a verb.
   */
  readOnly: boolean
  /** Written to the child's stdin, for a verb whose payload is too large or structured for argv. */
  input?: string | undefined
  /**
   * Variables to set on the child process, for a target gh has no flag for:
   * `GH_HOST` on `gh search` and `gh repo list`.
   */
  env?: Record<string, string> | undefined
  /**
   * True for a read whose failure is part of its answer. `installed`,
   * `authStatus` and `api` return what `parse` makes of any result, in all
   * three call styles. Other reads throw from the plain method when gh exits
   * non-zero.
   */
  probe?: boolean | undefined
  /**
   * For a read of one thing: whether a non-zero result means GitHub has no such
   * thing (`prView`, `issueView`, `repoView`). The plain method then returns
   * what `parse` makes of it, `null`, because a missing item is an answer.
   * Other non-zero results fail the call.
   */
  absent?: ((result: CommandResult) => boolean) | undefined
  parse(result: CommandResult): T
}

/**
 * The repository and host a verb talks to. Both are optional. With no `repo`,
 * gh uses the repository of the clone at the client's working directory. With
 * no `hostname`, it uses gh's default host.
 */
export interface GhTarget {
  /** `owner/name`. */
  repo?: string | undefined
  /**
   * A GitHub host: `github.com`, a GitHub Enterprise Server host such as
   * `github.acme.com`, or a `<tenant>.ghe.com` host. Other forges are not
   * supported, because gh supports only GitHub's API. `''` means the same as
   * `undefined`, so a value read from config can be passed as it is.
   */
  hostname?: string | undefined
}

/**
 * A bare host, with an optional port: letters, digits, dots and hyphens, that
 * starts and ends with a letter or digit, then optionally `:` and digits
 * (`github.com`, `ghe.acme.com`, `localhost:8080`). No scheme, path, spaces or
 * leading `-`, so the value cannot be read by gh as a flag or a URL. It does
 * not check that the host exists or that its labels are well formed, and it
 * does not accept IPv6 literals.
 */
const HOSTNAME = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d+)?$/

/** The target's host, or `undefined` when it has none. `''` is "not set". */
function hostOf(target: GhTarget | undefined): string | undefined {
  return target?.hostname === '' ? undefined : target?.hostname
}

/**
 * Throw `RangeError` unless `target.repo` is `owner/name` and
 * `target.hostname` is a bare host. Run by every verb that uses a target, so
 * no text can reach gh as a flag or change the endpoint a call hits.
 */
export function checkTarget(target: GhTarget | undefined): void {
  if (target?.repo !== undefined && !isRepoSlug(target.repo)) {
    throw new RangeError(`repo must be owner/name, got ${JSON.stringify(target.repo)}`)
  }
  const hostname = hostOf(target)
  if (hostname !== undefined && !HOSTNAME.test(hostname)) {
    throw new RangeError(`hostname must be a bare host, got ${JSON.stringify(hostname)}`)
  }
}

/**
 * Throws `TypeError` unless `opts.repo` is set: the options-only form names
 * a repository, so a missing one would silently read the process's own clone.
 */
export function requireRepo(client: string, opts: GhTarget | undefined): void {
  if (typeof opts !== 'object' || opts === null || opts.repo === undefined) {
    throw new TypeError(
      `new ${client}(options) needs options.repo; pass a directory, as new ${client}(cwd, options), for a clone`,
    )
  }
}

/** `--repo [host/]owner/name` for `pr`, `issue` and `label` verbs. `repo` overrides the target's. */
function repoArgs(target: GhTarget | undefined, repo?: string | undefined): string[] {
  checkTarget(target)
  const slug = repo ?? target?.repo
  if (slug === undefined) return []
  if (repo !== undefined) checkTarget({ repo })
  const hostname = hostOf(target)
  return ['--repo', hostname === undefined ? slug : `${hostname}/${slug}`]
}

/** `--hostname <host>` for `api` and `auth` verbs. */
function hostArgs(target: GhTarget | undefined): string[] {
  checkTarget(target)
  const hostname = hostOf(target)
  return hostname === undefined ? [] : ['--hostname', hostname]
}

/** `GH_HOST` for the verbs gh gives no host flag. */
function hostEnv(target: GhTarget | undefined): Record<string, string> | undefined {
  checkTarget(target)
  const hostname = hostOf(target)
  return hostname === undefined ? undefined : { GH_HOST: hostname }
}

/**
 * `endpoint` with `{owner}` and `{repo}` filled from the target. With no
 * target repo they are left for gh to fill from the clone.
 */
function fillRepo(endpoint: string, target: GhTarget | undefined): string {
  checkTarget(target)
  if (target?.repo === undefined) return endpoint
  const [owner, name] = target.repo.split('/') as [string, string]
  return endpoint.replaceAll('{owner}', owner).replaceAll('{repo}', name)
}

/**
 * The smallest useful set: enough to identify a PR and nothing more.
 *
 * Use it when the question is "which PR is this branch?". `mergeable` and
 * `mergeStateStatus` are left out on purpose. GitHub computes them per PR
 * when asked, so asking for them across many branches can hit the rate
 * limit.
 */
export const PR_REF_FIELDS = ['number', 'state', 'headRefName', 'url'] as const

/**
 * The smaller field set for triage: enough to decide what to do with a PR,
 * without its body, comments, reviews, or check rollup.
 *
 * `mergeable` and `mergeStateStatus` are the costly pair. GitHub computes
 * them only when asked and answers `UNKNOWN` until it has. So a first query
 * over many PRs often needs a retry. `prViewSettled` on the clients does it.
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

/** {@link PR_LIST_FIELDS} plus the costly fields, for a single PR. */
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
  return parsePullRequest(data)
}

/**
 * Parse a `--json` payload that is an array. Null, not `[]`, when the call
 * failed. A caller must be able to tell "no PRs" from "couldn't ask".
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
    const pr = parsePullRequest(item)
    if (pr !== null) rows.push(pr)
  }
  return rows
}

/**
 * A list query's answer: the rows, and whether `limit` cut the list short.
 * The verb asks gh for one row more than `limit`. `truncated` is true when
 * that row came back, and `rows` holds at most `limit`.
 */
export interface ListResult<T> {
  rows: T[]
  truncated: boolean
}

/** Throw `RangeError` unless `limit` is a positive integer. */
function checkLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`)
  }
}

/** `rows` cut to `limit`, with whether there were more. Null stays null. */
function limited<T>(rows: T[] | null, limit: number): ListResult<T> | null {
  if (rows === null) return null
  return { rows: rows.slice(0, limit), truncated: rows.length > limit }
}

/** A mutation's result carries no value. */
function nothing(): void {}

/**
 * Parse a `gh label list --json name,color,description` payload. Null, not
 * `[]`, when the call failed, as in {@link manyOrNull}. A repo with no labels
 * and a `gh` call that never ran must not give the same value.
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

/** The `gh issue list`/`view --json` field set an {@link IssueRow} reads. */
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
 * Parse a `gh issue list --json` payload that is an array. Null, not `[]`,
 * on failure, as {@link manyOrNull} does for PRs.
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

/** What to narrow a listing to. Every filter is optional. None means "all open". */
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
   * Head branch filter, exact: `task/foo` does not match `task/foo-2`. Passed
   * as gh's `--head`, and the rows are filtered again on `headRefName`. Two
   * forks can share a branch name. Ask for `headRepositoryOwner` to tell them
   * apart.
   */
  head?: string | undefined
  /** Raw `--search` query, for anything the flags do not cover. */
  search?: string | undefined
  author?: string | undefined
  limit?: number | undefined
  /** Field subset. Defaults to {@link PR_LIST_FIELDS}. `number` is always requested. */
  fields?: readonly string[] | undefined
}

/** `gh pr list …`: open PRs by default. `opts.repo` overrides the target's repo. */
export function prList(
  opts: PrListOptions = {},
  target?: GhTarget,
): GhVerb<ListResult<PullRequest> | null> {
  const limit = opts.limit ?? 100
  checkLimit(limit)
  const argv = ['pr', 'list', '--state', opts.state ?? 'open', ...repoArgs(target, opts.repo)]
  if (opts.base !== undefined) argv.push('--base', opts.base)
  if (opts.head !== undefined) argv.push('--head', opts.head)
  if (opts.search !== undefined) argv.push('--search', opts.search)
  if (opts.author !== undefined) argv.push('--author', opts.author)
  // A row without `number` does not parse and is dropped, so always ask for it.
  // The exact-head filter below also reads `headRefName`.
  const asked = withFields(opts.fields ?? PR_LIST_FIELDS, [
    'number',
    ...(opts.head === undefined ? [] : ['headRefName']),
  ])
  argv.push('--json', asked.join(','))
  argv.push('--limit', String(limit + 1))
  const head = opts.head
  return {
    argv,
    checked: false,
    readOnly: true,
    parse(r) {
      const result = limited(manyOrNull(r), limit)
      if (result === null || head === undefined) return result
      return { ...result, rows: result.rows.filter((pr) => pr.headRefName === head) }
    },
  }
}

/** `fields` with each of `required` added once, ahead of the rest. */
function withFields(fields: readonly string[], required: readonly string[]): string[] {
  return [...new Set([...required.filter((f) => !fields.includes(f)), ...fields])]
}

/**
 * Throw `RangeError` when a string bound for gh's argv as a positional
 * argument would read as a flag.
 */
function notAFlag(what: string, value: string): void {
  if (value.startsWith('-')) {
    throw new RangeError(`${what} must not start with "-", got ${JSON.stringify(value)}`)
  }
}

/**
 * `gh pr view <number|branch|url> --json …`: one PR, with the full field set
 * by default.
 *
 * A branch is the PR whose head is that branch, as gh picks it. A URL names
 * its own repository and host, so the target is not passed with one. A
 * string that starts with `-` throws `RangeError`.
 */
export function prView(
  ref: number | string,
  fields: readonly string[] = PR_VIEW_FIELDS,
  target?: GhTarget,
): GhVerb<PullRequest | null> {
  if (typeof ref === 'string') notAFlag('prView ref', ref)
  // `parsePullRequest` yields null without a `number`, so a field subset that
  // omits it would read as "no such PR". Always ask for it, and each field once.
  const asked = withFields(fields, ['number'])
  const isUrl = typeof ref === 'string' && parsePrUrl(ref) !== null
  return {
    argv: [
      'pr',
      'view',
      String(ref),
      ...(isUrl ? [] : repoArgs(target)),
      '--json',
      asked.join(','),
    ],
    checked: false,
    readOnly: true,
    absent: noSuch('pr'),
    parse: oneOrNull,
  }
}

/**
 * Open PRs whose head is exactly `branch`.
 *
 * The usual way to ask "which PR is this branch?". It uses the smallest field
 * set and a small limit. More than one row comes back only when forks
 * share the branch name.
 */
export function openPrsForBranch(
  branch: string,
  limit = 5,
  target?: GhTarget,
): GhVerb<ListResult<PullRequest> | null> {
  return prList({ head: branch, limit, fields: PR_REF_FIELDS }, target)
}

/**
 * `gh pr view <n> --json body -q .body`: just the PR body. Null when gh
 * failed. gh's `-q` output ends with a newline that is not part of the body,
 * so every trailing `\r` and `\n` is trimmed (including any that were part of
 * the body, such as the `\r\n` of a body saved with CRLF line endings).
 */
export function prBody(number: number, target?: GhTarget): GhVerb<string | null> {
  return {
    argv: ['pr', 'view', String(number), ...repoArgs(target), '--json', 'body', '-q', '.body'],
    checked: false,
    readOnly: true,
    parse: (r) => (r.exitCode === 0 ? r.stdout.replace(/[\r\n]+$/, '') : null),
  }
}

/** One `gh api` answer: HTTP status, entity tag, and the decoded JSON body. */
export interface ApiResponse {
  /** True iff gh exited 0 and the status is below 400 (2xx, or a 304 on a conditional GET). */
  ok: boolean
  /** HTTP status, read only when headers were requested (`etag` or `includeHeaders`, which pass `-i`). Without them it is made up from the exit code (200 on exit 0, 0 on failure). */
  status: number
  /** The response `ETag`, when headers were requested and one came back. */
  etag: string | null
  /** The decoded JSON body, whatever gh's exit code (on failure, GitHub's error object). Null when empty (such as a 304) or not valid JSON. */
  body: unknown
  /** `body.message` when the body is an object with a string `message` (GitHub's error text), else null. */
  message: string | null
  /** True when a non-empty body arrived but was not valid JSON (`body` is then null). This includes a failed call with a non-JSON body. */
  malformed: boolean
  /** gh's stderr, trimmed. */
  stderr: string
  /** The runner's own message when gh never ran or was stopped (a failed spawn, a timeout). */
  error?: string | undefined
}

/**
 * Options for {@link api}. All are optional. With none, the call is a plain
 * `gh api <endpoint>` and the response carries no status or ETag.
 */
export interface ApiOptions {
  /** Send `If-None-Match: <etag>` (implies `includeHeaders`). */
  etag?: string | null | undefined
  /** Pass `-i` and read status/ETag off the header block (the last one, if several). */
  includeHeaders?: boolean | undefined
  /**
   * Fetch every page (`--paginate --slurp`). `body` is then the pages joined
   * into one array when every page is an array, else the list of pages.
   * Cannot be combined with `etag` or `includeHeaders`, because with `-i` gh
   * prints a header block per page. `status` is made up from the exit code, as
   * without `-i`.
   */
  paginate?: boolean | undefined
}

/**
 * `gh api [-i] [-H If-None-Match: …] <endpoint>`: a GET against the REST API. `{owner}` and
 * `{repo}` placeholders in the endpoint are filled from the target's repo, or by gh from the
 * cwd's repo when the target names none.
 * Unchecked. Failure is a value (`ok: false`), so a caller can tell a 304
 * from an outage.
 */
export function api(
  endpoint: string,
  opts: ApiOptions = {},
  target?: GhTarget,
): GhVerb<ApiResponse> {
  notAFlag('api endpoint', endpoint)
  const conditional = opts.etag !== undefined && opts.etag !== null && opts.etag !== ''
  const withHeaders = conditional || opts.includeHeaders === true
  const paginate = opts.paginate === true
  if (paginate && withHeaders) {
    throw new RangeError('api: paginate cannot be combined with etag or includeHeaders')
  }
  const argv = ['api', ...hostArgs(target)]
  if (withHeaders) argv.push('-i')
  if (conditional) argv.push('-H', `If-None-Match: ${opts.etag}`)
  if (paginate) argv.push('--paginate', '--slurp')
  argv.push(fillRepo(endpoint, target))
  return {
    argv,
    checked: false,
    readOnly: true,
    probe: true,
    parse(r) {
      const response = parseApi(r, withHeaders)
      return paginate ? { ...response, body: flattenPages(response.body) } : response
    },
  }
}

/** `--slurp` pages joined into one array when every page is an array. */
function flattenPages(body: unknown): unknown {
  if (!Array.isArray(body) || !body.every(Array.isArray)) return body
  return (body as unknown[][]).flat()
}

/**
 * A GraphQL variable. gh sends a string with `-f` and the rest with `-F`.
 *
 * @experimental
 */
export type GraphqlVariable = string | number | boolean | null

/**
 * Options for {@link graphql}.
 *
 * @experimental
 */
export interface GraphqlOptions {
  /**
   * Follow every page (`--paginate --slurp`). The query must take
   * `$endCursor: String` and select `pageInfo { hasNextPage endCursor }` on
   * the one connection it pages through. gh follows only that connection.
   */
  paginate?: boolean | undefined
}

/**
 * `gh api graphql -f query=… [--paginate --slurp]`: a GraphQL query.
 *
 * Returns each page's `data`, one entry per page (one without `paginate`).
 * Returns null when the call failed, the output did not parse, or any page
 * carries `errors` or lacks `data`. A partial answer counts as a failure. Read one
 * connection across the pages with {@link nodesAt}.
 *
 * A string variable of exactly `{owner}` or `{repo}` is filled from the
 * target's repo, or by gh from the clone. A mutation document throws
 * `RangeError`. This is a read, and changes go through `raw`.
 *
 * @experimental
 */
export function graphql(
  query: string,
  variables: Record<string, GraphqlVariable> = {},
  opts: GraphqlOptions = {},
  target?: GhTarget,
): GhVerb<unknown[] | null> {
  checkTarget(target)
  const body = query.replace(/^(?:\s|#[^\n]*\n?)*/, '')
  if (/^mutation\b/.test(body) || /^subscription\b/.test(body)) {
    throw new RangeError('graphql: only queries are allowed; send a mutation through raw')
  }
  const paginate = opts.paginate === true
  if (paginate && !query.includes('$endCursor')) {
    throw new RangeError('graphql: paginate needs a query that takes $endCursor')
  }
  const argv = ['api', 'graphql', ...hostArgs(target)]
  if (paginate) argv.push('--paginate', '--slurp')
  const [owner, name] = target?.repo?.split('/') ?? []
  for (const [key, value] of Object.entries(variables)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new RangeError(`graphql: bad variable name ${JSON.stringify(key)}`)
    }
    if (typeof value === 'string') {
      const filled = value === '{owner}' ? owner : value === '{repo}' ? name : undefined
      if (filled !== undefined) argv.push('-f', `${key}=${filled}`)
      else if (value === '{owner}' || value === '{repo}') argv.push('-F', `${key}=${value}`)
      else argv.push('-f', `${key}=${value}`)
    } else {
      argv.push('-F', `${key}=${value === null ? 'null' : String(value)}`)
    }
  }
  argv.push('-f', `query=${query}`)
  return {
    argv,
    checked: false,
    readOnly: true,
    parse(r) {
      if (r.exitCode !== 0) return null
      let data: unknown
      try {
        data = JSON.parse(r.stdout)
      } catch {
        return null
      }
      const pages = paginate ? data : [data]
      if (!Array.isArray(pages)) return null
      const out: unknown[] = []
      for (const page of pages) {
        if (page === null || typeof page !== 'object') return null
        const rec = page as Record<string, unknown>
        if (Array.isArray(rec['errors']) && rec['errors'].length > 0) return null
        if (rec['data'] === null || typeof rec['data'] !== 'object') return null
        out.push(rec['data'])
      }
      return out
    },
  }
}

/**
 * The `nodes` of one connection, joined across {@link graphql} pages. It
 * follows `path` into each page and takes its `nodes` array. Null when `pages` is
 * null, or any page lacks the path or a `nodes` array, so a page that came
 * back short is never read as fewer rows.
 *
 * @experimental
 */
export function nodesAt(pages: unknown[] | null, path: readonly string[]): unknown[] | null {
  if (pages === null) return null
  const out: unknown[] = []
  for (const page of pages) {
    let at: unknown = page
    for (const key of path) {
      if (at === null || typeof at !== 'object') return null
      at = (at as Record<string, unknown>)[key]
    }
    if (at === null || typeof at !== 'object') return null
    const nodes = (at as Record<string, unknown>)['nodes']
    if (!Array.isArray(nodes)) return null
    out.push(...nodes)
  }
  return out
}

/** Split one header block off the front of `text`: the block, and what follows its blank line. */
function takeHeaderBlock(text: string): { block: string; rest: string } {
  const crlf = text.indexOf('\r\n\r\n')
  const lf = text.indexOf('\n\n')
  const useCrlf = crlf >= 0 && (lf < 0 || crlf < lf)
  const sepIdx = useCrlf ? crlf : lf
  if (sepIdx < 0) return { block: text, rest: '' }
  return { block: text.slice(0, sepIdx), rest: text.slice(sepIdx + (useCrlf ? 4 : 2)) }
}

const STATUS_LINE = /^HTTP\/[\d.]+\s+\d{3}/i

/**
 * Split a `gh api -i` payload (status line + headers, blank line, body) and decode it.
 * A real `gh` prints one block. If there are several, the last one is read:
 * its status and ETag, and the body that follows it.
 */
function parseApi(r: CommandResult, withHeaders: boolean): ApiResponse {
  let status = r.exitCode === 0 ? 200 : 0
  let etag: string | null = null
  let bodyText = r.stdout
  if (withHeaders) {
    let { block: headerBlock, rest } = takeHeaderBlock(r.stdout)
    while (STATUS_LINE.test(rest)) ({ block: headerBlock, rest } = takeHeaderBlock(rest))
    bodyText = rest.replace(/^[\r\n]+/, '')
    const statusMatch = headerBlock.match(/HTTP\/[\d.]+\s+(\d{3})/i)
    if (statusMatch) status = Number(statusMatch[1])
    const etagMatch = headerBlock.match(/^etag:\s*(.+)$/im)
    if (etagMatch) etag = etagMatch[1]!.trim()
  }
  let body: unknown = null
  let malformed = false
  if (bodyText.trim() !== '') {
    try {
      body = JSON.parse(bodyText)
    } catch {
      malformed = true
    }
  }
  const ok = r.exitCode === 0 && status >= 200 && status < 400
  const rawMessage =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)['message']
      : undefined
  return {
    ok,
    status,
    etag,
    body,
    message: typeof rawMessage === 'string' ? rawMessage : null,
    malformed,
    stderr: r.stderr.trim(),
    ...(r.error === undefined ? {} : { error: r.error }),
  }
}

/** `gh --version`: checks that `gh` is installed. True when `gh` runs. */
export function installed(): GhVerb<boolean> {
  return {
    argv: ['--version'],
    checked: false,
    readOnly: true,
    probe: true,
    parse: (r) => r.exitCode === 0,
  }
}

/**
 * What `gh auth status` said: whether it passed, and its output (stderr, else the runner's
 * `error`, else stdout), trimmed.
 */
export interface AuthStatus {
  ok: boolean
  detail: string
}

/** `gh auth status [--hostname <host>]`: checks credentials, for one host when the target names it. */
export function authStatus(target?: GhTarget): GhVerb<AuthStatus> {
  return {
    argv: ['auth', 'status', ...hostArgs(target)],
    checked: false,
    readOnly: true,
    probe: true,
    parse: (r) => ({ ok: r.exitCode === 0, detail: stderrOrError(r) || r.stdout.trim() }),
  }
}

/**
 * `gh label list --json name,color,description`: every label on the repo,
 * up to `limit` (default 1000. `gh`'s own default is 30).
 */
export function labelList(
  opts: { limit?: number | undefined } = {},
  target?: GhTarget,
): GhVerb<ListResult<Label> | null> {
  const limit = opts.limit ?? 1000
  checkLimit(limit)
  return {
    argv: [
      'label',
      'list',
      ...repoArgs(target),
      '--json',
      'name,color,description',
      '--limit',
      String(limit + 1),
    ],
    checked: false,
    readOnly: true,
    parse: (r) => limited(manyLabelsOrNull(r), limit),
  }
}

/** What to narrow an issue listing to. Every filter is optional. */
export interface IssueListOptions {
  /** Exact label filter, applied by `gh`. */
  label?: string | undefined
  /** The most issues to return. Defaults to 200. */
  limit?: number | undefined
}

/** `gh issue list --json …`: open issues, optionally by label. */
export function issueList(
  opts: IssueListOptions = {},
  target?: GhTarget,
): GhVerb<ListResult<IssueRow> | null> {
  const limit = opts.limit ?? 200
  checkLimit(limit)
  const argv = ['issue', 'list', ...repoArgs(target)]
  if (opts.label !== undefined) argv.push('--label', opts.label)
  argv.push('--json', ISSUE_FIELDS, '--limit', String(limit + 1))
  return { argv, checked: false, readOnly: true, parse: (r) => limited(manyIssuesOrNull(r), limit) }
}

/** `gh issue view <n> --json …`: one issue, same field set as {@link issueList}. */
export function issueView(number: number, target?: GhTarget): GhVerb<IssueRow | null> {
  return {
    argv: ['issue', 'view', String(number), ...repoArgs(target), '--json', ISSUE_FIELDS],
    checked: false,
    readOnly: true,
    absent: noSuch('issue'),
    parse: oneIssueOrNull,
  }
}

/** The `gh repo list`/`view --json` fields a {@link Repository} reads. */
export const REPO_FIELDS = [
  'nameWithOwner',
  'description',
  'defaultBranchRef',
  'visibility',
  'isArchived',
  'url',
] as const

/** The `gh search prs --json` fields a {@link PrSearchHit} reads. */
export const SEARCH_PR_FIELDS = [
  'number',
  'title',
  'state',
  'url',
  'isDraft',
  'repository',
  'author',
  'labels',
  'createdAt',
  'updatedAt',
  'closedAt',
] as const

/** Parse a `--json` array payload with `parse`, dropping rows it rejects. Null on failure. */
function rowsOrNull<T>(r: CommandResult, parse: (raw: unknown) => T | null): T[] | null {
  if (r.exitCode !== 0) return null
  let data: unknown
  try {
    data = JSON.parse(r.stdout || '[]')
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  return data.map(parse).filter((row): row is T => row !== null)
}

/** What to narrow a repository listing to. Every filter is optional. */
export interface RepoListOptions {
  /** True for archived repositories only, false to leave them out. Both when absent. */
  archived?: boolean | undefined
  visibility?: 'public' | 'private' | 'internal' | undefined
  /** The most repositories to return. Defaults to 100. */
  limit?: number | undefined
  /** Field subset. Defaults to {@link REPO_FIELDS}. `nameWithOwner` is always asked for. */
  fields?: readonly string[] | undefined
}

/**
 * `gh repo list <owner> --json …`: an owner's repositories. The host comes
 * from the target (`GH_HOST`). The target's repo is not used. Each row's
 * `owner` is in GitHub's casing, not as passed. To build paths that match
 * your config, use your own value.
 */
export function repoList(
  owner: string,
  opts: RepoListOptions = {},
  target?: GhTarget,
): GhVerb<ListResult<Repository> | null> {
  notAFlag('repoList owner', owner)
  const limit = opts.limit ?? 100
  checkLimit(limit)
  const argv = ['repo', 'list', owner]
  if (opts.archived === true) argv.push('--archived')
  if (opts.archived === false) argv.push('--no-archived')
  if (opts.visibility !== undefined) argv.push('--visibility', opts.visibility)
  argv.push('--json', withFields(opts.fields ?? REPO_FIELDS, ['nameWithOwner']).join(','))
  argv.push('--limit', String(limit + 1))
  return {
    argv,
    checked: false,
    readOnly: true,
    env: hostEnv(target),
    parse: (r) => limited(rowsOrNull(r, parseRepository), limit),
  }
}

/**
 * `gh repo view [<[host/]owner/name>] --json …`: one repository. That is `repo`,
 * else the target's repo, else the clone at the client's cwd. The result's
 * `owner` and `name` are in GitHub's casing, not as passed.
 */
export function repoView(
  repo?: string | undefined,
  fields: readonly string[] = REPO_FIELDS,
  target?: GhTarget,
): GhVerb<Repository | null> {
  checkTarget(target)
  if (repo !== undefined) checkTarget({ repo })
  const slug = repo ?? target?.repo
  const argv = ['repo', 'view']
  if (slug !== undefined) {
    argv.push(target?.hostname === undefined ? slug : `${target.hostname}/${slug}`)
  }
  argv.push('--json', withFields(fields, ['nameWithOwner']).join(','))
  return {
    argv,
    checked: false,
    readOnly: true,
    absent: noSuch('repo'),
    parse(r) {
      if (r.exitCode !== 0) return null
      try {
        return parseRepository(JSON.parse(r.stdout))
      } catch {
        return null
      }
    },
  }
}

/** What to narrow a pull request search to. Every filter is optional. */
export interface SearchPrsOptions {
  /** Only repositories this user or organization owns. */
  owner?: string | undefined
  /** Only this `owner/name` repository. */
  repo?: string | undefined
  /** `merged` is `--merged`. `open` and `closed` are `--state`. */
  state?: 'open' | 'closed' | 'merged' | undefined
  /** The most hits to return. Defaults to 100. */
  limit?: number | undefined
  /** Field subset. Defaults to {@link SEARCH_PR_FIELDS}. `number` is always asked for. */
  fields?: readonly string[] | undefined
}

/**
 * `gh search prs [flags] -- <query>`: pull requests across repositories,
 * with GitHub's search syntax in `query` (it may start with `-`, as in
 * `-label:bug`). The host comes from the target (`GH_HOST`). The target's
 * repo is not used, so pass `opts.repo` or `opts.owner` to narrow.
 */
export function searchPrs(
  query: string,
  opts: SearchPrsOptions = {},
  target?: GhTarget,
): GhVerb<ListResult<PrSearchHit> | null> {
  const limit = opts.limit ?? 100
  checkLimit(limit)
  const argv = ['search', 'prs']
  if (opts.owner !== undefined) {
    notAFlag('searchPrs owner', opts.owner)
    argv.push('--owner', opts.owner)
  }
  if (opts.repo !== undefined) {
    checkTarget({ repo: opts.repo })
    argv.push('--repo', opts.repo)
  }
  if (opts.state === 'merged') argv.push('--merged')
  else if (opts.state !== undefined) argv.push('--state', opts.state)
  argv.push('--json', withFields(opts.fields ?? SEARCH_PR_FIELDS, ['number']).join(','))
  argv.push('--limit', String(limit + 1))
  if (query !== '') argv.push('--', query)
  return {
    argv,
    checked: false,
    readOnly: true,
    env: hostEnv(target),
    parse: (r) => limited(rowsOrNull(r, parsePrSearchHit), limit),
  }
}

// ── mutations (checked: a non-zero exit throws the classified failure) ──────

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

/**
 * `gh pr create …`, returning the new PR's URL: the last line gh printed that
 * starts with `http://` or `https://`. `''` when it printed none, as
 * {@link prComment} does. A line after the URL, such as a tip, is skipped.
 */
export function createPr(opts: CreatePrOptions, target?: GhTarget): GhVerb<string> {
  const argv = ['pr', 'create', ...repoArgs(target), '--head', opts.head, '--base', opts.base]
  if (opts.draft) argv.push('--draft')
  argv.push('--title', opts.title, '--body', opts.body)
  return {
    argv,
    checked: true,
    readOnly: false,
    parse(r) {
      const urls = r.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^https?:\/\//.test(l))
      return urls[urls.length - 1] ?? ''
    },
  }
}

/** `gh pr edit <n>`: change the title or the body. */
export function editPr(
  number: number,
  opts: { title?: string | undefined; body?: string | undefined },
  target?: GhTarget,
): GhVerb<void> {
  const argv = ['pr', 'edit', String(number), ...repoArgs(target)]
  if (opts.title !== undefined) argv.push('--title', opts.title)
  if (opts.body !== undefined) argv.push('--body', opts.body)
  return { argv, checked: true, readOnly: false, parse: nothing }
}

/** `gh pr edit <n> --body`: rewrite just the body. */
export function editPrBody(number: number, body: string, target?: GhTarget): GhVerb<void> {
  return editPr(number, { body }, target)
}

/** `gh pr update-branch <n> [--rebase]`: bring the head up to date with its base. */
export function prUpdateBranch(
  number: number,
  style: 'merge' | 'rebase' = 'merge',
  target?: GhTarget,
): GhVerb<void> {
  const argv = ['pr', 'update-branch', String(number), ...repoArgs(target)]
  if (style === 'rebase') argv.push('--rebase')
  return { argv, checked: true, readOnly: false, parse: nothing }
}

/** `gh pr ready <n> [--undo]`: mark a draft PR ready for review, or (with `draft`) convert it back to a draft. */
export function prSetDraft(number: number, draft: boolean, target?: GhTarget): GhVerb<void> {
  const argv = ['pr', 'ready', String(number), ...repoArgs(target)]
  if (draft) argv.push('--undo')
  return { argv, checked: true, readOnly: false, parse: nothing }
}

/**
 * `gh api -X PATCH repos/{owner}/{repo}/issues/comments/<id> -f body=…`: rewrite one
 * conversation comment.
 *
 * `commentId` is the comment's numeric REST id, as text. That is the `id` that
 * `gh api repos/{owner}/{repo}/issues/<n>/comments` returns. It is not the
 * GraphQL node id (such as `IC_kw…`) that `gh pr view --json comments` gives
 * in `Comment.id`. The REST path answers 404 for a node id.
 *
 * Throws `RangeError` when `commentId` is not all digits, so a node id fails
 * at once and no text can change which endpoint the PATCH reaches.
 *
 * @experimental
 */
export function issueCommentEdit(commentId: string, body: string, target?: GhTarget): GhVerb<void> {
  if (!/^[0-9]+$/.test(commentId)) {
    throw new RangeError(
      `issueCommentEdit: commentId must be a numeric REST id, got ${JSON.stringify(commentId)}`,
    )
  }
  return {
    argv: [
      'api',
      ...hostArgs(target),
      '-X',
      'PATCH',
      fillRepo(`repos/{owner}/{repo}/issues/comments/${commentId}`, target),
      '-f',
      `body=${body}`,
    ],
    checked: true,
    readOnly: false,
    parse: nothing,
  }
}

/** How {@link prMerge} lands the commits: `squash` into one, `merge` with a merge commit, or `rebase`. */
export type PrMergeMethod = 'squash' | 'merge' | 'rebase'

/**
 * `gh pr merge <n> --<method> --match-head-commit <sha>`. The head sha is
 * required. GitHub refuses the merge when the PR head moved since the caller
 * checked it. So a push that lands between the check and the merge cannot be
 * merged without review. The branch is left alone (no `--delete-branch`).
 * Deleting it is the caller's job.
 */
export function prMerge(
  number: number,
  opts: { method: PrMergeMethod; headSha: string },
  target?: GhTarget,
): GhVerb<void> {
  const argv = [
    'pr',
    'merge',
    String(number),
    ...repoArgs(target),
    `--${opts.method}`,
    '--match-head-commit',
    opts.headSha,
  ]
  return { argv, checked: true, readOnly: false, parse: nothing }
}

/** One review thread: whether it is resolved and who spoke last. */
export interface ReviewThread {
  isResolved: boolean
  isOutdated: boolean
  /** Login of the author of the thread's newest comment. Null when the account is gone. */
  lastCommentAuthor: string | null
}

const REVIEW_THREADS_QUERY =
  'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){pageInfo{hasNextPage} nodes{isResolved isOutdated comments(last:1){nodes{author{login}}}}}}}}'

/**
 * A PR's review threads over GraphQL (`gh pr view --json` has no thread
 * field). Null, never `[]`, when the call failed, the payload was not the
 * expected shape, or more than 100 threads exist. A caller deciding whether a
 * PR is clear to merge must tell "could not tell" from "no threads".
 */
export function prReviewThreads(number: number, target?: GhTarget): GhVerb<ReviewThread[] | null> {
  checkTarget(target)
  // `-F` lets gh fill the placeholders from the clone. Real values go as plain strings.
  const [owner, name] = target?.repo?.split('/') ?? []
  const repo =
    owner === undefined || name === undefined
      ? ['-F', 'owner={owner}', '-F', 'name={repo}']
      : ['-f', `owner=${owner}`, '-f', `name=${name}`]
  return {
    argv: [
      'api',
      'graphql',
      ...hostArgs(target),
      ...repo,
      '-F',
      `number=${number}`,
      '-f',
      `query=${REVIEW_THREADS_QUERY}`,
    ],
    checked: false,
    readOnly: true,
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
 * `--force` makes it safe to repeat. When the label already exists, its color
 * and description are set to these instead of failing.
 */
export function createLabel(opts: CreateLabelOptions, target?: GhTarget): GhVerb<void> {
  const argv = [
    'label',
    'create',
    opts.name,
    ...repoArgs(target),
    '--color',
    opts.color,
    '--description',
    opts.description,
    '--force',
  ]
  return { argv, checked: true, readOnly: false, parse: nothing }
}

/** `gh label edit <name>`: change the color or description. A flag not given is left out. */
export function editLabel(
  name: string,
  opts: { color?: string | undefined; description?: string | undefined },
  target?: GhTarget,
): GhVerb<void> {
  const argv = ['label', 'edit', name, ...repoArgs(target)]
  if (opts.color !== undefined) argv.push('--color', opts.color)
  if (opts.description !== undefined) argv.push('--description', opts.description)
  return { argv, checked: true, readOnly: false, parse: nothing }
}

/**
 * `gh issue edit <n> [--remove-label <current>] --add-label <new>`: swap one
 * label for another on an issue in one call. The issue is never left with
 * neither label or both labels between the remove and the add.
 *
 * That covers only the call itself. `currentLabel` is whatever the caller
 * read earlier, perhaps from a `gh issue list` minutes before. It is not read
 * again here. If someone relabeled the issue since then, `--remove-label
 * <currentLabel>` names a label the issue no longer has. `gh` skips that
 * removal with no error and still adds `newLabel`. The issue then has both
 * its current label and `newLabel`. A caller that cares reads the label again
 * just before calling this. Pass `null` for `currentLabel` when there is no
 * label to remove. The `--remove-label` flag is then left out.
 */
export function setIssueLabel(
  number: number,
  currentLabel: string | null,
  newLabel: string,
  target?: GhTarget,
): GhVerb<void> {
  const argv = ['issue', 'edit', String(number), ...repoArgs(target)]
  if (currentLabel !== null) argv.push('--remove-label', currentLabel)
  argv.push('--add-label', newLabel)
  return { argv, checked: true, readOnly: false, parse: nothing }
}

/** `gh pr diff <n>`: the PR's unified diff, as text. Checked, so an empty diff is a value and a failed call throws. */
export function prDiff(number: number, target?: GhTarget): GhVerb<string> {
  return {
    argv: ['pr', 'diff', String(number), ...repoArgs(target)],
    checked: true,
    readOnly: true,
    parse: (r) => r.stdout,
  }
}

/** `gh pr comment <n> --body <body>`: post a conversation comment, returning the URL gh prints ('' if none). */
export function prComment(number: number, body: string, target?: GhTarget): GhVerb<string> {
  return {
    argv: ['pr', 'comment', String(number), ...repoArgs(target), '--body', body],
    checked: true,
    readOnly: false,
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
  /** The commit the review is on. Line numbers refer to the diff at this sha. */
  commitId: string
  /** The review summary. GitHub rejects a review whose body and comments are both empty. */
  body: string
  comments: readonly ReviewComment[]
}

/**
 * Create a PR review with inline comments, returning the review's URL (empty
 * when GitHub's reply carried none). The event is always `COMMENT`. This
 * library does not offer a way to approve or request changes. It goes through
 * `gh api` with the payload on stdin, because `gh pr review` cannot attach
 * comments to lines. `{owner}`/`{repo}` come from the target's repo, or
 * are filled in by `gh` from the client's working directory.
 *
 * @experimental
 */
export function createReview(
  number: number,
  opts: CreateReviewOptions,
  target?: GhTarget,
): GhVerb<string> {
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
      ...hostArgs(target),
      '--method',
      'POST',
      fillRepo(`repos/{owner}/{repo}/pulls/${number}/reviews`, target),
      '--input',
      '-',
    ],
    checked: true,
    readOnly: false,
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
 * The first row whose `headRefName` exactly equals `branch`, or null.
 *
 * `prList({ head })` already filters exactly. This is for rows from anywhere
 * else, such as a `search` query with gh's `head:` qualifier, which matches
 * `task/foo-2` for `task/foo`.
 */
export function pickPrForBranch(rows: PullRequest[] | null, branch: string): PullRequest | null {
  if (rows === null) return null
  return rows.find((r) => r.headRefName === branch) ?? null
}

/**
 * The PR a branch names, from `prList({ head, state: 'all' })` rows: the open
 * one, or else the first row (gh lists newest first). Null when there are no
 * rows or the call failed.
 */
export function branchPr(result: ListResult<PullRequest> | null): PullRequest | null {
  if (result === null) return null
  return result.rows.find((r) => r.state === 'OPEN') ?? result.rows[0] ?? null
}

/** The field set {@link branchPr} needs, ahead of `fields`. */
export function branchPrFields(fields: readonly string[]): string[] {
  return withFields(fields, ['number', 'state', 'headRefName'])
}

/**
 * True when GitHub has not finished computing this PR's mergeability.
 *
 * The first answer may not be final. GitHub starts the merge computation when
 * asked and answers `UNKNOWN` until it finishes. A caller that treats the
 * first `UNKNOWN` as final misjudges a PR whose computation is slow. So ask a
 * few times before trusting it.
 */
export function needsMergeStateRetry(pr: PullRequest): boolean {
  return pr.mergeable === 'UNKNOWN' || pr.mergeStateStatus === 'UNKNOWN'
}
