/**
 * `Gh`: the synchronous GitHub client, the companion of `@osdlc/typed-git`'s
 * `Git`, bound to one working directory and one {@link CommandRunner}.
 *
 * `gh` handles authentication. No token is read, stored, or passed. That is
 * why this runs the CLI instead of calling the REST API. The credential is
 * already in the user's keychain. A library that reads `GITHUB_TOKEN` can
 * leak it.
 *
 * It has the same three call styles as the git client. The plain method
 * returns a value or throws. A failed `gh` throws a `FailureError` carrying
 * the classified `GhFailure`. Output that cannot be read throws one of kind
 * `unreadable`. A query for one thing (`prView`, `issueView`, `repoView`)
 * returns `null` when GitHub says there is no such thing. `gh.try.*` returns
 * the failure as a `Result<T, GhFailure>`. `gh.soft.*` returns `null` for it.
 * `raw` and `rawChecked` run any `gh` call.
 */

import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'

import { runCheckedGh, softSync, triedSync, type Soft, type TriedSync } from './doors.ts'
import { runVerb } from './run.ts'
import * as v from './verbs.ts'
import type {
  ApiOptions,
  ApiResponse,
  AuthStatus,
  GhTarget,
  GhVerb,
  IssueListOptions,
  ListResult,
  PrListOptions,
} from './verbs.ts'
import { ownerRepoSlug, parseOwnerRepo, parsePrRef } from './repo.ts'
import type { IssueRow, Label, OwnerRepo, PrSearchHit, PullRequest, Repository } from './types.ts'

/**
 * Makes a runner for a binary. A CLI passes one factory to every place that
 * runs a command. Real code uses `spawnRunner`. Tests pass a factory that
 * records calls, so the CLI runs offline.
 */
export type RunnerFactory = (binary: string) => CommandRunner

/**
 * The default factory: real runners that use `spawnSync`. A bare name is
 * found on absolute `PATH` entries only, so a file of that name in the
 * working directory cannot run in its place.
 */
export const defaultRunnerFactory: RunnerFactory = (binary) =>
  spawnRunner(binary, { absolutePathOnly: true })

/** How long to wait between merge-state retries, in milliseconds. */
const MERGE_STATE_RETRY_DELAY_MS = 1_500

/** What a client is built with: the runner, and the repository and host it talks to. */
export interface GhOptions extends GhTarget {
  runner?: CommandRunner | undefined
}

/**
 * A typed gh client bound to one working directory, and optionally to one
 * repository and host.
 *
 * With `repo`, every call names that repository (`--repo`, or the
 * `{owner}/{repo}` of an `api` endpoint), so no clone is needed. Without it,
 * gh uses the repository of the clone at `cwd`. With `hostname`, every call
 * goes to that GitHub host. An invalid `repo` or `hostname` throws
 * `RangeError`.
 *
 * Every `timeoutMs` option is a hard cap on the call. An invalid value
 * throws, as in command-seam: `RangeError` for 0, a negative value or `NaN`;
 * `TypeError` for a non-number.
 */
export class Gh {
  readonly cwd: string
  readonly repo: string | undefined
  readonly hostname: string | undefined
  private readonly target: GhTarget
  private readonly runner: CommandRunner
  private tried: TriedSync<Gh> | undefined
  private softened: Soft<Gh> | undefined

  constructor(cwd: string, opts: GhOptions = {}) {
    v.checkTarget(opts)
    this.cwd = cwd
    this.repo = opts.repo
    this.hostname = opts.hostname
    this.target = { repo: opts.repo, hostname: opts.hostname }
    this.runner = opts.runner ?? defaultRunnerFactory('gh')
  }

  /** The same client rooted at a different directory (same runner, repo and host). */
  at(cwd: string): Gh {
    return new Gh(cwd, { runner: this.runner, repo: this.repo, hostname: this.hostname })
  }

  /** The same client aimed at another repository (same runner, directory and host). */
  withRepo(repo: string): Gh {
    return new Gh(this.cwd, { runner: this.runner, repo, hostname: this.hostname })
  }

  /**
   * The whole surface again, returning a `Result<T, GhFailure>` instead of
   * throwing. `gh.try.prList()` is `{ ok: true, value } | { ok: false, error }`.
   * A query for one thing that finds nothing is `ok: true` with `null`. See
   * `./doors.ts`.
   *
   * The type leaves out `raw`, `rawChecked` and the helpers that run nothing.
   * At runtime the proxy wraps `raw` and `rawChecked` too. Call those on the
   * client itself.
   */
  get try(): TriedSync<Gh> {
    return (this.tried ??= triedSync(this))
  }

  /**
   * Each query again, returning `null` instead of throwing when `gh` fails. A
   * mutation has no soft form. Do not decide a write on a `null` from `soft`.
   * It is the answer for "could not ask" as well as for "nothing there". Use
   * `try` where the difference matters.
   */
  get soft(): Soft<Gh> {
    return (this.softened ??= softSync(this))
  }

  // ── raw calls ─────────────────────────────────────────────────────────────

  /** Run any `gh` call and return the result, whatever the exit code. */
  raw(argv: string[], opts: { timeoutMs?: number | undefined } = {}): CommandResult {
    return this.runner.run(argv, { cwd: this.cwd, ...opts })
  }

  /** Run any `gh` call. Throws the classified failure on a non-zero exit. */
  rawChecked(argv: string[], opts: { timeoutMs?: number | undefined } = {}): CommandResult {
    return runCheckedGh(this.runner, argv, { cwd: this.cwd, ...opts })
  }

  /** Run one verb from the table, checked or unchecked as the verb says. */
  private exec<T>(verb: GhVerb<T>, timeoutMs?: number | undefined): T {
    return runVerb(verb, this.runner, { cwd: this.cwd, timeoutMs })
  }

  /** {@link exec} for a verb that never returns `null` as a value. A failed or unreadable run throws. */
  private read<T>(verb: GhVerb<T | null>, timeoutMs?: number | undefined): T {
    return this.exec(verb, timeoutMs) as T
  }

  // ── queries ───────────────────────────────────────────────────────────────

  /** Pull requests matching `opts`. Throws when gh fails. `soft.prList` gives null instead. */
  prList(opts: PrListOptions & { timeoutMs?: number | undefined } = {}): ListResult<PullRequest> {
    return this.read(v.prList(opts, this.target), opts.timeoutMs)
  }

  /**
   * One PR by number, branch or URL, with the full field set. Null when there
   * is no such PR. Throws when gh fails otherwise.
   */
  prView(
    ref: number | string,
    opts: { fields?: readonly string[] | undefined; timeoutMs?: number | undefined } = {},
  ): PullRequest | null {
    return this.exec(v.prView(ref, opts.fields ?? v.PR_VIEW_FIELDS, this.target), opts.timeoutMs)
  }

  /**
   * The one PR that `input` names, or null. `input` is what a person typed,
   * such as `42`, `#42`, `owner/name#42`, a URL or a branch (read by
   * `parsePrRef`).
   *
   * Digits are a PR number first. When no such PR comes back, they are tried
   * as a branch. A branch gives its open PR, or else its newest closed or
   * merged one, so a tool run after the merge still finds it. Fields default
   * to {@link PR_LIST_FIELDS}.
   */
  prFind(
    input: string,
    opts: { fields?: readonly string[] | undefined; timeoutMs?: number | undefined } = {},
  ): PullRequest | null {
    const ref = parsePrRef(input)
    if (ref === null) return null
    const fields = opts.fields ?? v.PR_LIST_FIELDS
    const call = { fields, timeoutMs: opts.timeoutMs }
    if (ref.kind === 'url') return this.prView(ref.url, call)
    if (ref.kind === 'branch') return prForBranchOn(this, ref.name, call)
    const client = ref.repo === null ? this : this.withRepo(ownerRepoSlug(ref.repo))
    const pr = client.prView(ref.number, call)
    return pr !== null || ref.orBranch === null ? pr : prForBranchOn(this, ref.orBranch, call)
  }

  /**
   * The open PR whose head exactly equals `branch`, or null.
   *
   * Defaults to {@link PR_REF_FIELDS}, so finding a PR does not make GitHub
   * compute the merge state. Pass `opts.fields` to ask for more (such as
   * `isDraft`) in the same call. That saves a second `prList` or `prView`
   * call when the caller already knows it needs the field.
   */
  openPrFor(
    branch: string,
    opts: { limit?: number | undefined; fields?: readonly string[] | undefined } = {},
  ): PullRequest | null {
    const rows = this.prList({
      head: branch,
      limit: opts.limit ?? 5,
      fields: opts.fields ?? v.PR_REF_FIELDS,
    })
    return v.pickPrForBranch(rows.rows, branch)
  }

  /**
   * {@link prView}, asked again until GitHub has computed the merge state.
   *
   * GitHub computes mergeability only when asked. The first query starts it
   * and answers `UNKNOWN` while it runs. A caller that trusts that first
   * answer misjudges every PR whose computation is slow. So this asks up to
   * `attempts` times while the answer is `UNKNOWN`. The last answer is
   * returned either way. `UNKNOWN` can be the final answer, and callers must
   * still handle it.
   *
   * `sleep` is an option so a test does not spend real seconds waiting.
   */
  prViewSettled(
    number: number,
    opts: {
      attempts?: number | undefined
      fields?: readonly string[] | undefined
      sleep?: ((ms: number) => void) | undefined
      timeoutMs?: number | undefined
    } = {},
  ): PullRequest | null {
    const attempts = Math.max(1, opts.attempts ?? 3)
    const sleep = opts.sleep ?? sleepSync
    let last: PullRequest | null = null
    for (let i = 0; i < attempts; i += 1) {
      last = this.prView(number, opts)
      if (last === null || !v.needsMergeStateRetry(last)) return last
      if (i < attempts - 1) sleep(MERGE_STATE_RETRY_DELAY_MS)
    }
    return last
  }

  /** A PR's body text. Throws when gh fails. */
  prBody(number: number, opts: { timeoutMs?: number | undefined } = {}): string {
    return this.read(v.prBody(number, this.target), opts.timeoutMs)
  }

  /**
   * A REST GET through `gh api`. Never throws for a failed call, in any call
   * style. Failure is `ok: false` on the returned {@link ApiResponse}.
   */
  api(endpoint: string, opts: ApiOptions & { timeoutMs?: number | undefined } = {}): ApiResponse {
    return this.exec(v.api(endpoint, opts, this.target), opts.timeoutMs)
  }

  /**
   * A GraphQL query. Returns each page's `data`. Throws on a failed or partial
   * result. `soft.graphql` gives null. See the `graphql` verb.
   *
   * @experimental
   */
  graphql(
    query: string,
    variables: Record<string, v.GraphqlVariable> = {},
    opts: v.GraphqlOptions & { timeoutMs?: number | undefined } = {},
  ): unknown[] {
    return this.read(v.graphql(query, variables, opts, this.target), opts.timeoutMs)
  }

  /** Every label on the repository (up to `opts.limit`, default 1000). Throws when gh fails. */
  labelList(
    opts: { limit?: number | undefined; timeoutMs?: number | undefined } = {},
  ): ListResult<Label> {
    return this.read(v.labelList(opts, this.target), opts.timeoutMs)
  }

  /** Issues matching `opts` (open by default, up to 200). Throws when gh fails. */
  issueList(
    opts: IssueListOptions & { timeoutMs?: number | undefined } = {},
  ): ListResult<IssueRow> {
    return this.read(v.issueList(opts, this.target), opts.timeoutMs)
  }

  /** One issue with its labels, or null when there is no such issue. Throws when gh fails otherwise. */
  issueView(number: number, opts: { timeoutMs?: number | undefined } = {}): IssueRow | null {
    return this.exec(v.issueView(number, this.target), opts.timeoutMs)
  }

  /** An owner's repositories (up to `opts.limit`, default 100). Throws when gh fails. */
  repoList(
    owner: string,
    opts: v.RepoListOptions & { timeoutMs?: number | undefined } = {},
  ): ListResult<Repository> {
    return this.read(v.repoList(owner, opts, this.target), opts.timeoutMs)
  }

  /** One repository: `repo`, else the client's repo, else the clone at `cwd`. Null when there is no such repository. */
  repoView(
    repo?: string | undefined,
    opts: { fields?: readonly string[] | undefined; timeoutMs?: number | undefined } = {},
  ): Repository | null {
    return this.exec(v.repoView(repo, opts.fields ?? v.REPO_FIELDS, this.target), opts.timeoutMs)
  }

  /** Pull requests across repositories matching a search query. Throws when gh fails. */
  searchPrs(
    query: string,
    opts: v.SearchPrsOptions & { timeoutMs?: number | undefined } = {},
  ): ListResult<PrSearchHit> {
    return this.read(v.searchPrs(query, opts, this.target), opts.timeoutMs)
  }

  /** True iff the `gh` binary is on PATH and runs. */
  installed(): boolean {
    return this.exec(v.installed())
  }

  /**
   * True iff `gh` holds credentials. Call it on its own to report the two
   * checks separately. "gh is missing" and "gh is not logged in" need
   * different fixes. A report that merges them sends someone to install
   * software they already have.
   */
  authenticated(): boolean {
    return this.authStatus().ok
  }

  /** Login state and what `gh auth status` printed. `authenticated()` is its `ok`. */
  authStatus(): AuthStatus {
    return this.exec(v.authStatus(this.target))
  }

  /**
   * True iff `gh` is installed and authenticated.
   *
   * Skips the auth check when `gh` is not installed, since there is nothing to
   * ask.
   */
  ready(): boolean {
    return this.installed() && this.authenticated()
  }

  /**
   * `{owner, repo}` parsed from the remote URL you pass, or null when it is
   * null or names no project.
   *
   * It reads no git config, starts no process and does not ask GitHub.
   */
  ownerRepo(remoteUrl: string | null): OwnerRepo | null {
    return remoteUrl === null ? null : parseOwnerRepo(remoteUrl)
  }

  // ── mutations (checked) ───────────────────────────────────────────────────

  /** Open a PR and return its URL ('' if gh printed none). */
  createPr(opts: v.CreatePrOptions): string {
    return this.exec(v.createPr(opts, this.target))
  }

  /** Retitle or rewrite a PR body. */
  editPr(number: number, opts: { title?: string | undefined; body?: string | undefined }): void {
    this.exec(v.editPr(number, opts, this.target))
  }

  /** The PR's unified diff. Throws the classified failure when gh cannot produce it. */
  prDiff(number: number): string {
    return this.exec(v.prDiff(number, this.target))
  }

  /** Post one conversation comment on a PR. Returns its URL ('' if gh printed none). */
  prComment(number: number, body: string): string {
    return this.exec(v.prComment(number, body, this.target))
  }

  /**
   * Create a `COMMENT` review with inline comments. Returns the review's URL ('' if none came back).
   *
   * @experimental
   */
  createReview(number: number, opts: v.CreateReviewOptions): string {
    return this.exec(v.createReview(number, opts, this.target))
  }

  /** Rewrite just a PR's body. */
  editPrBody(number: number, body: string): void {
    this.exec(v.editPrBody(number, body, this.target))
  }

  /** Bring a PR's head branch up to date with its base. */
  prUpdateBranch(number: number, style: 'merge' | 'rebase' = 'merge'): void {
    this.exec(v.prUpdateBranch(number, style, this.target))
  }

  /** Mark a PR ready for review (`draft: false`) or convert it to a draft (`draft: true`). */
  prSetDraft(number: number, draft: boolean): void {
    this.exec(v.prSetDraft(number, draft, this.target))
  }

  /**
   * Rewrite one PR conversation comment's body. `commentId` is the numeric REST id. Anything else throws `RangeError`.
   *
   * @experimental
   */
  issueCommentEdit(commentId: string, body: string): void {
    this.exec(v.issueCommentEdit(commentId, body, this.target))
  }

  /** Merge a PR. GitHub refuses when its head is no longer `opts.headSha`. */
  prMerge(number: number, opts: { method: v.PrMergeMethod; headSha: string }): void {
    this.exec(v.prMerge(number, opts, this.target))
  }

  /** A PR's review threads. Throws when they could not be read completely. */
  prReviewThreads(number: number): v.ReviewThread[] {
    return this.read(v.prReviewThreads(number, this.target))
  }

  /** Create a label (or force it to `opts`'s color/description if it already exists). */
  createLabel(opts: v.CreateLabelOptions): void {
    this.exec(v.createLabel(opts, this.target))
  }

  /** Recolor and/or redescribe an existing label. */
  editLabel(
    name: string,
    opts: { color?: string | undefined; description?: string | undefined },
  ): void {
    this.exec(v.editLabel(name, opts, this.target))
  }

  /**
   * Swap an issue's label: remove `currentLabel` (when given) and add
   * `newLabel`, in a single `gh issue edit` call. The issue is never left
   * with neither label or both labels in between.
   */
  setIssueLabel(number: number, currentLabel: string | null, newLabel: string): void {
    this.exec(v.setIssueLabel(number, currentLabel, newLabel, this.target))
  }
}

/** The open PR for `branch`, else its newest closed or merged one. */
function prForBranchOn(
  gh: Gh,
  branch: string,
  call: { fields: readonly string[]; timeoutMs?: number | undefined },
): PullRequest | null {
  const rows = gh.prList({
    head: branch,
    state: 'all',
    limit: 20,
    fields: v.branchPrFields(call.fields),
    timeoutMs: call.timeoutMs,
  })
  return v.branchPr(rows)
}

/**
 * Block the calling thread. The synchronous client has no event loop to
 * await on. The alternative is to make every caller async for one retry
 * delay.
 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
