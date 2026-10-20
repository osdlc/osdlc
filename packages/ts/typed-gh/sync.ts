/**
 * `Gh` — the synchronous GitHub client, the companion of `@osdlc/typed-git`'s
 * `Git`, bound to one working directory and one {@link CommandRunner}.
 *
 * Authentication is `gh`'s, not ours: no token is read, stored, or passed.
 * That is the whole reason this shells out to the CLI instead of speaking
 * REST — the credential already exists in the user's keychain, and a library
 * that reaches for `GITHUB_TOKEN` is a library that can leak one.
 *
 * Tri-modal, same as the git client: queries return parsed values and never
 * throw, mutations throw `CommandFailed`, and `raw`/`rawChecked` are the
 * escape hatches.
 */

import {
  runChecked,
  resolveRunner,
  spawnRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '@osdlc/command-seam'

import * as v from './verbs.ts'
import type {
  ApiOptions,
  ApiResponse,
  AuthStatus,
  GhVerb,
  IssueListOptions,
  PrListOptions,
} from './verbs.ts'
import { parseOwnerRepo } from './repo.ts'
import type { IssueRow, Label, OwnerRepo, PullRequest } from './types.ts'

/**
 * Factory of per-binary runners — the injectable subprocess seam a CLI tail
 * threads through its call graph. Production uses `spawnRunner`; tests supply
 * a recording factory so a whole tail runs offline.
 */
export type RunnerFactory = (binary: string) => CommandRunner

/** Default factory: real, spawnSync-backed runners. */
export const defaultRunnerFactory: RunnerFactory = spawnRunner

/** How long to wait between merge-state retries, in milliseconds. */
const MERGE_STATE_RETRY_DELAY_MS = 1_500

/**
 * A typed gh client bound to one working directory.
 *
 * Every `timeoutMs` option is a hard cap on the call. An invalid value
 * throws, as in command-seam: `RangeError` for 0, a negative value or `NaN`;
 * `TypeError` for a non-number.
 */
export class Gh {
  readonly cwd: string
  private readonly runner: CommandRunner

  constructor(cwd: string, opts: { runner?: CommandRunner | undefined } = {}) {
    this.cwd = cwd
    this.runner = resolveRunner('gh', opts.runner)
  }

  /** The same client rooted at a different directory (same runner). */
  at(cwd: string): Gh {
    return new Gh(cwd, { runner: this.runner })
  }

  // ── escape hatches ────────────────────────────────────────────────────────

  /** Unchecked passthrough for verbs not yet lifted into the API. */
  raw(argv: string[], opts: { timeoutMs?: number | undefined } = {}): CommandResult {
    return this.runner.run(argv, { cwd: this.cwd, ...opts })
  }

  /** Checked passthrough — throws `CommandFailed` on a non-zero exit. */
  rawChecked(argv: string[], opts: { timeoutMs?: number | undefined } = {}): CommandResult {
    return runChecked(this.runner, argv, { cwd: this.cwd, ...opts })
  }

  /** Run one verb from the table, honouring its checked/unchecked contract. */
  private exec<T>(verb: GhVerb<T>, timeoutMs?: number | undefined): T {
    const opts: CommandRunOptions = { cwd: this.cwd }
    if (verb.input !== undefined) opts.input = verb.input
    if (timeoutMs !== undefined) opts.timeoutMs = timeoutMs
    const result = verb.checked
      ? runChecked(this.runner, verb.argv, opts)
      : this.runner.run(verb.argv, opts)
    return verb.parse(result)
  }

  // ── queries ───────────────────────────────────────────────────────────────

  /** Pull requests matching `opts`, or null when gh failed. */
  prList(opts: PrListOptions & { timeoutMs?: number | undefined } = {}): PullRequest[] | null {
    return this.exec(v.prList(opts), opts.timeoutMs)
  }

  /** One PR with the heavy fields, or null when gh failed. */
  prView(
    number: number,
    opts: { fields?: readonly string[] | undefined; timeoutMs?: number | undefined } = {},
  ): PullRequest | null {
    return this.exec(v.prView(number, opts.fields ?? v.PR_VIEW_FIELDS), opts.timeoutMs)
  }

  /**
   * The open PR whose head exactly equals `branch`, or null.
   *
   * Defaults to {@link PR_REF_FIELDS}: identifying a PR must not cost a
   * merge-state computation. Pass `opts.fields` to ask for more (e.g.
   * `isDraft`) in the SAME call, when a caller needs a field beyond identity
   * before deciding whether to act on the PR at all — asking `prList`/`prView`
   * separately would cost a second round trip for the common case where the
   * caller already knows it wants that field up front.
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
    return v.pickPrForBranch(rows, branch)
  }

  /**
   * {@link prView}, re-asked until GitHub settles the merge state.
   *
   * GitHub computes mergeability lazily: the first query kicks it off and
   * answers `UNKNOWN` while it runs. A caller that believes that first answer
   * mis-triages every PR that is merely slow to compute, so this re-asks
   * `attempts` times before returning what it has. The last answer is
   * returned whether or not it settled — `UNKNOWN` is a legitimate final
   * verdict and callers must still handle it.
   *
   * `sleep` is injected so a test does not spend real seconds waiting.
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

  /** A PR's body text, or null when gh failed. */
  prBody(number: number, opts: { timeoutMs?: number | undefined } = {}): string | null {
    return this.exec(v.prBody(number), opts.timeoutMs)
  }

  /**
   * A REST GET through `gh api`. Never throws: failure is `ok: false` on the
   * returned {@link ApiResponse}.
   */
  api(endpoint: string, opts: ApiOptions & { timeoutMs?: number | undefined } = {}): ApiResponse {
    return this.exec(v.api(endpoint, opts), opts.timeoutMs)
  }

  /** Every label on the repository (up to `opts.limit`, default 1000), or null when gh failed. */
  labelList(
    opts: { limit?: number | undefined; timeoutMs?: number | undefined } = {},
  ): Label[] | null {
    return this.exec(v.labelList(opts), opts.timeoutMs)
  }

  /** Issues matching `opts` (open by default, up to 200), or null when gh failed. */
  issueList(opts: IssueListOptions & { timeoutMs?: number | undefined } = {}): IssueRow[] | null {
    return this.exec(v.issueList(opts), opts.timeoutMs)
  }

  /** One issue with its labels, or null when gh failed. */
  issueView(number: number, opts: { timeoutMs?: number | undefined } = {}): IssueRow | null {
    return this.exec(v.issueView(number), opts.timeoutMs)
  }

  /** True iff the `gh` binary is on PATH and runs. */
  installed(): boolean {
    return this.exec(v.installed())
  }

  /**
   * True iff `gh` holds credentials. Asked on its own only by a caller that
   * reports the two halves separately — "gh is missing" and "gh is not logged
   * in" are different things to tell a person, and a report that collapses
   * them sends someone to install software they already have.
   */
  authenticated(): boolean {
    return this.authStatus().ok
  }

  /** Login state and what `gh auth status` printed; `authenticated()` is its `ok`. */
  authStatus(): AuthStatus {
    return this.exec(v.authStatus())
  }

  /**
   * True iff `gh` is installed AND authenticated — the two-step probe.
   *
   * Short-circuits: an absent binary cannot be asked about credentials.
   */
  ready(): boolean {
    return this.installed() && this.authenticated()
  }

  /**
   * `{owner, repo}` parsed from the remote URL you pass, or null when it is
   * null or names no project.
   *
   * Pure: it reads no git config, starts no process and does not ask GitHub.
   */
  ownerRepo(remoteUrl: string | null): OwnerRepo | null {
    return remoteUrl === null ? null : parseOwnerRepo(remoteUrl)
  }

  // ── mutations (checked) ───────────────────────────────────────────────────

  /** Open a PR and return its URL ('' if gh printed none). */
  createPr(opts: v.CreatePrOptions): string {
    return this.exec(v.createPr(opts))
  }

  /** Retitle or rewrite a PR body. */
  editPr(number: number, opts: { title?: string | undefined; body?: string | undefined }): void {
    this.exec(v.editPr(number, opts))
  }

  /** The PR's unified diff; throws `CommandFailed` when gh cannot produce it. */
  prDiff(number: number): string {
    return this.exec(v.prDiff(number))
  }

  /** Post one conversation comment on a PR; returns its URL ('' if gh printed none). */
  prComment(number: number, body: string): string {
    return this.exec(v.prComment(number, body))
  }

  /**
   * Create a `COMMENT` review with inline comments; returns the review's URL ('' if none came back).
   *
   * @experimental
   */
  createReview(number: number, opts: v.CreateReviewOptions): string {
    return this.exec(v.createReview(number, opts))
  }

  /** Rewrite just a PR's body. */
  editPrBody(number: number, body: string): void {
    this.exec(v.editPrBody(number, body))
  }

  /** Bring a PR's head branch up to date with its base. */
  prUpdateBranch(number: number, style: 'merge' | 'rebase' = 'merge'): void {
    this.exec(v.prUpdateBranch(number, style))
  }

  /** Mark a PR ready for review (`draft: false`) or convert it to a draft (`draft: true`). */
  prSetDraft(number: number, draft: boolean): void {
    this.exec(v.prSetDraft(number, draft))
  }

  /**
   * Rewrite one PR conversation comment's body. `commentId` is the numeric REST id; anything else throws `RangeError`.
   *
   * @experimental
   */
  issueCommentEdit(commentId: string, body: string): void {
    this.exec(v.issueCommentEdit(commentId, body))
  }

  /** Merge a PR; GitHub refuses when its head is no longer `opts.headSha`. */
  prMerge(number: number, opts: { method: v.PrMergeMethod; headSha: string }): void {
    this.exec(v.prMerge(number, opts))
  }

  /** A PR's review threads, or null when they could not be read completely. */
  prReviewThreads(number: number): v.ReviewThread[] | null {
    return this.exec(v.prReviewThreads(number))
  }

  /** Create a label (or force it to `opts`'s color/description if it already exists). */
  createLabel(opts: v.CreateLabelOptions): void {
    this.exec(v.createLabel(opts))
  }

  /** Recolor and/or redescribe an existing label. */
  editLabel(
    name: string,
    opts: { color?: string | undefined; description?: string | undefined },
  ): void {
    this.exec(v.editLabel(name, opts))
  }

  /**
   * Swap an issue's label: remove `currentLabel` (when given) and add
   * `newLabel`, in a single `gh issue edit` call — never a briefly-unlabeled
   * or briefly-double-labeled intermediate state.
   */
  setIssueLabel(number: number, currentLabel: string | null, newLabel: string): void {
    this.exec(v.setIssueLabel(number, currentLabel, newLabel))
  }
}

/**
 * Block the calling thread. Crude on purpose: the synchronous client has no
 * event loop to await on, and the alternative — making every caller async to
 * accommodate one retry delay — colors the whole call graph.
 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
