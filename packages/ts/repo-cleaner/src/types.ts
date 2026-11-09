/**
 * The inventory a sweep produces, and the vocabulary it is described in.
 *
 * A sweep returns rows. Each row is one thing that could be deleted — a
 * worktree, a local branch, a remote branch — with the sweep's verdict on it,
 * the action that would delete it, the risks that action carries, and the
 * evidence behind it all. A host that knows more than git does rewrites rows
 * through the `annotate` hook rather than reaching into classification.
 */

import type { LandingCheck } from './landing.ts'
import type { Plan } from './plan.ts'
import type { ProcessHolder } from './processes.ts'
import type { ProviderStatus } from './providers/types.ts'

/** The kinds of row, in the order a run acts on them. */
export const KINDS = ['worktree', 'branch', 'remote'] as const

/** A worktree, a local branch, or a branch on a remote. */
export type Kind = (typeof KINDS)[number]

/**
 * A row's name with its kind in front: `worktree:<path>`, `branch:<name>`,
 * `remote:<remote>/<name>`. Unique within a repository.
 */
export type RowId = `${Kind}:${string}`

/** The row id of `name` in `kind`. */
export function rowId(kind: Kind, name: string): RowId {
  return `${kind}:${name}`
}

/**
 * `<kind>:<name>` split, or null when `text` has no kind in front. A
 * one-letter prefix is a Windows drive (`C:\\…`), not a kind.
 */
export function parseRowId(text: string): { kind: Kind; name: string } | null {
  const colon = text.indexOf(':')
  if (colon <= 1) return null
  const kind = text.slice(0, colon)
  if (!(KINDS as readonly string[]).includes(kind)) return null
  return { kind: kind as Kind, name: text.slice(colon + 1) }
}

/**
 * What the sweep concluded about a row.
 *
 *   `delete`   its work is on the default branch, or it is otherwise safe to lose
 *   `review`   the signals are mixed, or it holds work; deleted only when picked
 *   `keep`     structural (the default branch, the current checkout), or in use
 *              (an open pull request); a kept row with an action is deleted only
 *              when picked
 *   `blocked`  something rules removal out; never deleted, whatever is granted
 */
export const VERDICTS = ['delete', 'review', 'keep', 'blocked'] as const

export type Verdict = (typeof VERDICTS)[number]

/**
 * What deleting a row does: `remove` a worktree, `prune` the stale record of
 * a worktree whose directory is gone, `delete` a branch. Null on a row that
 * can never be deleted.
 */
export const ACTIONS = ['remove', 'prune', 'delete'] as const

export type Action = (typeof ACTIONS)[number]

/**
 * A risk an action carries, which a person approves by name:
 *   `abandon-unmerged`  drops commits not on the default branch, or a worktree's
 *                       (or its submodules') commits and stashes no remote has
 *   `discard-changes`   drops modified, staged or untracked files in a worktree
 *                       or any of its submodules
 *   `confirm-open-pr`   the branch has an open pull request, or open pull
 *                       requests could not be checked (the CLI is missing or
 *                       signed out, or the listing failed) so one cannot be
 *                       ruled out; deleting the remote branch closes it
 */
export const RISKS = ['abandon-unmerged', 'discard-changes', 'confirm-open-pr'] as const

export type Risk = (typeof RISKS)[number]

/** The risks whose flag is set, in canonical order. */
export function risksFor(flags: Partial<Record<Risk, boolean>>): Risk[] {
  return RISKS.filter((name) => flags[name] === true)
}

/** A condition that rules out removing a worktree, whatever is granted. */
export type Blocker =
  | 'locked-worktree'
  | 'live-process'
  | 'process-probe-failed'
  | 'hidden-index-flags'
  | 'nested-repository'
  | 'branch-in-other-worktree'
  | 'submodule-unreadable'

/** Why a merged PR does not prove that a tip landed. */
export type PrEvidenceGap = 'other-base' | 'head-moved'

/** A pull request, reduced to what classification consults. */
export interface PRInfo {
  number: number
  state: string
  mergedAt: string | null
  headRef: string
  /** The PR's head commit; null when the provider did not report one. */
  headOid: string | null
  /** The branch the PR targets. */
  baseRef: string
  title: string
  url: string
}

/** A row's pull request, as evidence: the PR without its head branch, which the row names already. */
export type PrEvidence = Omit<PRInfo, 'headRef'> & {
  /** For a merged PR: `exact-head` when it proves the tip landed, otherwise the gap. */
  proof?: 'exact-head' | PrEvidenceGap
}

/** Evidence every kind of row records about whether its work landed. */
export interface LandingEvidence {
  pr?: PrEvidence
  /** The work is on the default branch: by ancestry, an exact-head merged PR, or a patch match. Absent on a row not judged. */
  merged?: boolean
  /** Commits not on the default branch; null when they could not be counted. */
  uniqueCommits?: number | null
  /** Set when the work landed under other commit ids. */
  landing?: 'patch-equivalent'
  /** Which patch check passed. */
  landingCheck?: LandingCheck
  /** True when `git merge-tree` agreed the content is on the default branch. */
  landingContentConfirmed?: boolean
  /** Commits of a partly landed branch that have no patch-equivalent commit. */
  unmatchedCommits?: string[]
}

/** How a branch shows it was worked on, for a worktree merged by ancestry alone. */
export type BranchUse = 'commits' | 'upstream'

/** One submodule of a worktree, as evidence. */
export interface SubmoduleEvidence {
  path: string
  populated: boolean
  head: string | null
  recorded: string | null
  dirtyFiles: number
  unpushedCommits: number
  stashes: number
  error?: string
}

export interface WorktreeEvidence extends LandingEvidence {
  path: string
  branch: string | null
  head: string | null
  bare: boolean
  detached: boolean
  primary: boolean
  /** The directory is there and is still a checkout. */
  onDisk?: boolean
  /** The directory is there but is no longer a checkout (its `.git` is gone). */
  directoryLeft?: boolean
  dirtyFiles?: number
  unpushedCommits?: number
  /** What `unpushedCommits` was counted against: the upstream, or the default branch. */
  compareAgainst?: string
  branchExists?: boolean
  /** Set for a worktree merged by ancestry alone; null when its branch looks freshly made. */
  branchUsed?: BranchUse | null
  lockReason?: string | null
  /** The lock's owner is dead, so the lock is cleared before the remove. */
  staleLock?: boolean
  lockOwner?: { pid: number; startedAt: string | null }
  liveProcesses?: ProcessHolder[]
  idleShells?: ProcessHolder[]
  processProbeError?: string
  /** Count of skip-worktree and assume-unchanged files. */
  hiddenIndexFlags?: number
  /** The first ten of them. */
  hiddenIndexPaths?: string[]
  nestedRepositories?: string[]
  otherWorktrees?: string[]
  submodules?: SubmoduleEvidence[]
  submoduleDirtyFiles?: number
  /** Its submodules make plain `git worktree remove` refuse, so the remove is forced. */
  forcedForSubmodules?: boolean
}

export interface BranchEvidence extends LandingEvidence {
  branch: string
  upstream: string | null
  track: string | null
  lastCommit: string
  sha: string
  compareAgainst?: string
  /** Null when the remote default branch was not found. */
  ancestorOfRemoteMain?: boolean | null
  /** The worktree whose removal frees this branch; it is deleted only when that worktree goes in the same run. */
  worktree?: string
}

export interface RemoteEvidence extends LandingEvidence {
  branch: string
  remote: string
  sha: string
  /** A local branch has the same name. */
  hasLocal: boolean
  ancestorOfRemoteMain?: boolean
}

interface RowCommon {
  id: RowId
  /** The row's name within its kind: a worktree's path, a branch name, `<remote>/<branch>`. */
  name: string
  verdict: Verdict
  /** What deleting it does; null when it can never be deleted. */
  action: Action | null
  /** One line, already phrased for a report. */
  why: string
  /** What its action would lose, which a person must allow by name. */
  risks: Risk[]
  /** Non-empty exactly when `verdict` is `blocked`. */
  blockers: Blocker[]
  /** The literal commands that would carry out `action`. Never run by the sweep. */
  commands: string[]
  /**
   * Sentences on what is unclear or what to do about a blocker. A list, so a
   * host appends its own before anything is rendered.
   */
  notes: string[]
}

export interface WorktreeRow extends RowCommon {
  kind: 'worktree'
  evidence: WorktreeEvidence
}

export interface BranchRow extends RowCommon {
  kind: 'branch'
  evidence: BranchEvidence
}

export interface RemoteRow extends RowCommon {
  kind: 'remote'
  evidence: RemoteEvidence
}

/** One thing that could be deleted, and the sweep's verdict on it. */
export type Row = WorktreeRow | BranchRow | RemoteRow

/** A row whose deletion only prunes a stale worktree record. */
export function isPrune(row: Pick<Row, 'verdict' | 'action'>): boolean {
  return row.verdict === 'delete' && row.action === 'prune'
}

type Defaulted = 'commands' | 'notes' | 'risks' | 'blockers'

/** The fields a classifier supplies for a row of type `R`; kind, name and evidence it fixes once. */
export type RowFields<R extends Row> = Omit<R, Defaulted | 'id' | 'kind' | 'name' | 'evidence'> &
  Partial<Pick<R, Defaulted>>

/** Build a row, defaulting its lists to empty. */
export function makeRow<R extends Row>(
  partial: Omit<R, Defaulted | 'id'> & Partial<Pick<R, Defaulted>>,
): R {
  return {
    ...partial,
    id: rowId(partial.kind, partial.name),
    commands: partial.commands ?? [],
    notes: partial.notes ?? [],
    risks: partial.risks ?? [],
    blockers: partial.blockers ?? [],
  } as R
}

/** What the sweep learned about a repository before inventorying it. */
export interface RepoInfo {
  /** The main checkout's root, even when the sweep was pointed at a worktree. */
  root: string
  /**
   * `owner/name` for a github.com remote, `host/owner/name` for one on another
   * host, or null when the remote names no repository.
   */
  slug: string | null
  mainBranch: string
  remote: string | null
  currentBranch: string
  /**
   * The provider asked for pull requests and what its probe found. Null when
   * none was asked (`provider: 'none'`, or a sweep without remote branches).
   */
  provider: ProviderStatus | null
  /** True when the sweep fetched the remote before classifying. */
  fetched: boolean
}

/** The ref a branch must reach to count as landed: `<remote>/<default>`, or the local default without a remote. */
export function landedRef(repo: RepoInfo): string {
  return repo.remote === null ? repo.mainBranch : `${repo.remote}/${repo.mainBranch}`
}

/** True when the repository has a remote the sweep did not fetch, so its refs may be stale. */
export function isUnfetched(repo: RepoInfo): boolean {
  return repo.remote !== null && !repo.fetched
}

/** Rows of one kind, counted by what the sweep concluded. */
export interface Bucket {
  total: number
  /** Rows whose work is on the default branch. Rows kept for structure are not judged. */
  merged: number
  /** `delete` rows that delete something. */
  delete: number
  /** `delete` rows that only prune a stale worktree record. */
  prune: number
  review: number
  blocked: number
  keep: number
}

export type Counts = Record<Kind, Bucket>

export function emptyBucket(): Bucket {
  return { total: 0, merged: 0, delete: 0, prune: 0, review: 0, blocked: 0, keep: 0 }
}

/** Per-kind counts over `rows`, every kind present. */
export function countRows(rows: readonly Row[]): Counts {
  const out = Object.fromEntries(KINDS.map((k) => [k, emptyBucket()])) as Counts
  for (const row of rows) {
    const bucket = out[row.kind]
    bucket.total += 1
    if (row.evidence.merged === true) bucket.merged += 1
    if (isPrune(row)) bucket.prune += 1
    else bucket[row.verdict] += 1
  }
  return out
}

/** `counts` summed across kinds. */
export function totalOf(counts: Counts): Bucket {
  const out = emptyBucket()
  for (const kind of KINDS) {
    for (const key of Object.keys(out) as (keyof Bucket)[]) out[key] += counts[kind][key]
  }
  return out
}

/** One repository's rows, or the reason there are none. */
export interface RepoSweep {
  /** The path the sweep was pointed at, whether or not it could be read. */
  path: string
  /** Present when the repository could be read. */
  repo: RepoInfo | null
  rows: Row[]
  counts: Counts
  /**
   * What the sweep could not look up for this repository and judged without,
   * one sentence each: a remote branch listing or a pull request listing that
   * failed, a pull request lookup the provider's CLI could not make (missing
   * or signed out), or, offline, a remote with no tracking refs on disk. The
   * rows stand on the evidence that was left.
   * Empty when nothing was missing.
   */
  notes: string[]
  /** Why this repository produced no rows. Null on success. */
  error: string | null
}

/** One of a repository's `notes`, with the repository's root. */
export interface RepoNote {
  repo: string
  note: string
}

/** Every repository's `notes` in `sweep`, each with its repository. */
export function sweepNotes(sweep: Pick<Sweep, 'repos'>): RepoNote[] {
  return sweep.repos.flatMap((r) => r.notes.map((note) => ({ repo: r.repo?.root ?? r.path, note })))
}

/** A target that named no repository. */
export interface UnresolvedEntry {
  entry: string
  reason: string
}

/**
 * What resolving the targets cost. A target that is itself a checkout costs
 * nothing to find; a directory is walked, and a person who points one at the
 * wrong place deserves to be told how much was read.
 */
export interface ScanStats {
  /** Targets that had to be searched, rather than naming a checkout outright. */
  containers: number
  /** Directories read across those searches. */
  directoriesScanned: number
  /** Directories left unopened because the depth cap stopped the walk. */
  depthLimited: number
  /** Checkouts found by those searches, worktrees included, before de-duplication. */
  checkoutsFound: number
}

/** One remote checked out as two or more separate main checkouts. */
export interface DuplicateCheckout {
  slug: string
  /** Main-checkout paths, sorted. */
  roots: string[]
}

/** The options a sweep ran with, as a plan records them so a re-check runs the same sweep. */
export type SweptWith = Plan['options']

/** Every repository swept in one run, plus the targets that named none. */
export interface Sweep {
  repos: RepoSweep[]
  unresolved: UnresolvedEntry[]
  scan: ScanStats
  duplicates: DuplicateCheckout[]
  /** Every repository's counts, summed per kind. */
  counts: Counts
  /** What was swept, for a plan. */
  options: SweptWith
}

/**
 * Slugs shared by two or more of `repos`, roots sorted. A null entry or a
 * repository without a slug is left out.
 */
export function findDuplicateCheckouts(
  repos: readonly ({ root: string; slug: string | null } | null)[],
): DuplicateCheckout[] {
  const bySlug = new Map<string, Set<string>>()
  for (const repo of repos) {
    if (repo?.slug == null) continue
    const roots = bySlug.get(repo.slug) ?? new Set<string>()
    roots.add(repo.root)
    bySlug.set(repo.slug, roots)
  }
  return [...bySlug]
    .filter(([, roots]) => roots.size > 1)
    .map(([slug, roots]) => ({ slug, roots: [...roots].sort() }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

export function emptyScan(): ScanStats {
  return { containers: 0, directoriesScanned: 0, depthLimited: 0, checkoutsFound: 0 }
}

/**
 * What a sweep is doing, for a status line. `repo` is the path being swept;
 * `index` and `of` place it among the run's repositories. `done` and `total`
 * count rows within a step that walks many.
 */
export interface SweepProgress {
  repo: string
  index: number
  of: number
  step: 'discover' | 'fetch' | 'prs' | Kind
  done?: number
  total?: number
  /** The CLI asked during the `prs` step: `gh`, `glab`. */
  tool?: string
}

/**
 * Why the library refused. Nothing has been touched when it throws.
 *
 *   `conflict`        options that contradict each other, or one that would have no effect
 *   `bad-input`       a malformed row id or an unknown risk
 *   `not-found`       a picked, spared or allowed row the plan does not have
 *   `ambiguous`       a row id that matches rows in more than one repository
 *   `spared-changed`  a spared remote branch is gone or moved since the plan
 *   `bad-plan`        a plan that cannot be read, or one from another plan version
 */
export type ErrorCode =
  'conflict' | 'bad-input' | 'not-found' | 'ambiguous' | 'spared-changed' | 'bad-plan'

export class RepoCleanerError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'RepoCleanerError'
    this.code = code
  }
}
