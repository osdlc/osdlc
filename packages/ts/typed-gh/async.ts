/**
 * `AsyncGh` — the awaitable GitHub client, with the same methods as {@link Gh}.
 *
 * Same tri-modal contract, promised: queries resolve to parsed values and
 * never reject on a gh failure, mutations reject with `CommandFailed`, and
 * `raw`/`rawChecked` are the hatches. It is driven by the same pure verb
 * table as `Gh`, so the two cannot drift on argv or parsing. Use it where the
 * sync client would block the event loop: a fan-out of per-PR queries.
 */

import {
  runCheckedAsync,
  resolveRunnerAsync,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
  type CommandResult,
} from '@osdlc/command-seam'

import { parseOwnerRepo } from './repo.ts'
import type { IssueRow, Label, OwnerRepo, PullRequest } from './types.ts'
import * as v from './verbs.ts'
import type {
  ApiOptions,
  ApiResponse,
  AuthStatus,
  GhVerb,
  IssueListOptions,
  PrListOptions,
} from './verbs.ts'

/**
 * Per-call options for {@link AsyncGh}. Eleven methods accept them: `raw`, `rawChecked`,
 * `prList`, `prView`, `openPrFor`, `prViewSettled`, `prBody`, `api`, `labelList`,
 * `issueList` and `issueView`.
 */
export interface AsyncCallOptions {
  /**
   * Hard cap on the call. An invalid value rejects, as in command-seam:
   * `RangeError` for 0, a negative value or `NaN`; `TypeError` for a
   * non-number.
   */
  timeoutMs?: number | undefined
  /** Aborts the call; the runner stops the child. */
  signal?: AbortSignal | undefined
}

/** How long to wait between merge-state retries, in milliseconds. */
const MERGE_STATE_RETRY_DELAY_MS = 1_500

/** A typed, awaitable gh client bound to one working directory. */
export class AsyncGh {
  readonly cwd: string
  private readonly runner: AsyncCommandRunner

  constructor(cwd: string, opts: { runner?: AsyncCommandRunner | undefined } = {}) {
    this.cwd = cwd
    this.runner = resolveRunnerAsync('gh', opts.runner)
  }

  /** The same client rooted at a different directory (same runner). */
  at(cwd: string): AsyncGh {
    return new AsyncGh(cwd, { runner: this.runner })
  }

  // ── escape hatches ────────────────────────────────────────────────────────

  /** Unchecked passthrough for verbs not yet lifted into the API. */
  raw(argv: string[], opts: AsyncCallOptions = {}): Promise<CommandResult> {
    return this.runner.run(argv, { cwd: this.cwd, ...opts })
  }

  /** Checked passthrough — rejects with `CommandFailed` on a non-zero exit. */
  rawChecked(argv: string[], opts: AsyncCallOptions = {}): Promise<CommandResult> {
    return runCheckedAsync(this.runner, argv, { cwd: this.cwd, ...opts })
  }

  /** Run one verb from the table, honouring its checked/unchecked contract. */
  private async exec<T>(verb: GhVerb<T>, call: AsyncCallOptions = {}): Promise<T> {
    const opts: AsyncCommandRunOptions = { cwd: this.cwd }
    if (verb.input !== undefined) opts.input = verb.input
    if (call.timeoutMs !== undefined) opts.timeoutMs = call.timeoutMs
    if (call.signal !== undefined) opts.signal = call.signal
    const result = verb.checked
      ? await runCheckedAsync(this.runner, verb.argv, opts)
      : await this.runner.run(verb.argv, opts)
    return verb.parse(result)
  }

  // ── queries ───────────────────────────────────────────────────────────────

  /** Pull requests matching `opts`, or null when gh failed. */
  prList(opts: PrListOptions & AsyncCallOptions = {}): Promise<PullRequest[] | null> {
    return this.exec(v.prList(opts), opts)
  }

  /** One PR with the heavy fields, or null when gh failed. */
  prView(
    number: number,
    opts: { fields?: readonly string[] | undefined } & AsyncCallOptions = {},
  ): Promise<PullRequest | null> {
    return this.exec(v.prView(number, opts.fields ?? v.PR_VIEW_FIELDS), opts)
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

  /** {@link prView}, re-asked until GitHub settles the merge state. See `Gh.prViewSettled`. */
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

  /** A PR's body text, or null when gh failed. */
  prBody(number: number, opts: AsyncCallOptions = {}): Promise<string | null> {
    return this.exec(v.prBody(number), opts)
  }

  /** A REST GET through `gh api`; failure is `ok: false`, never a rejection. */
  api(endpoint: string, opts: ApiOptions & AsyncCallOptions = {}): Promise<ApiResponse> {
    return this.exec(v.api(endpoint, opts), opts)
  }

  /** Every label on the repository (up to `opts.limit`, default 1000), or null when gh failed. */
  labelList(opts: { limit?: number | undefined } & AsyncCallOptions = {}): Promise<Label[] | null> {
    return this.exec(v.labelList(opts), opts)
  }

  /** Issues matching `opts`, or null when gh failed. */
  issueList(opts: IssueListOptions & AsyncCallOptions = {}): Promise<IssueRow[] | null> {
    return this.exec(v.issueList(opts), opts)
  }

  /** One issue with its labels, or null when gh failed. */
  issueView(number: number, opts: AsyncCallOptions = {}): Promise<IssueRow | null> {
    return this.exec(v.issueView(number), opts)
  }

  /** True iff the `gh` binary is on PATH and runs. */
  installed(): Promise<boolean> {
    return this.exec(v.installed())
  }

  /** True iff `gh` holds credentials. */
  async authenticated(): Promise<boolean> {
    return (await this.authStatus()).ok
  }

  /** Login state and what `gh auth status` printed. */
  authStatus(): Promise<AuthStatus> {
    return this.exec(v.authStatus())
  }

  /** True iff `gh` is installed AND authenticated; short-circuits. */
  async ready(): Promise<boolean> {
    return (await this.installed()) && (await this.authenticated())
  }

  /**
   * `{owner, repo}` parsed from the remote URL you pass, or null when it is
   * null or names no project. Pure, so it is sync on purpose.
   */
  ownerRepo(remoteUrl: string | null): OwnerRepo | null {
    return remoteUrl === null ? null : parseOwnerRepo(remoteUrl)
  }

  // ── mutations (checked) ───────────────────────────────────────────────────

  /** Open a PR and resolve to its URL ('' if gh printed none). */
  createPr(opts: v.CreatePrOptions): Promise<string> {
    return this.exec(v.createPr(opts))
  }

  /** Retitle or rewrite a PR body. */
  editPr(
    number: number,
    opts: { title?: string | undefined; body?: string | undefined },
  ): Promise<void> {
    return this.exec(v.editPr(number, opts))
  }

  /** Rewrite just a PR's body. */
  editPrBody(number: number, body: string): Promise<void> {
    return this.exec(v.editPrBody(number, body))
  }

  /** The PR's unified diff; rejects with `CommandFailed` when gh cannot produce it. */
  prDiff(number: number): Promise<string> {
    return this.exec(v.prDiff(number))
  }

  /** Post one conversation comment on a PR; resolves to its URL ('' if gh printed none). */
  prComment(number: number, body: string): Promise<string> {
    return this.exec(v.prComment(number, body))
  }

  /**
   * Create a `COMMENT` review with inline comments; resolves to the review's URL ('' if none came back).
   *
   * @experimental
   */
  createReview(number: number, opts: v.CreateReviewOptions): Promise<string> {
    return this.exec(v.createReview(number, opts))
  }

  /** Bring a PR's head branch up to date with its base. */
  prUpdateBranch(number: number, style: 'merge' | 'rebase' = 'merge'): Promise<void> {
    return this.exec(v.prUpdateBranch(number, style))
  }

  /** Mark a PR ready for review (`draft: false`) or convert it to a draft (`draft: true`). */
  prSetDraft(number: number, draft: boolean): Promise<void> {
    return this.exec(v.prSetDraft(number, draft))
  }

  /**
   * Rewrite one PR conversation comment's body. `commentId` is the numeric REST id; anything else rejects with `RangeError`.
   *
   * @experimental
   */
  async issueCommentEdit(commentId: string, body: string): Promise<void> {
    // async, so a bad id rejects the Promise instead of throwing at the call.
    return this.exec(v.issueCommentEdit(commentId, body))
  }

  /** Merge a PR; GitHub refuses when its head is no longer `opts.headSha`. */
  prMerge(number: number, opts: { method: v.PrMergeMethod; headSha: string }): Promise<void> {
    return this.exec(v.prMerge(number, opts))
  }

  /** A PR's review threads, or null when they could not be read completely. */
  prReviewThreads(number: number): Promise<v.ReviewThread[] | null> {
    return this.exec(v.prReviewThreads(number))
  }

  /** Create a label (or force it to `opts`'s color/description if it exists). */
  createLabel(opts: v.CreateLabelOptions): Promise<void> {
    return this.exec(v.createLabel(opts))
  }

  /** Recolor and/or redescribe an existing label. */
  editLabel(
    name: string,
    opts: { color?: string | undefined; description?: string | undefined },
  ): Promise<void> {
    return this.exec(v.editLabel(name, opts))
  }

  /** Swap an issue's label in a single `gh issue edit` call. */
  setIssueLabel(number: number, currentLabel: string | null, newLabel: string): Promise<void> {
    return this.exec(v.setIssueLabel(number, currentLabel, newLabel))
  }
}

function sleepAsync(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
