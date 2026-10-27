/**
 * `AsyncGh`: the awaitable GitHub client, with the same methods as {@link Gh}.
 *
 * It has the same three call styles, as Promises. The plain method resolves to
 * a value or rejects with a `FailureError` carrying the classified `GhFailure`,
 * for a failed gh or output it cannot read. A query for one thing resolves
 * `null` when GitHub has no such thing. `try` resolves to a
 * `Result<T, GhFailure>`. `soft` resolves `null` for a failure. `raw` and
 * `rawChecked` run any `gh` call. It uses the same verb table as `Gh`, so the
 * two cannot differ on argv or parsing. Use it where the sync client would
 * block the event loop, such as many per-PR queries at once.
 */

import { spawnRunnerAsync, type AsyncCommandRunner, type CommandResult } from '@osdlc/command-seam'

import { runCheckedGhAsync, softAsync, triedAsync, type Soft, type TriedAsync } from './doors.ts'
import { runVerbAsync } from './run.ts'
import { ownerRepoSlug, parseOwnerRepo, parsePrRef } from './repo.ts'
import type { IssueRow, Label, OwnerRepo, PrSearchHit, PullRequest, Repository } from './types.ts'
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

/**
 * Per-call options for {@link AsyncGh}. Sixteen methods accept them: `raw`, `rawChecked`,
 * `prList`, `prView`, `prFind`, `openPrFor`, `prViewSettled`, `prBody`, `api`, `graphql`,
 * `labelList`, `issueList`, `issueView`, `repoList`, `repoView` and `searchPrs`.
 */
export interface AsyncCallOptions {
  /**
   * Hard cap on the call. An invalid value rejects, as in command-seam:
   * `RangeError` for 0, a negative value or `NaN`; `TypeError` for a
   * non-number.
   */
  timeoutMs?: number | undefined
  /** Aborts the call. The runner stops the child process. */
  signal?: AbortSignal | undefined
}

/** How long to wait between merge-state retries, in milliseconds. */
const MERGE_STATE_RETRY_DELAY_MS = 1_500

/** What an {@link AsyncGh} is built with: the runner, and the repository and host it talks to. */
export interface AsyncGhOptions extends GhTarget {
  runner?: AsyncCommandRunner | undefined
}

/**
 * A typed, awaitable gh client bound to one working directory, and optionally
 * to one repository and host. `repo` and `hostname` work as on `Gh`.
 */
export class AsyncGh {
  readonly cwd: string
  readonly repo: string | undefined
  readonly hostname: string | undefined
  private readonly target: GhTarget
  private readonly runner: AsyncCommandRunner
  private tried: TriedAsync<AsyncGh> | undefined
  private softened: Soft<AsyncGh> | undefined

  constructor(cwd: string, opts: AsyncGhOptions = {}) {
    v.checkTarget(opts)
    this.cwd = cwd
    this.repo = opts.repo
    this.hostname = opts.hostname
    this.target = { repo: opts.repo, hostname: opts.hostname }
    this.runner = opts.runner ?? spawnRunnerAsync('gh', { absolutePathOnly: true })
  }

  /** The same client rooted at a different directory (same runner, repo and host). */
  at(cwd: string): AsyncGh {
    return new AsyncGh(cwd, { runner: this.runner, repo: this.repo, hostname: this.hostname })
  }

  /** The same client aimed at another repository (same runner, directory and host). */
  withRepo(repo: string): AsyncGh {
    return new AsyncGh(this.cwd, { runner: this.runner, repo, hostname: this.hostname })
  }

  /**
   * The whole surface again, resolving to a `Result<T, GhFailure>` instead of
   * rejecting. A query for one thing that finds nothing is `ok: true` with
   * `null`. See `Gh.try`.
   */
  get try(): TriedAsync<AsyncGh> {
    return (this.tried ??= triedAsync(this))
  }

  /** Each query again, resolving `null` instead of rejecting when `gh` fails. See `Gh.soft`. */
  get soft(): Soft<AsyncGh> {
    return (this.softened ??= softAsync(this))
  }

  // ── raw calls ─────────────────────────────────────────────────────────────

  /** Run any `gh` call and return the result, whatever the exit code. */
  raw(argv: string[], opts: AsyncCallOptions = {}): Promise<CommandResult> {
    return this.runner.run(argv, { cwd: this.cwd, ...opts })
  }

  /** Run any `gh` call. Rejects with the classified failure on a non-zero exit. */
  rawChecked(argv: string[], opts: AsyncCallOptions = {}): Promise<CommandResult> {
    return runCheckedGhAsync(this.runner, argv, { cwd: this.cwd, ...opts })
  }

  /** Run one verb from the table, checked or unchecked as the verb says. */
  private async exec<T>(verb: GhVerb<T>, call: AsyncCallOptions = {}): Promise<T> {
    return runVerbAsync(verb, this.runner, {
      cwd: this.cwd,
      timeoutMs: call.timeoutMs,
      signal: call.signal,
    })
  }

  /** {@link exec} for a verb that never returns `null` as a value. A failed or unreadable run rejects. */
  private async read<T>(verb: GhVerb<T | null>, call: AsyncCallOptions = {}): Promise<T> {
    return (await this.exec(verb, call)) as T
  }

  // ── queries ───────────────────────────────────────────────────────────────
  //
  // Every method that builds a verb is `async`, so a bad argument (a verb's
  // RangeError) rejects the Promise instead of throwing at the call site.

  /** Pull requests matching `opts`. Rejects when gh fails. `soft.prList` resolves null instead. */
  async prList(opts: PrListOptions & AsyncCallOptions = {}): Promise<ListResult<PullRequest>> {
    return this.read(v.prList(opts, this.target), opts)
  }

  /** One PR by number, branch or URL, with the heavy fields, or null. See `Gh.prView`. */
  async prView(
    ref: number | string,
    opts: { fields?: readonly string[] | undefined } & AsyncCallOptions = {},
  ): Promise<PullRequest | null> {
    return this.exec(v.prView(ref, opts.fields ?? v.PR_VIEW_FIELDS, this.target), opts)
  }

  /** The one PR that `input` names, or null. See `Gh.prFind`. */
  async prFind(
    input: string,
    opts: { fields?: readonly string[] | undefined } & AsyncCallOptions = {},
  ): Promise<PullRequest | null> {
    const ref = parsePrRef(input)
    if (ref === null) return null
    const call = { ...opts, fields: opts.fields ?? v.PR_LIST_FIELDS }
    if (ref.kind === 'url') return this.prView(ref.url, call)
    if (ref.kind === 'branch') return prForBranchOn(this, ref.name, call)
    const client = ref.repo === null ? this : this.withRepo(ownerRepoSlug(ref.repo))
    const pr = await client.prView(ref.number, call)
    return pr !== null || ref.orBranch === null ? pr : prForBranchOn(this, ref.orBranch, call)
  }

  /** The open PR whose head exactly equals `branch`, or null. See `Gh.openPrFor`. */
  async openPrFor(
    branch: string,
    opts: {
      limit?: number | undefined
      fields?: readonly string[] | undefined
    } & AsyncCallOptions = {},
  ): Promise<PullRequest | null> {
    const rows = await this.prList({
      head: branch,
      limit: opts.limit ?? 5,
      fields: opts.fields ?? v.PR_REF_FIELDS,
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
    })
    return v.pickPrForBranch(rows, branch)
  }

  /** {@link prView}, asked again until GitHub has computed the merge state. See `Gh.prViewSettled`. */
  async prViewSettled(
    number: number,
    opts: {
      attempts?: number | undefined
      fields?: readonly string[] | undefined
      sleep?: ((ms: number) => Promise<void>) | undefined
    } & AsyncCallOptions = {},
  ): Promise<PullRequest | null> {
    const attempts = Math.max(1, opts.attempts ?? 3)
    const sleep = opts.sleep ?? sleepAsync
    let last: PullRequest | null = null
    for (let i = 0; i < attempts; i += 1) {
      last = await this.prView(number, opts)
      if (last === null || !v.needsMergeStateRetry(last)) return last
      if (i < attempts - 1) await sleep(MERGE_STATE_RETRY_DELAY_MS)
    }
    return last
  }

  /** A PR's body text. Rejects when gh fails. */
  async prBody(number: number, opts: AsyncCallOptions = {}): Promise<string> {
    return this.read(v.prBody(number, this.target), opts)
  }

  /** A REST GET through `gh api`. Failure is `ok: false`, never a rejection. */
  async api(endpoint: string, opts: ApiOptions & AsyncCallOptions = {}): Promise<ApiResponse> {
    return this.exec(v.api(endpoint, opts, this.target), opts)
  }

  /**
   * A GraphQL query. Resolves to each page's `data`. Rejects on a failed or partial result. See `Gh.graphql`.
   *
   * @experimental
   */
  async graphql(
    query: string,
    variables: Record<string, v.GraphqlVariable> = {},
    opts: v.GraphqlOptions & AsyncCallOptions = {},
  ): Promise<unknown[]> {
    return this.read(v.graphql(query, variables, opts, this.target), opts)
  }

  /** Every label on the repository (up to `opts.limit`, default 1000). Rejects when gh fails. */
  async labelList(
    opts: { limit?: number | undefined } & AsyncCallOptions = {},
  ): Promise<ListResult<Label>> {
    return this.read(v.labelList(opts, this.target), opts)
  }

  /** Issues matching `opts`. Rejects when gh fails. */
  async issueList(opts: IssueListOptions & AsyncCallOptions = {}): Promise<ListResult<IssueRow>> {
    return this.read(v.issueList(opts, this.target), opts)
  }

  /** One issue with its labels, or null when there is no such issue. */
  async issueView(number: number, opts: AsyncCallOptions = {}): Promise<IssueRow | null> {
    return this.exec(v.issueView(number, this.target), opts)
  }

  /**
   * An owner's repositories. Rejects when gh fails. Each row's `owner` is in
   * GitHub's casing, not as passed. See `Gh.repoList`.
   */
  async repoList(
    owner: string,
    opts: v.RepoListOptions & AsyncCallOptions = {},
  ): Promise<ListResult<Repository>> {
    return this.read(v.repoList(owner, opts, this.target), opts)
  }

  /**
   * One repository, or null when there is no such repository. `owner` and
   * `name` are in GitHub's casing, not as passed. See `Gh.repoView`.
   */
  async repoView(
    repo?: string | undefined,
    opts: { fields?: readonly string[] | undefined } & AsyncCallOptions = {},
  ): Promise<Repository | null> {
    return this.exec(v.repoView(repo, opts.fields ?? v.REPO_FIELDS, this.target), opts)
  }

  /** Pull requests across repositories matching a search query. Rejects when gh fails. See `Gh.searchPrs`. */
  async searchPrs(
    query: string,
    opts: v.SearchPrsOptions & AsyncCallOptions = {},
  ): Promise<ListResult<PrSearchHit>> {
    return this.read(v.searchPrs(query, opts, this.target), opts)
  }

  /** True iff the `gh` binary is on PATH and runs. */
  async installed(): Promise<boolean> {
    return this.exec(v.installed())
  }

  /** True iff `gh` holds credentials. */
  async authenticated(): Promise<boolean> {
    return (await this.authStatus()).ok
  }

  /** Login state and what `gh auth status` printed. */
  async authStatus(): Promise<AuthStatus> {
    return this.exec(v.authStatus(this.target))
  }

  /** True iff `gh` is installed and authenticated. Skips the auth check when `gh` is not installed. */
  async ready(): Promise<boolean> {
    return (await this.installed()) && (await this.authenticated())
  }

  /**
   * `{owner, repo}` parsed from the remote URL you pass, or null when it is
   * null or names no project. It starts no process, so it is sync on purpose.
   */
  ownerRepo(remoteUrl: string | null): OwnerRepo | null {
    return remoteUrl === null ? null : parseOwnerRepo(remoteUrl)
  }

  // ── mutations (checked) ───────────────────────────────────────────────────

  /** Open a PR and resolve to its URL ('' if gh printed none). */
  async createPr(opts: v.CreatePrOptions): Promise<string> {
    return this.exec(v.createPr(opts, this.target))
  }

  /** Retitle or rewrite a PR body. */
  async editPr(
    number: number,
    opts: { title?: string | undefined; body?: string | undefined },
  ): Promise<void> {
    return this.exec(v.editPr(number, opts, this.target))
  }

  /** Rewrite just a PR's body. */
  async editPrBody(number: number, body: string): Promise<void> {
    return this.exec(v.editPrBody(number, body, this.target))
  }

  /** The PR's unified diff. Rejects with the classified failure when gh cannot produce it. */
  async prDiff(number: number): Promise<string> {
    return this.exec(v.prDiff(number, this.target))
  }

  /** Post one conversation comment on a PR. Resolves to its URL ('' if gh printed none). */
  async prComment(number: number, body: string): Promise<string> {
    return this.exec(v.prComment(number, body, this.target))
  }

  /**
   * Create a `COMMENT` review with inline comments. Resolves to the review's URL ('' if none came back).
   *
   * @experimental
   */
  async createReview(number: number, opts: v.CreateReviewOptions): Promise<string> {
    return this.exec(v.createReview(number, opts, this.target))
  }

  /** Bring a PR's head branch up to date with its base. */
  async prUpdateBranch(number: number, style: 'merge' | 'rebase' = 'merge'): Promise<void> {
    return this.exec(v.prUpdateBranch(number, style, this.target))
  }

  /** Mark a PR ready for review (`draft: false`) or convert it to a draft (`draft: true`). */
  async prSetDraft(number: number, draft: boolean): Promise<void> {
    return this.exec(v.prSetDraft(number, draft, this.target))
  }

  /**
   * Rewrite one PR conversation comment's body. `commentId` is the numeric REST id. Anything else rejects with `RangeError`.
   *
   * @experimental
   */
  async issueCommentEdit(commentId: string, body: string): Promise<void> {
    return this.exec(v.issueCommentEdit(commentId, body, this.target))
  }

  /** Merge a PR. GitHub refuses when its head is no longer `opts.headSha`. */
  async prMerge(number: number, opts: { method: v.PrMergeMethod; headSha: string }): Promise<void> {
    return this.exec(v.prMerge(number, opts, this.target))
  }

  /** A PR's review threads. Rejects when they could not be read completely. `soft.prReviewThreads` resolves null instead. */
  async prReviewThreads(number: number): Promise<v.ReviewThread[]> {
    return this.read(v.prReviewThreads(number, this.target))
  }

  /** Create a label (or force it to `opts`'s color/description if it exists). */
  async createLabel(opts: v.CreateLabelOptions): Promise<void> {
    return this.exec(v.createLabel(opts, this.target))
  }

  /** Recolor and/or redescribe an existing label. */
  async editLabel(
    name: string,
    opts: { color?: string | undefined; description?: string | undefined },
  ): Promise<void> {
    return this.exec(v.editLabel(name, opts, this.target))
  }

  /** Swap an issue's label in a single `gh issue edit` call. */
  async setIssueLabel(
    number: number,
    currentLabel: string | null,
    newLabel: string,
  ): Promise<void> {
    return this.exec(v.setIssueLabel(number, currentLabel, newLabel, this.target))
  }
}

/** The open PR for `branch`, else its newest closed or merged one. */
async function prForBranchOn(
  gh: AsyncGh,
  branch: string,
  call: { fields: readonly string[] } & AsyncCallOptions,
): Promise<PullRequest | null> {
  const rows = await gh.prList({
    head: branch,
    state: 'all',
    limit: 20,
    fields: v.branchPrFields(call.fields),
    timeoutMs: call.timeoutMs,
    signal: call.signal,
  })
  return v.branchPr(rows)
}

function sleepAsync(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
