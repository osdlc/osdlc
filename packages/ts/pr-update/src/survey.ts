/**
 * `pr-update survey`: every open PR's drift from its base, the stack it is in,
 * and how it would be brought up to date.
 *
 * Read-only: it fetches, then reads. No checkout, no worktree, no index, and
 * nothing is pushed. `pr-update update` acts on this.
 *
 * It knows three things that a per-PR check cannot.
 *
 * Drift is measured locally. GitHub reports `mergeStateStatus: BEHIND` only
 * when branch protection requires an up-to-date branch. Without that rule the
 * field says nothing, however far a branch has drifted. So the count of
 * commits behind comes from `rev-list --left-right --count` over the
 * remote-tracking refs.
 *
 * Being out of date passes down a stack. When PR A targets PR B's head branch,
 * A is stacked on B. Updating A before B is wasted work, because A's base is
 * about to move. A PR can be zero commits behind and still be blocked, so the
 * survey builds the stack graph, sorts it parent first, and marks a child
 * `blocked` on the nearest ancestor that is itself behind.
 *
 * A rebase is not always safe. Each row carries the strategy it would be
 * updated with and the rule that chose it, so the plan can be checked before
 * anything runs. See `./strategy.ts` for why the unpushed-work guard comes
 * before everything else.
 *
 * Conflicts are predicted with `merge-tree`, which merges in the object
 * database and never touches a working tree. That is what makes a survey of
 * every PR cheap. The alternative is a full checkout per PR, and most of them
 * merge cleanly. A conflict prediction also carries `conflictBaseSha`, the sha
 * the base ref pointed at when it was measured. A caller can use it to tell
 * whether the prediction is still current.
 *
 * A scoped run measures only what it needs. `--pr` (or `--branch`) names the
 * PRs a caller cares about. Only those PRs and their stack parents are fetched
 * and run through `merge-tree`, because a host that updates one PR at a time
 * cannot afford a fifty-PR survey per call. The code host is still listed
 * once, since the stack graph, and so the blocked-parent check, comes from the
 * whole listing.
 *
 * Scope defaults come from `PrUpdateConfig`, and every key there has a
 * default, so the command works with no config. Flags override config, and
 * config overrides the built-in defaults.
 */

import { z } from 'zod'

import {
  Git,
  parseRemoteRepo,
  readRemote,
  type RemoteRepo,
  type SshAliasResolver,
  type Worktree,
} from '@osdlc/typed-git'

import {
  codeHostNameForRemote,
  type CodeHost,
  type CodeHostName,
  type CodeHostPrDetail,
} from '@osdlc/code-host'
import type { CommandRunner } from '@osdlc/command-seam'
import { parseRepoTarget } from '@osdlc/ecosystem/repositories'
import { FailureError, type Failure } from '@osdlc/result'
import { parseTrustRepo } from '@osdlc/trust-repo'
import { githubCodeHostFor, type CodeHostTarget } from './code-host.ts'
import { chooseStrategy, type Strategy } from './strategy.ts'
import { targetGitOptions } from './update/execute.ts'
import type { PrUpdateConfig } from './config.ts'
import type { CheckoutSource, FoundCheckout, Ports } from './ports.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where a PR stands relative to its base, and to its stack. Declared once so
 *  the `status` zod enum below always matches this type. */
const SURVEY_STATUSES = ['up-to-date', 'behind', 'blocked', 'unknown'] as const
export type SurveyStatus = (typeof SURVEY_STATUSES)[number]

/** What merging the base into the head would do. Declared once for the same
 *  reason as {@link SURVEY_STATUSES}. */
const MERGE_PREDICTIONS = ['clean', 'conflict', 'unknown'] as const
export type MergePrediction = (typeof MERGE_PREDICTIONS)[number]

/**
 * A scope the run cannot honour: `--branch` named a branch that is the head of
 * no open PR. It is a usage error, not an empty result. A caller that asked to
 * update "the PR of this branch" and got nothing back would assume it was
 * current.
 */
export class SurveyUsageError extends Error {
  override name = 'SurveyUsageError'
}

/**
 * Which PRs a run is limited to. A number selects that PR in every
 * repository of the run. A `prKey` string (`owner/name#N`) selects one PR of
 * one repository.
 */
export type PrSelector = number | string

const PR_KEY = /^([^\s/#]+\/[^\s/#]+)#([1-9]\d*)$/

/**
 * `owner/name#N`: one PR of one repository. Every report names a PR this
 * way, and `--pr` accepts it, so a PR read from the output can be passed back.
 */
export function prKey(repo: string, number: number): string {
  return `${repo}#${number}`
}

/** The repository and number of an `owner/name#N` key, or null when `text` is not one. */
export function parsePrKey(text: string): { repo: string; number: number } | null {
  const m = PR_KEY.exec(text)
  return m === null ? null : { repo: m[1]!, number: Number(m[2]) }
}

/** A selector as reports print it: `#N` for a bare number, else the key itself. */
export function selectorLabel(selector: PrSelector): string {
  return typeof selector === 'number' ? `#${selector}` : selector
}

/** A repository to survey, and the checkout its drift is measured in. */
export interface RepoTarget {
  /**
   * `owner/name`, as the code host knows it. Lower-cased for every target but
   * the project root, which keeps the spelling of its own remote.
   */
  repo: string
  /** The host, lower-cased; null for a project root whose remote names none. */
  host: string | null
  /**
   * Local checkout, or null when this machine has none. Drift and conflict
   * prediction read git objects, so a target with no path is listed and
   * reported unmeasurable, not guessed at.
   */
  path: string | null
  /** Where {@link path} came from; null with it. */
  source: CheckoutSource | null
  /** The remote whose tracking refs are fetched and read: `--remote`, or the checkout's own. */
  remote: string
  /**
   * The checkout as `locate` described it, when it returned a
   * {@link FoundCheckout} rather than a bare path. Null otherwise.
   */
  found: FoundCheckout | null
  /**
   * For a target other than the project root: whether a managed clone could serve it, since its
   * code host is GitHub (github.com, or the project root's host when that is GitHub). Unset for
   * the project root.
   */
  github?: boolean | undefined
  /**
   * Why the run has no checkout for this target although it looked for one, such as a managed
   * clone another run holds (`mirror busy`). `update` skips its PRs with this reason.
   */
  unserved?: string | undefined
}

/** A worktree {@link ManagedClones.removing} takes out of a clone: the run's own, or a kept one. */
export interface RemovedTree {
  path: string
  kind: 'run' | 'kept'
}

/**
 * The managed clones of a standalone run (`mirror.ts`), as the survey and `update` use them.
 * A run without it treats a `clone` checkout as any other.
 *
 * Each clone has a lock. `update` holds it from {@link provide} until {@link release}, and again
 * inside {@link removing}; `survey` holds it only inside {@link use}.
 */
export interface ManagedClones {
  /**
   * `update` only, before its survey: take the lock of every clone the run will use, in sorted
   * path order, and return the targets. With `apply` (`update --apply`) it first serves each
   * target with no checkout from a clone where consent allows, making the clone when there is
   * none, and waits for a lock another run holds; a rehearsal makes no clone and does not wait.
   * A target it serves points at its clone; one it cannot has {@link RepoTarget.unserved} set
   * (`mirror busy`, say).
   *
   * @throws SurveyUsageError when it must ask and cannot, or the clone directory is unusable.
   * @throws ConfigInvalidError when the machine file cannot take the answer it would ask for.
   */
  provide(targets: readonly RepoTarget[], opts: { apply: boolean }): RepoTarget[]
  /**
   * Run `read`, which fetches into and reads the clone at `clone`, under the clone's lock, so a
   * prune cannot remove the clone part-way, and write the clone's last-used stamp. When this run
   * holds the lock already, `read` runs at once. The lock is never waited for: when another run
   * holds it, a note says so and `read(false)` runs without it, to read the clone as it is with
   * no fetch. When the clone is no longer there after that read (a prune held the lock), what
   * `read` returned or threw is dropped, a note says so, and `gone(why)` answers instead.
   * Returns what `read` or `gone` does.
   */
  use<T>(clone: string, read: (mayFetch: boolean) => T, gone: (why: string) => T): T
  /**
   * Let go of the lock {@link provide} took for the clone at `clone`: the run has added its
   * worktree there, or has nothing to do in it. Nothing when the run does not hold it.
   */
  release(clone: string): void
  /**
   * Run `remove`, which changes the clone at `clone` (takes `tree`, the run's worktree or a
   * kept one, out of it), holding the clone's lock. A lock the run holds is used as it is. One
   * it does not hold is taken back: `update --apply` waits for it only when the run holds no
   * other clone's lock, so a run that waits holds nothing another run could be waiting for; a
   * rehearsal, or a run that holds another lock, does not wait.
   *
   * A clone is never changed without its lock: when the lock cannot be taken, `remove` is not
   * run, the result is false, and a note names `tree.path` and what removes it later: for a run
   * worktree the next run in the clone (which removes a dead run's worktree) or
   * `pr-update mirror prune`; for a kept worktree another `--discard-kept`. A lock taken back
   * here is let go before it returns.
   */
  removing(clone: string, tree: RemovedTree, remove: () => void): boolean
  /** Let go of every lock the run still holds. */
  close(): void
}

export interface SurveyRow {
  repo: string
  number: number
  title: string
  url: string
  base: string
  head: string
  isDraft: boolean
  /** True when the head branch lives in a fork. */
  crossRepo: boolean
  /**
   * The head sha the code host reports now. A rebase force-push is pinned to
   * it, so if someone pushes to the PR between the survey and the update, the
   * push is refused instead of overwriting their work.
   */
  headOid: string | null
  /** The base's remote-tracking sha when measured. Null when unmeasurable. */
  baseOid: string | null
  /** Commits the head carries that the base does not. Null when unmeasurable. */
  ahead: number | null
  /** Commits the base carries that the head does not. Null when unmeasurable. */
  behind: number | null
  /** The open PR this one is stacked on, if any. */
  parent: number | null
  /** Nearest ancestor that is itself behind, which is the one to update first. */
  blockedBy: number | null
  status: SurveyStatus
  merge: MergePrediction
  conflicts: string[]
  /**
   * The base ref's resolved sha at the moment `merge-tree` predicted this
   * conflict. Null when `merge` is not `'conflict'`, or when the base ref
   * itself could not be resolved.
   */
  conflictBaseSha: string | null
  /** Submitted reviews. A rewrite would outdate the threads anchored to them. */
  reviews: number
  /** The head branch is checked out somewhere holding unpushed commits. */
  unpushedLocal: boolean
  strategy: Strategy
  strategyRule: string
  strategyReason: string
}

// ---------------------------------------------------------------------------
// The stack graph
// ---------------------------------------------------------------------------

/**
 * Order PRs parent-first, so a stack is updated from its root down.
 *
 * A topological sort (Kahn's algorithm) over the "A's base is B's head" edges.
 * PRs at the same depth keep PR-number order, so two runs over the same state
 * print the same list. Anything left at the end is in a cycle. The GitHub UI
 * cannot make one, but a survey that dropped those PRs would report the wrong
 * thing, so they are returned separately.
 */
export function topoOrder(prs: readonly CodeHostPrDetail[]): {
  order: CodeHostPrDetail[]
  cycles: number[]
} {
  const parentOf = parentEdges(prs)
  const pending = [...prs].sort((a, b) => a.number - b.number)
  const emitted = new Set<number>()
  const order: CodeHostPrDetail[] = []

  let progress = true
  while (progress) {
    progress = false
    for (const pr of pending) {
      if (emitted.has(pr.number)) continue
      const parent = parentOf.get(pr.number) ?? null
      if (parent !== null && !emitted.has(parent)) continue
      emitted.add(pr.number)
      order.push(pr)
      progress = true
    }
  }

  const cycles = pending.filter((pr) => !emitted.has(pr.number)).map((pr) => pr.number)
  return { order, cycles }
}

/** The `parent` edge for each PR, by number. */
export function parentEdges(prs: readonly CodeHostPrDetail[]): Map<number, number | null> {
  // A fork's head is a branch of another repository. A PR whose base has the
  // same name targets this repository's branch, not the fork's, so a fork PR
  // is never anyone's parent.
  const byHead = new Map<string, number>()
  for (const pr of prs) if (!pr.isCrossRepository) byHead.set(pr.headRef, pr.number)
  const edges = new Map<number, number | null>()
  for (const pr of prs) {
    const parent = byHead.get(pr.baseRef) ?? null
    // A PR whose base is its own head is not a stack, it is a broken row.
    edges.set(pr.number, parent === pr.number ? null : parent)
  }
  return edges
}

/**
 * The nearest ancestor that is behind: the PR to update before this one.
 *
 * Walks up the whole stack, not only to the parent. A grandparent's drift
 * reaches every descendant, and stopping at one level would report a child as
 * ready when its base is still about to move.
 */
export function nearestBehindAncestor(
  prNumber: number,
  edges: ReadonlyMap<number, number | null>,
  behindOf: ReadonlyMap<number, number | null>,
): number | null {
  const seen = new Set<number>([prNumber])
  let cursor = edges.get(prNumber) ?? null
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor)
    const behind = behindOf.get(cursor) ?? null
    if (behind !== null && behind > 0) return cursor
    cursor = edges.get(cursor) ?? null
  }
  return null
}

/** Classify one row, given its own drift and its ancestry. */
export function statusFor(behind: number | null, blockedBy: number | null): SurveyStatus {
  if (blockedBy !== null) return 'blocked'
  if (behind === null) return 'unknown'
  return behind > 0 ? 'behind' : 'up-to-date'
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * Drift and predicted merge for one PR, read from the remote-tracking refs.
 *
 * Every git call goes through `try`. A ref this checkout has never fetched is
 * a valid "not known", and one unmeasurable PR must not fail the survey. Null
 * and zero are kept apart: only zero means up to date.
 */
export function measure(
  git: Git,
  pr: CodeHostPrDetail,
  remote = 'origin',
): Pick<SurveyRow, 'baseOid' | 'ahead' | 'behind' | 'merge' | 'conflicts' | 'conflictBaseSha'> {
  const base = `${remote}/${pr.baseRef}`
  const head = `${remote}/${pr.headRef}`

  // `resolveRef` returns `null` for a ref that does not resolve. `soft` also
  // returns `null` for a broken object store.
  const baseOid = git.soft.resolveRef(base)

  const counts = git.try.aheadBehind(base, head)
  const ahead = counts.ok ? counts.value.ahead : null
  const behind = counts.ok ? counts.value.behind : null
  const quiet = { baseOid, ahead, behind, conflicts: [], conflictBaseSha: null }

  // Nothing to merge when the head already contains the base, so skip the
  // merge-tree subprocess.
  if (behind === 0) return { ...quiet, merge: 'clean' }

  const predicted = git.try.mergeTree(head, base)
  if (!predicted.ok) return { ...quiet, merge: 'unknown' }
  if (predicted.value.status === 'clean') return { ...quiet, merge: 'clean' }
  return {
    ...quiet,
    merge: 'conflict',
    conflicts: predicted.value.conflicts,
    conflictBaseSha: baseOid,
  }
}

/**
 * Does a checkout of `head` hold commits the remote has not seen?
 *
 * A force-push cannot check this for itself. `--force-with-lease` compares
 * against the remote ref, which a local-only commit does not change, so it
 * reports the push as safe even when it will discard local work.
 *
 * Unknown counts as unsafe. A check that cannot read the refs has not shown
 * that a rewrite is fine. Being wrong one way costs a needless merge commit.
 * Being wrong the other way loses work that cannot be recovered.
 *
 * `worktrees` is `null` when they could not be listed (`git worktree list`
 * failed, or the git is too old for typed-git). That is unknown too, not "no
 * checkout of `head`", so it counts as unsafe.
 */
export function unpushedLocalWork(
  git: Git,
  worktrees: readonly Worktree[] | null,
  head: string,
  remote = 'origin',
): boolean {
  if (worktrees === null) return true
  const wt = worktrees.find((w) => w.branch === head)
  if (wt === undefined) return false
  if (wt.head === null) return true
  const counts = git.try.aheadBehind(`${remote}/${head}`, wt.head)
  if (!counts.ok) return true
  return counts.value.ahead > 0
}

/** Assemble one repository's rows. Pure given `git`. */
export function surveyRows(
  git: Git,
  prs: readonly CodeHostPrDetail[],
  opts: {
    repo: string
    /** `null` when they could not be listed; see {@link unpushedLocalWork}. */
    worktrees: readonly Worktree[] | null
    cfg: PrUpdateConfig
    measurable: boolean
    /** The remote whose tracking refs are read. Defaults to `origin`. */
    remote?: string
    /**
     * The repository's other checkouts on this machine, each with its own worktrees (`null` when
     * they could not be listed) and the remote they push to. The `unpushed_local` guard reads
     * them as it reads `worktrees`.
     */
    others?: readonly { git: Git; worktrees: readonly Worktree[] | null; remote: string }[]
  },
): { rows: SurveyRow[]; cycles: number[] } {
  const remote = opts.remote ?? 'origin'
  const others = opts.others ?? []
  const { order, cycles } = topoOrder(prs)
  const edges = parentEdges(prs)

  const unmeasured = {
    baseOid: null,
    ahead: null,
    behind: null,
    merge: 'unknown' as const,
    conflicts: [],
    conflictBaseSha: null,
  }
  const measured = new Map<number, ReturnType<typeof measure>>()
  for (const pr of order) {
    // A fork's head is not a branch of this remote, so `<remote>/<head>` is at
    // best an unrelated branch of the same name. Its drift is not known here.
    const measurable = opts.measurable && !pr.isCrossRepository
    measured.set(pr.number, measurable ? measure(git, pr, remote) : unmeasured)
  }

  const behindOf = new Map<number, number | null>()
  for (const [num, m] of measured) behindOf.set(num, m.behind)

  return {
    cycles,
    rows: order.map((pr) => {
      const m = measured.get(pr.number)!
      const blockedBy = nearestBehindAncestor(pr.number, edges, behindOf)
      // Each other checkout is read against its own `<remote>/<head>`. That ref is as fresh as
      // that checkout's last fetch, and a stale one can only report more work as unpushed.
      const unpushed = opts.measurable
        ? unpushedLocalWork(git, opts.worktrees, pr.headRef, remote) ||
          others.some((o) => unpushedLocalWork(o.git, o.worktrees, pr.headRef, o.remote))
        : false
      const decision = chooseStrategy(
        {
          base: pr.baseRef,
          labels: pr.labels,
          ahead: m.ahead,
          reviews: pr.reviewCount,
          unpushedLocal: unpushed,
          worktreesUnknown:
            opts.measurable &&
            (opts.worktrees === null || others.some((o) => o.worktrees === null)),
          crossRepo: pr.isCrossRepository,
        },
        opts.cfg,
      )
      return {
        repo: opts.repo,
        number: pr.number,
        title: pr.title,
        url: pr.url,
        base: pr.baseRef,
        head: pr.headRef,
        isDraft: pr.isDraft,
        crossRepo: pr.isCrossRepository,
        headOid: pr.headSha,
        ...m,
        parent: edges.get(pr.number) ?? null,
        blockedBy,
        status: statusFor(m.behind, blockedBy),
        reviews: pr.reviewCount,
        unpushedLocal: unpushed,
        strategy: decision.strategy,
        strategyRule: decision.rule,
        strategyReason: decision.reason,
      }
    }),
  }
}

/**
 * The PRs named by `wanted`, plus every stack ancestor of each.
 *
 * Ancestors are kept because a PR whose parent is behind is `blocked`, and
 * reporting that needs the parent measured. The order of `prs` is kept. A
 * number not in `prs` is ignored. Reporting it missing is the caller's job.
 */
export function scopeToPrs(
  prs: readonly CodeHostPrDetail[],
  wanted: ReadonlySet<number>,
): CodeHostPrDetail[] {
  const edges = parentEdges(prs)
  const keep = new Set<number>()
  for (const pr of prs) {
    if (!wanted.has(pr.number)) continue
    let cursor: number | null = pr.number
    while (cursor !== null && !keep.has(cursor)) {
      keep.add(cursor)
      cursor = edges.get(cursor) ?? null
    }
  }
  return prs.filter((pr) => keep.has(pr.number))
}

// ---------------------------------------------------------------------------
// Repository targets
// ---------------------------------------------------------------------------

/**
 * A host as two hosts are compared: lower-cased and without a port. A remote's
 * host is read without its port, and `--repo` keeps the one it names, so
 * `forgejo.local:3000` and `forgejo.local` are one host. It is also the host
 * of every path and trust key a target gets, so none holds a `:`.
 */
export function hostKey(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, '')
}

/**
 * Whether `part` cannot name a folder on Windows: it holds one of `<>:"|?*`, ends in `.` or a
 * space, or is a reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`)
 * in any case, with or without an extension.
 */
function notAWindowsFolder(part: string): boolean {
  return (
    /[<>:"|?*]/.test(part) ||
    /[. ]$/.test(part) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(part)
  )
}

/** Whether `text` reads as a trust key, `host/owner/name` (trust-repo's `parseTrustRepo`). */
function isTrustKey(text: string): boolean {
  try {
    parseTrustRepo(text)
    return true
  } catch {
    return false
  }
}

/**
 * A `--repo` read as a target: its host (`defaultHost` when it names none),
 * owner and name, lower-cased. Its `host/owner/name`, with the host's port
 * left out, must be a trust key, since that key trusts a clone of it and
 * names its clone, kept and attempt paths. An owner or a name that cannot be
 * a folder on Windows is refused too, since each is a path segment.
 *
 * @throws SurveyUsageError naming what is wrong.
 */
function parseRepoFlag(
  text: string,
  defaultHost: string,
): { host: string; owner: string; name: string; hostGiven: boolean } {
  const bad = new SurveyUsageError(`--repo ${text}: not owner/name or host/owner/name`)
  let parsed
  try {
    parsed = parseRepoTarget(text)
  } catch {
    throw bad
  }
  const owner = parsed.owner.toLowerCase()
  const name = parsed.repo.toLowerCase()
  const host = parsed.host?.toLowerCase() ?? defaultHost
  if (name.length > 4 && name.endsWith('.git')) {
    throw new SurveyUsageError(
      `--repo ${text}: name the repository without .git, as ${text.trim().slice(0, -4)}`,
    )
  }
  if (owner.includes(':') || name.includes(':') || !isTrustKey(`github.com/${owner}/${name}`)) {
    throw bad
  }
  const unsafe = [owner, name].find(notAWindowsFolder)
  if (unsafe !== undefined) {
    throw new SurveyUsageError(`--repo ${text}: ${unsafe} cannot be a folder name on Windows`)
  }
  if (!isTrustKey(`${hostKey(host)}/${owner}/${name}`)) {
    throw new SurveyUsageError(`--repo ${text}: ${hostKey(host)} is not a host name`)
  }
  return { host, owner, name, hostGiven: parsed.host !== undefined }
}

/** Options for {@link resolveTargets}. */
export interface ResolveTargetsOptions {
  /** The run's `--remote`, read in the project root and in a checkout `locate` gives as a bare path. Default `origin`. */
  remote?: string | undefined
  /** The host of the project root's `remote`, lower-cased, or null when that remote names none. Default null. */
  rootHost?: string | null | undefined
  /** The host a bare `owner/name` means. Default `github.com`. */
  defaultHost?: string | undefined
  /**
   * The project root's host when its code host is GitHub (an Enterprise host with
   * `code_host.override: github`, say), else null. A target there or on github.com could be
   * served by a managed clone. Default null.
   */
  githubHost?: string | null | undefined
}

/**
 * Which repositories to survey, and where each is checked out.
 *
 * The repository at `--project-root` is always the default target and needs
 * no config. `--repo owner/name` (or `host/owner/name`) names others, and
 * `ports.locate` finds each one's checkout, through the host's own registry or
 * what a standalone run provides (see `defaults.ts`).
 *
 * Each `--repo` is resolved once, here. Any other than the project root is
 * lower-cased, and a bare `owner/name` gets `defaultHost`, so `Acme/API` and
 * `acme/api` are one target and every later lookup compares that form. One
 * that names the project root's repository, in any letter case, is the
 * project root.
 *
 * Only `--repo` puts a repository in scope. A host's repository registry does
 * not, so a bare run stays on the local repository and never spreads to every
 * repository on the machine.
 *
 * A named repo with no checkout on this machine is kept and reported
 * unmeasurable, not dropped. Quietly surveying fewer repositories than were
 * asked for would be worse.
 *
 * @throws SurveyUsageError when a `--repo` is not `owner/name` or `host/owner/name` (one
 * that cannot be a trust key, or whose name ends in `.git`), or when
 * two name one `owner/name` on different hosts: every report and `--pr` key names a
 * repository by `owner/name` alone, so the run could not tell them apart.
 */
export function resolveTargets(
  localRepo: string | null,
  localPath: string,
  selected: readonly string[],
  locate: Ports['locate'],
  opts: ResolveTargetsOptions = {},
): RepoTarget[] {
  const remote = opts.remote ?? 'origin'
  const rootHost = opts.rootHost ?? null
  const defaultHost = opts.defaultHost ?? 'github.com'
  const githubHost = opts.githubHost ?? null
  const root: RepoTarget | null =
    localRepo === null
      ? null
      : { repo: localRepo, host: rootHost, path: localPath, source: 'root', remote, found: null }
  if (selected.length === 0) return root === null ? [] : [root]
  const seen = new Set<string>()
  // `owner/name`, lower-cased, to the `--repo` that named it first.
  const named = new Map<string, { text: string; host: string | null }>()
  const out: RepoTarget[] = []
  for (const text of selected) {
    const { host, owner, name, hostGiven } = parseRepoFlag(text, defaultHost)
    const repo = `${owner}/${name}`
    const isRoot =
      root !== null &&
      repo === root.repo.toLowerCase() &&
      (!hostGiven || (rootHost !== null && hostKey(host) === hostKey(rootHost)))
    const key = isRoot ? '' : `${hostKey(host)}/${repo}`
    if (seen.has(key)) continue
    seen.add(key)
    const first = named.get(repo)
    const at = isRoot ? rootHost : host
    if (
      first !== undefined &&
      (first.host === null ? null : hostKey(first.host)) !== (at === null ? null : hostKey(at))
    ) {
      throw new SurveyUsageError(
        `--repo ${first.text} and --repo ${text} are ${repo} on different hosts; a run takes one of them`,
      )
    }
    named.set(repo, { text, host: at })
    if (isRoot) {
      out.push(root)
      continue
    }
    const github =
      hostKey(host) === 'github.com' ||
      (githubHost !== null && hostKey(host) === hostKey(githubHost))
    const checkout = locate(repo, { host: hostKey(host), owner, name, github })
    out.push(
      checkout === null
        ? { repo, host, path: null, source: null, remote, found: null, github }
        : typeof checkout === 'string'
          ? { repo, host, path: checkout, source: 'located', remote, found: null, github }
          : {
              repo,
              host,
              path: checkout.path,
              source: checkout.source,
              remote: checkout.remote,
              found: checkout,
              github,
            },
    )
  }
  return out
}

// ---------------------------------------------------------------------------
// Op I/O schemas
// ---------------------------------------------------------------------------

/**
 * The scope flags. Exported as a zod shape, not a schema, because `update`
 * takes all of them plus its own, and shapes can be combined where built
 * schemas cannot.
 */
export const SCOPE_SHAPE = {
  author: z
    .string()
    .optional()
    .describe(
      'Only survey PRs by this author; `@me` is the authenticated user. Defaults to `pr_update.author`, which itself defaults to every author.',
    ),
  repo: z
    .array(z.string())
    .default([])
    .describe(
      "Repository to survey as `owner/name` or `host/owner/name`, repeatable; a bare `owner/name` is on the host of the project root's origin when that is GitHub, else github.com. Defaults to the repository at --project-root alone. Others are located via the `locate` port, which in a standalone run searches the `repositories.yaml` roots; one with no checkout on this machine is listed as unmeasurable.",
    ),
  noFetch: z
    .boolean()
    .default(false)
    .describe(
      'Skip the fetch and measure against the remote-tracking refs as they stand. Drift is only as fresh as the last fetch.',
    ),
  noDrafts: z
    .boolean()
    .default(false)
    .describe('Exclude draft PRs. Defaults to `pr_update.include_drafts`.'),
  limit: z.coerce
    .number()
    .int()
    .default(100)
    .describe('Maximum number of open PRs to list per repository.'),
  remote: z
    .string()
    .default('origin')
    .describe(
      "The project root's remote to fetch from and measure against. A checkout `locate` describes with its own remote is read through that one.",
    ),
  pr: z
    .array(
      z.union([
        z.coerce.number().int().positive(),
        z.string().regex(PR_KEY, 'a PR number or owner/name#N'),
      ]),
    )
    .default([])
    .describe(
      'Restrict the run to these PRs, repeatable: a number selects that PR in every repository of the run, `owner/name#N` one PR of one repository in the run. Only they and their stack parents are fetched and merge-treed. In `update` they are still applied in stack order, and a PR whose parent is behind is still skipped, because updating onto a base about to move is wasted work.',
    ),
  branch: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Restrict the run to the open PR whose head is this branch (and its stack parents), as `--pr` does. No such PR is a usage error. The CLI fills in the current branch of the working directory when `--branch` has no name.',
    ),
} as const

export const input = z.object(SCOPE_SHAPE)

export const row = z.object({
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  base: z.string(),
  head: z.string(),
  isDraft: z.boolean(),
  crossRepo: z
    .boolean()
    .describe('True when the head branch lives in a fork; a host never updates such a PR.'),
  headOid: z.string().nullable(),
  baseOid: z
    .string()
    .nullable()
    .describe("The base branch's remote-tracking sha when measured; null otherwise."),
  ahead: z.number().nullable(),
  behind: z.number().nullable(),
  parent: z.number().nullable(),
  blockedBy: z.number().nullable(),
  /** {@link SurveyStatus}, as a zod enum over the same source array. */
  status: z.enum(SURVEY_STATUSES),
  /** {@link MergePrediction}, as a zod enum over the same source array. */
  merge: z.enum(MERGE_PREDICTIONS),
  conflicts: z.array(z.string()),
  conflictBaseSha: z
    .string()
    .nullable()
    .describe("The base ref's resolved sha when `merge` is `conflict`; null otherwise."),
  reviews: z.number(),
  unpushedLocal: z.boolean(),
  strategy: z.string(),
  strategyRule: z.string(),
  strategyReason: z.string(),
})

/** Why one repository of a several-repository run could not be listed. */
export const repoFailure = z.object({
  kind: z.string().describe('The failure kind, such as `not-authenticated` or `network`.'),
  message: z.string(),
  hint: z.string().optional(),
})

/** The checkout a repository was measured in. */
export const checkoutEntry = z.object({
  path: z.string().describe('The checkout, absolute.'),
  source: z
    .enum(['root', 'located', 'clone'])
    .describe(
      '`root`: the project root. `located`: a checkout found on this machine. `clone`: a managed clone.',
    ),
})

/** One surveyed repository, as `survey` and `update` both report it. */
export const repoEntry = z.object({
  repo: z.string().describe('`owner/name`.'),
  measurable: z.boolean().describe('False when no local checkout is known.'),
  // Optional when read, so a report written before the field existed still parses; always written.
  checkout: checkoutEntry
    .nullable()
    .optional()
    .describe('The checkout the repository was measured in; null when there is none.'),
  fetched: z.boolean(),
  cycles: z
    .array(z.number())
    .describe(
      "This repository's PR numbers whose base/head edges form a cycle; excluded from the ordering.",
    ),
  failure: repoFailure
    .optional()
    .describe(
      'Present when this repository could not be listed (several-repository runs only; a single repository throws). It contributes no PRs.',
    ),
})

export const output = z.object({
  repos: z.array(repoEntry).describe('Repositories surveyed.'),
  prs: z.array(row).describe('Open PRs in stack order — a parent always precedes its children.'),
  counts: z.object({
    total: z.number(),
    upToDate: z.number(),
    behind: z.number(),
    blocked: z.number(),
    conflicted: z.number(),
    unknown: z.number(),
    rebase: z.number(),
    merge: z.number(),
    skip: z.number(),
  }),
})

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** A count, or an em dash when it could not be measured. */
export function num(n: number | null): string {
  return n === null ? '—' : String(n)
}

/** Everything `survey` reports. `update` plans from the same call. */
export type SurveyReport = z.infer<typeof output>

/** The scope flags both `survey` and `update` accept. */
export type SurveyArgs = z.infer<typeof input>

/** Everything a run needs beyond the args and the config. */
export interface SurveyEnv {
  projectRoot: string
  dryRun: boolean
  git: CommandRunner
  /** Runs `gh` for the default GitHub code host. Unused when `codeHost` is given. */
  gh: CommandRunner
  /**
   * The code host for one surveyed repository (see {@link CodeHostTarget}).
   * Absent means GitHub over `gh`.
   */
  codeHost?: ((target: CodeHostTarget) => CodeHost) | undefined
  /**
   * The `code_host.override` config value. With `github`, the project root's
   * host counts as GitHub whatever its name, as a GitHub Enterprise host
   * must, so a bare `--repo owner/name` means that host. Default none.
   */
  codeHostOverride?: CodeHostName | null | undefined
  /**
   * Looks up the host an SSH config alias in the project root's remotes stands
   * for (`git@github-work:o/r.git`), when a run has `--repo` targets. Default:
   * typed-git's, which asks `ssh -G`. An alias it cannot resolve is read as written.
   */
  resolveAlias?: SshAliasResolver | undefined
  cfg: PrUpdateConfig
  ports: Pick<Ports, 'locate'>
  /**
   * The standalone run's managed clones: a clone is fetched under its lock and stamped as used.
   * Absent means a `clone` checkout is fetched as a located one is.
   */
  clones?: ManagedClones | undefined
}

/**
 * Refspecs that update just the remote-tracking refs of these PRs' heads and
 * bases. A fork's head is not a branch of this remote, and asking for it would
 * fail the whole fetch, so only its base is requested.
 */
function scopedRefspecs(prs: readonly CodeHostPrDetail[], remote: string): string[] {
  const branches = new Set(
    prs.flatMap((p) => (p.isCrossRepository ? [p.baseRef] : [p.headRef, p.baseRef])),
  )
  return [...branches].map((b) => `+refs/heads/${b}:refs/remotes/${remote}/${b}`)
}

/**
 * `owner/name` from a git remote reference, or null when it names no project.
 * It is typed-git's `parseRemoteRepo` without the host: the hosts `parseGitUrl`
 * knows (GitHub, GitLab, ...) first, then any other `host/owner/repo` remote,
 * which is the form of a GitHub Enterprise host or a self-hosted Forgejo.
 */
export function remoteSlug(url: string): string | null {
  const ref = parseRemoteRepo(url)
  return ref === null ? null : `${ref.owner}/${ref.repo}`
}

/** What {@link surveyTargets} resolved: the project root's hosts and every target. */
export interface ResolvedTargets {
  localRepo: string | null
  rootHost: string | null
  /** The host of the project root's `origin`, which its code host is picked from. */
  codeHostHost: string | null
  targets: RepoTarget[]
}

/**
 * The repositories a run covers and where each is checked out, from the
 * `remote` and `repo` scope flags.
 *
 * Two remotes of the project root are read. `--remote` names the project
 * root's own repository, so a `--repo` naming it is the project root.
 * `origin` is the remote the project root's code host is picked from
 * (`selectedCodeHostFor`), so `codeHostHost`, its host, is the one a target
 * shares that code host on, and a bare `--repo owner/name` means that host
 * when its code host is GitHub (github.com, or any host with
 * `code_host.override: github`), and github.com otherwise.
 *
 * With `--repo`, an SSH config alias in either remote is resolved to its
 * host through `env.resolveAlias`; a run without one compares no hosts and
 * asks ssh nothing.
 */
export function surveyTargets(
  args: Pick<SurveyArgs, 'remote' | 'repo'>,
  env: Pick<SurveyEnv, 'projectRoot' | 'git' | 'ports' | 'codeHostOverride' | 'resolveAlias'>,
): ResolvedTargets {
  const localGit = new Git(env.projectRoot, { runner: env.git })
  const read = (url: string | null): RemoteRepo | null =>
    url === null
      ? null
      : args.repo.length > 0
        ? readRemote(url, env.resolveAlias)
        : parseRemoteRepo(url)
  const localUrl = localGit.soft.remoteGetUrl(args.remote)
  const local = read(localUrl)
  const localRepo = local === null ? null : `${local.owner}/${local.repo}`
  const rootHost = local === null ? null : local.host.toLowerCase()
  const originUrl = args.remote === 'origin' ? localUrl : localGit.soft.remoteGetUrl('origin')
  const origin = args.remote === 'origin' ? local : read(originUrl)
  const codeHostHost = origin === null ? null : origin.host.toLowerCase()
  const onGithub =
    codeHostHost !== null &&
    codeHostNameForRemote(originUrl, env.codeHostOverride ?? null) === 'github'
  return {
    localRepo,
    rootHost,
    codeHostHost,
    targets: resolveTargets(localRepo, env.projectRoot, args.repo, env.ports.locate, {
      remote: args.remote,
      rootHost,
      defaultHost: onGithub ? codeHostHost : 'github.com',
      githubHost: onGithub ? codeHostHost : null,
    }),
  }
}

/**
 * Run the survey.
 *
 * Kept separate from `update` so `update` plans from exactly what `survey`
 * reports, not from a second implementation that could differ. An update is
 * the survey plus an apply step, and this function keeps that true.
 */
export function runSurvey(args: SurveyArgs, env: SurveyEnv): SurveyReport {
  return surveyWithTargets(args, env).report
}

/**
 * {@link runSurvey}, with the targets it resolved. `update` reads them to know
 * which checkout each target's PRs are updated in, so every target is
 * resolved, and located, once per run. `resolved` is {@link surveyTargets}'
 * answer when the caller has it already (`update --apply` clones between the
 * two), so nothing is located twice.
 */
export function surveyWithTargets(
  args: SurveyArgs,
  env: SurveyEnv,
  resolved: ResolvedTargets = surveyTargets(args, env),
): { report: SurveyReport; targets: RepoTarget[] } {
  const { cfg } = env
  const { codeHostHost, targets } = resolved
  const codeHostFor = env.codeHost ?? githubCodeHostFor(env.gh)

  // Flags beat config; config beats the built-in default.
  const author = args.author ?? cfg.author ?? undefined
  const includeDrafts = args.noDrafts ? false : cfg.include_drafts

  // A key names one repository. One outside this run would select nothing,
  // and a run that quietly did nothing for it would read as "that PR is fine".
  // In any letter case, as `--repo` is.
  const inRun = new Map(targets.map((t) => [t.repo.toLowerCase(), t.repo]))
  const wantedNumbers: number[] = []
  const wantedIn = new Map<string, number[]>()
  for (const selector of args.pr) {
    if (typeof selector === 'number') {
      wantedNumbers.push(selector)
      continue
    }
    const key = parsePrKey(selector)
    if (key === null)
      throw new SurveyUsageError(`--pr ${selector}: not a PR number or owner/name#N`)
    const repo = inRun.get(key.repo.toLowerCase())
    if (repo === undefined) {
      throw new SurveyUsageError(
        `--pr ${selector}: ${key.repo} is not a repository of this run; add --repo ${key.repo}`,
      )
    }
    wantedIn.set(repo, [...(wantedIn.get(repo) ?? []), key.number])
  }

  const repos: SurveyReport['repos'] = []
  const allRows: SurveyRow[] = []
  let branchMatches = 0

  for (const target of targets) {
    const measurable = target.path !== null
    const checkout =
      target.path === null || target.source === null
        ? null
        : { path: target.path, source: target.source }
    // A checkout other than the project root is someone else's: git runs there with hooks off
    // and without an inherited `GIT_DIR`, as `update` runs it (`targetGitOptions`).
    const elsewhere = target.source === 'located' || target.source === 'clone'
    const git = new Git(
      target.path ?? env.projectRoot,
      elsewhere ? targetGitOptions(env.git) : { runner: env.git },
    )

    const isLocal = target.source === 'root'
    // Any other target is listed on its own host, named even when it is github.com. It
    // shares the project root's code host when it is on origin's host, which that code host is
    // picked from.
    const host = target.host ?? 'github.com'
    const onRootHost = codeHostHost !== null && hostKey(host) === hostKey(codeHostHost)
    const codeHost = codeHostFor({
      cwd: target.path ?? env.projectRoot,
      repo: target.repo,
      ...(isLocal ? {} : { host, onRootHost }),
    })
    const listed = codeHost.listPrDetails({
      limit: args.limit,
      ...(isLocal ? {} : { repo: target.repo }),
      ...(author !== undefined ? { author } : {}),
    })
    // A failed listing (the tool is missing, not signed in, no network) is not
    // an empty one. Reading it as "no open PRs" would hide the failure. With
    // one repository it is thrown as the code host's own classified failure.
    // With several, the others are still surveyed. The failure is recorded on
    // this repository's entry, and the caller reports it and exits with its code.
    if (!listed.ok) {
      const { error } = listed
      if (targets.length === 1) throw new FailureError(error)
      repos.push({
        repo: target.repo,
        measurable,
        checkout,
        fetched: false,
        cycles: [],
        failure: {
          kind: error.kind,
          message: error.message,
          ...(error.hint === undefined ? {} : { hint: error.hint }),
        },
      })
      continue
    }
    const filtered = includeDrafts ? listed.value : listed.value.filter((p) => !p.isDraft)
    const wanted = new Set([...wantedNumbers, ...(wantedIn.get(target.repo) ?? [])])
    if (args.branch !== undefined) {
      // A fork's branch of the same name is another repository's branch, and
      // not one this run could push to.
      for (const p of filtered) {
        if (p.headRef === args.branch && !p.isCrossRepository) {
          wanted.add(p.number)
          branchMatches += 1
        }
      }
    }
    // Scoped by the run, not by this repository: an `owner/name#N` for another
    // repository selects nothing here, and must not widen this one to all PRs.
    const scoped = args.pr.length > 0 || args.branch !== undefined
    const prs = scoped ? scopeToPrs(filtered, wanted) : filtered

    // After the listing, so a scoped run knows which branches to ask for.
    // `try`: when the remote cannot be reached, the survey reports what the
    // last fetch left, flagged, instead of failing the whole run. A scoped
    // run with nothing selected here fetches nothing: `git fetch` with no
    // refspec would fetch every branch.
    //
    // In a checkout other than the project root, the fetch writes only the
    // remote's branches into `<remote>/*`: no tags, no FETCH_HEAD, an explicit
    // refspec, and an empty `--refmap=`. Without that, git also applies the
    // checkout's own `remote.<name>.fetch` lines to what it fetches, even with
    // refspecs given, and a forced line into `refs/heads/` would overwrite a
    // local branch. A located checkout is fetched with `--no-prune`, which beats
    // a `fetch.prune` in its config: against that refspec, prune would delete
    // every `<remote>/*` ref with no branch behind it, such as a `pr/*` the
    // checkout's own fetch line keeps there. A managed clone is the run's own, so its
    // unscoped fetch prunes. A clone is fetched and read under its lock, which stamps it as used.
    const { remote } = target
    const own = target.source === 'root'
    const clone = target.source === 'clone'
    const refspecs = scoped ? scopedRefspecs(prs, remote) : []
    const narrow = own
      ? {}
      : { noTags: true, noWriteFetchHead: true, refmap: '', prune: clone ? undefined : false }
    const fetch = (): boolean =>
      measurable && !args.noFetch && !env.dryRun
        ? scoped
          ? refspecs.length === 0 || git.try.fetch(remote, refspecs, narrow).ok
          : own
            ? git.try.fetch(remote, undefined, { prune: true }).ok
            : git.try.fetch(remote, [`+refs/heads/*:refs/remotes/${remote}/*`], {
                ...narrow,
                ...(clone ? { prune: true } : {}),
              }).ok
        : false
    /** What reading a target gives; `unserved` when a clone a prune removed was not read. */
    type Read = ReturnType<typeof surveyRows> & { fetched: boolean; unserved?: string }
    const read = (mayFetch: boolean): Read => {
      const fetched = mayFetch ? fetch() : false
      // `try`, not `soft`: a failed listing must not read as "no checkout holds
      // this branch", which would clear a force-push. `null` counts as unsafe.
      const listedWorktrees = measurable ? git.try.worktrees() : null
      const worktrees =
        listedWorktrees === null ? [] : listedWorktrees.ok ? listedWorktrees.value : null
      // A located checkout's others were matched by `origin`, as it was.
      const others = (target.found?.others ?? []).map((path) => {
        const other = new Git(path, targetGitOptions(env.git))
        const listed = other.try.worktrees()
        return { git: other, worktrees: listed.ok ? listed.value : null, remote: 'origin' }
      })
      return {
        fetched,
        ...surveyRows(git, prs, { repo: target.repo, worktrees, cfg, measurable, remote, others }),
      }
    }
    // A clone a prune removed while it was read without its lock: reported as a target with no
    // checkout, its PRs not measured, rather than with rows read from a clone half gone.
    const gone = (why: string): Read => ({
      fetched: false,
      unserved: why,
      ...surveyRows(git, prs, {
        repo: target.repo,
        worktrees: [],
        cfg,
        measurable: false,
        remote,
        others: [],
      }),
    })
    const { fetched, rows, cycles, unserved } =
      clone && target.path !== null && env.clones !== undefined
        ? env.clones.use(target.path, read, gone)
        : read(true)
    if (unserved !== undefined) {
      repos.push({ repo: target.repo, measurable: false, checkout: null, fetched, cycles })
      allRows.push(...rows)
      continue
    }
    repos.push({ repo: target.repo, measurable, checkout, fetched, cycles })
    allRows.push(...rows)
  }

  if (args.branch !== undefined && branchMatches === 0) {
    throw new SurveyUsageError(`no open PR has head branch '${args.branch}'`)
  }

  const count = (fn: (r: SurveyRow) => boolean): number => allRows.filter(fn).length
  const report: SurveyReport = {
    repos,
    prs: allRows,
    counts: {
      total: allRows.length,
      upToDate: count((r) => r.status === 'up-to-date'),
      behind: count((r) => r.status === 'behind'),
      blocked: count((r) => r.status === 'blocked'),
      conflicted: count((r) => r.merge === 'conflict'),
      unknown: count((r) => r.status === 'unknown'),
      rebase: count((r) => r.strategy === 'rebase'),
      merge: count((r) => r.strategy === 'merge'),
      skip: count((r) => r.strategy === 'skip'),
    },
  }
  return { report, targets }
}

/**
 * The repositories of a report that could not be listed, as failures whose
 * message names the repository. Empty for a single-repository run, which throws.
 */
export function repoFailuresOf(report: Pick<SurveyReport, 'repos'>): Failure[] {
  return report.repos.flatMap((r) =>
    r.failure === undefined
      ? []
      : [
          {
            kind: r.failure.kind,
            message: `${r.repo}: ${r.failure.message}`,
            ...(r.failure.hint === undefined ? {} : { hint: r.failure.hint }),
          },
        ],
  )
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

/** Render a survey report as the same aligned text `pr-update survey` prints. */
export function renderSurveyText(out: SurveyReport): string {
  const lines: string[] = []
  // Before the rows, and before any early return: a repository that could not
  // be reached must not read as a repository with no PRs.
  const unmeasured = out.repos.filter((r) => !r.measurable)
  for (const r of unmeasured) {
    lines.push(`${r.repo}: no local checkout — drift not measured`)
  }
  // A repository that could not be listed is not one with no PRs.
  for (const r of out.repos) {
    if (r.failure !== undefined) lines.push(`${r.repo}: could not be listed — ${r.failure.message}`)
  }
  if (out.prs.length === 0) {
    lines.push('PR-SURVEY: no open PRs')
    return `${lines.join('\n')}\n`
  }
  if (unmeasured.length > 0) lines.push('')
  const w = {
    pr: Math.max(2, ...out.prs.map((p) => prKey(p.repo, p.number).length)),
    status: Math.max(6, ...out.prs.map((p) => p.status.length)),
    plan: Math.max(4, ...out.prs.map((p) => p.strategy.length)),
    head: Math.max(4, ...out.prs.map((p) => p.head.length)),
  }
  lines.push(
    `${pad('PR', w.pr)}  ${pad('STATUS', w.status)}  ${pad('BEHIND', 6)}  ` +
      `${pad('AHEAD', 5)}  ${pad('PLAN', w.plan)}  ${pad('HEAD', w.head)}  BASE`,
  )
  for (const p of out.prs) {
    // Each note changes what to do about the PR, and more than one can be true
    // at once. For example, a conflicted PR in an out-of-date stack, updated by
    // a strategy a guard picked instead of the project default.
    const notes: string[] = []
    if (p.blockedBy !== null) notes.push(`blocked on #${p.blockedBy}`)
    if (p.merge === 'conflict') {
      const shown = p.conflicts.slice(0, 3).join(', ')
      const rest = p.conflicts.length > 3 ? ` (+${p.conflicts.length - 3})` : ''
      notes.push(`conflicts: ${shown}${rest}`)
    }
    if (p.strategyRule !== 'default') notes.push(p.strategyReason)
    const note = notes.length > 0 ? `  ← ${notes.join('; ')}` : ''
    lines.push(
      `${pad(prKey(p.repo, p.number), w.pr)}  ` +
        `${pad(p.status, w.status)}  ${pad(num(p.behind), 6)}  ${pad(num(p.ahead), 5)}  ` +
        `${pad(p.strategy, w.plan)}  ${pad(p.head, w.head)}  ${p.base}${note}`,
    )
  }
  const cycles = out.repos.flatMap((r) => r.cycles.map((n) => prKey(r.repo, n)))
  if (cycles.length > 0) lines.push(`\nunordered (base/head cycle): ${cycles.join(', ')}`)
  const c = out.counts
  lines.push(
    `\nPR-SURVEY: total=${c.total} up-to-date=${c.upToDate} behind=${c.behind} ` +
      `blocked=${c.blocked} conflicted=${c.conflicted} unknown=${c.unknown}` +
      ` | plan rebase=${c.rebase} merge=${c.merge} skip=${c.skip}`,
  )
  return `${lines.join('\n')}\n`
}
