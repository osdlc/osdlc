/**
 * Bringing one PR up to date, and a run of them.
 *
 * Two facts about updating many PRs at once decide the design.
 *
 * One worktree, reused. A checkout of a monorepo is expensive, and one per PR
 * is too slow at fifty PRs. So the run creates one temporary worktree and
 * resets it between PRs. Nothing here touches the user's checkout. The run
 * works on one scratch branch, moved with `checkout -B`, never on the PR's own
 * branch. This matters because a PR's branch may be checked out in someone's
 * worktree, and git refuses to check out the same branch twice. Working on a
 * scratch branch and pushing `HEAD:<head>` avoids that problem.
 *
 * One stuck PR must not end the run. Every failure is a recorded outcome,
 * never a throw: a conflict nothing claims, a rebuild verb that fails, a push
 * rejected by a concurrent update. The run continues, and the report says
 * what happened to each PR. Stopping at the first hard PR would leave the
 * other forty-nine not updated.
 *
 * Rebase, then merge, then repair. A rebase replays every commit, so it can
 * stop once per commit. The fixed resolvers (rerere, lockfile, resolvers,
 * generators) run at every stop; rerere only with `apply`, and only in a
 * repository whose `rr-cache/` pr-update owns, a managed clone
 * (`UpdateSettings.rerere`, `integrationEnv`). A stop they cannot clear aborts
 * the rebase, and the PR is retried as a merge, which meets the same conflict
 * once. Only then is `repair` called, so an agent is never asked to fix twenty
 * versions of one conflict. The outcome records the change of strategy, so a
 * reader does not mistake the push for a rebase. A run uses rerere only while it
 * holds the clone's rerere lock (`./rerere.ts`): it empties the cache when it
 * takes the lock, whenever a PR ends without a push, and when it lets go, so a
 * resolution it replays was made in this run, by a PR that was pushed or by the
 * PR in flight.
 *
 * With `on_rebase_conflict: repair`, a repository that refuses merges repairs
 * each stop instead, up to a cap, and never falls back to a merge.
 *
 * The caller decides the order. A stack must be updated parent first, because
 * updating a child before its parent is work that has to be redone as soon as
 * the parent moves.
 *
 * Nothing is pushed, kept or recorded without `apply`. A dry run runs the same
 * code, with its worktree, scratch branch, commits, resolvers and verify, and
 * pushes nothing. It calls no repair and does not use rerere, so it can report a
 * conflict an `apply` run would clear.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import {
  absolutePathEntries,
  firstLine,
  forwardedSignal,
  isCommandFailed,
  stderrOrError,
  type CommandRunner,
} from '@osdlc/command-seam'
import {
  CommandFailed,
  Git,
  REPOSITORY_VARS,
  gitConfigEnv,
  withoutRepositoryVars,
  type PushRefResult,
  type PushRejection,
  type PushReport,
} from '@osdlc/typed-git'

import { NO_MAINTENANCE } from '../clone-maintenance.ts'
import { NothingDetectedError } from '../detect.ts'
import { FOLDER_MODE } from '../folders.ts'
import { keepWorktree, type KeptPlace } from './kept.ts'
import { PRUNE_ALL, removeWorktree, type WorktreeRecords } from './registrations.ts'
import { takeRerere, type RerereCache } from './rerere.ts'
import type {
  ConfirmPush,
  BranchLease,
  Generator,
  PushPreview,
  Repair,
  RepairKind,
  RepairRequest,
  RepairResult,
  RunVerb,
} from '../ports.ts'
import {
  generatorNames,
  planPaths,
  rebuildVerbs,
  unclaimed,
  type PathPlan,
  type RegenerateRule,
} from './resolvers.ts'

export type { RunVerb } from '../ports.ts'

/**
 * The prefix of the scratch branch every PR is built on. Never a PR's own
 * branch.
 *
 * Named for this package, not for any host, so a standalone run against any
 * repository does not leave behind a branch named for another tool.
 */
export const WORK_BRANCH = 'pr-update/scratch'

/**
 * The scratch branch checked out in `worktree`. One per worktree, named for its
 * directory (`<pid>.<time>`, unique to a run), because two runs in one
 * repository at once, such as a host updating several PRs in parallel, cannot
 * both hold one branch name.
 */
export function scratchBranch(worktree: string): string {
  return `${WORK_BRANCH}-${basename(worktree)}`
}

/** What the executor needs to know about one PR. Gathered by the survey. */
export interface UpdateTarget {
  /** `owner/name`. */
  repo: string
  number: number
  head: string
  base: string
  /**
   * The head sha seen when the run started. A rebase force-push is pinned to
   * it, so if someone pushes to the PR during the run, the force-push is
   * rejected instead of overwriting their work.
   */
  headOid: string | null
  /** The base sha seen when the run started. Part of the failed-attempt key. */
  baseOid: string | null
  strategy: 'rebase' | 'merge'
  /**
   * Set on a stacked PR that a restack run updates after its parent: the
   * parent's number. Such a target waits for its parent's outcome.
   */
  stackParent?: number | undefined
  /**
   * Set when the parent moved earlier in this run. The base is integrated
   * from `oid`, the parent's new head, not from `<remote>/<base>`, which a
   * rehearsal never moves. A rebase replays only the commits after
   * `upstream`, the parent's head before the run, so the parent's old
   * commits are left behind rather than replayed onto its new ones.
   */
  onto?: { parent: number; oid: string; upstream: string | null } | undefined
}

/** The ref a target's base is integrated from. */
function baseRef(target: UpdateTarget, remote: string): string {
  return target.onto?.oid ?? `${remote}/${target.base}`
}

export interface UpdateSettings {
  remote: string
  resolvers: readonly RegenerateRule[]
  lockfileInstall: string | null
  /**
   * Shell verbs that must pass before a push; empty means push unverified. A function resolves
   * them from the PR's own update worktree, after checkout, and a throw fails that PR, not the run.
   */
  verifyVerbs: readonly string[] | ((worktree: string, pr: number) => Promise<readonly string[]>)
  generators?: readonly Generator[] | undefined
  repair?: Repair | undefined
  /** The kinds `repair` is called for. */
  repairOn?: readonly RepairKind[] | undefined
  /** Asked before each rebase force-push. False leaves the branch alone. */
  confirmPush?: ConfirmPush | undefined
  /** Taken around each PR's update when `apply` is set. See `Ports.lease`. */
  lease?: BranchLease | undefined
  /**
   * What a rebase does when the fixed resolvers cannot clear a stop: `merge`
   * (the default) retries the PR as a merge, `fail` reports it, and `repair`
   * calls `repair` at up to `maxRebaseStops` stops, then reports it.
   */
  onRebaseConflict?: 'merge' | 'fail' | 'repair' | undefined
  /** With `onRebaseConflict: 'repair'`, how many stops one rebase may repair. Absent means 3. */
  maxRebaseStops?: number | undefined
  /** `pr_update.submodules`; see `submodules` in config.ts. Absent means `auto`. */
  submodules?: 'auto' | 'off' | undefined
  /**
   * Whether an `apply` run of {@link updateAll} uses git's rerere here: set only for a repository
   * whose `rr-cache/` pr-update owns, a managed clone, and only when `pr_update.rerere` allows it
   * (see `rerere` in config.ts and {@link integrationEnv}). Absent means off: in anyone's own
   * checkout git's rerere is turned off for every pr-update command (`targetGitEnv`), so it
   * neither replays nor records there. {@link updateOne} alone never uses it.
   */
  rerere?: boolean | undefined
}

/** A problem the repair fixed, for the report. */
export interface Repaired {
  kind: RepairKind
  note: string
}

/**
 * Set on an outcome when a rebase was abandoned and the PR retried as a merge:
 * why, in one line. Absent means the planned strategy ran.
 */
export interface StrategyFallback {
  strategyFallback?: string
}

/** How one PR's update ended. Every arm is a report, never an exception. */
export type UpdateOutcome =
  | { status: 'up-to-date' }
  | ({
      status: 'updated'
      resolved: PathPlan[]
      /**
       * Conflicted paths git's rerere resolved with a resolution recorded earlier, which no
       * resolver claims, in the order met. Absent means none. A path a resolver claims is rebuilt
       * as usual, and is in `resolved` instead.
       */
      replayed?: string[]
      pushed: boolean
      /**
       * The sha the update built, pushed or not. A rehearsal restacks a
       * child onto it, since the parent's remote branch never moves.
       */
      builtOid?: string
      /** The sha the PR branch was pushed at; set when `pushed`. */
      pushedOid?: string
      repaired?: Repaired[]
      /** Why the built update was not pushed: `confirmPush` said no or threw. */
      declined?: string
    } & StrategyFallback)
  | ({ status: 'conflict'; needsHuman: { path: string; why: string }[] } & StrategyFallback)
  | ({
      status: 'failed'
      reason: string
      /**
       * Set when the failure says nothing about the PR (a submodule that would not check
       * out), so it is not recorded as a failed attempt and does not block a retry.
       */
      unrecorded?: true
      /** Set when a verify verb failed: the verb, its exit status and its whole output. */
      verifyLog?: string
    } & StrategyFallback)

/**
 * `strategy` is the one that ran: `merge` when the outcome carries a
 * `strategyFallback`, whatever the survey planned.
 */
export interface UpdateResult extends UpdateTarget {
  outcome: UpdateOutcome
  /** Set when `keepFailed` kept this PR's worktree where it ran: its path. */
  keptWorktree?: string
  /** Set when `keepFailed` could not keep it: why. The outcome is unchanged. */
  keepError?: string
  /**
   * Set on the last PR a run worktree served when git would not remove that worktree at the end
   * of the run (a locked one, say): why. The PR's own outcome stands.
   */
  worktreeLeft?: string
  /**
   * Set when the target's own attempt record could not be read or written for this PR: the
   * error. The outcome is unchanged, and the target's later PRs in the run are skipped.
   */
  recordError?: string
}

/**
 * A push rejected because the remote moved, not because the built update was
 * wrong. It is reported apart from other failures, because the fix is to run
 * again, not to inspect the branch.
 *
 * Reads typed-git's per-ref `rejection`, not stderr. A failed lease (`stale`),
 * a merge push the remote got ahead of (`non-fast-forward`), and a writer that
 * moved, deleted or created the ref first (`lock-failed`, `already-exists`)
 * are races. A ref clash, a lock file in the way, a hook and a tag fail the
 * same way on every run, so they are not.
 */
export function isStalePush(rejection: PushRejection): boolean {
  switch (rejection) {
    case 'stale':
    case 'non-fast-forward':
    case 'lock-failed':
    case 'already-exists':
      return true
    case 'tag-exists':
    case 'ref-conflict':
    case 'hook-declined':
    case 'atomic-failed':
    case 'other':
      return false
  }
}

/**
 * The `CommandFailed` behind a thrown git failure. typed-git's throwing methods
 * throw a `FailureError` carrying the classified failure, whose `cause` is the
 * `CommandFailed`. A bare `CommandFailed` counts too. Recognised by shape, not
 * `instanceof`.
 */
function commandFailedOf(e: unknown): CommandFailed | null {
  if (isCommandFailed(e)) return e
  const cause =
    typeof e === 'object' && e !== null
      ? (e as { failure?: { cause?: unknown } }).failure?.cause
      : null
  return isCommandFailed(cause) ? cause : null
}

/** The first `remote:` line of a push's stderr, without the prefix, or null. */
function remoteLine(stderr: string): string | null {
  const m = /^remote: (?:error: )?(.*?)\s*$/m.exec(stderr)
  return m === null || m[1] === '' ? null : m[1]!
}

/** One line naming why `e` failed: stderr (or the runner's `error`), else stdout. */
export function errorLine(e: unknown): string {
  const failed = commandFailedOf(e)
  if (failed !== null) {
    return (
      firstLine(stderrOrError(failed.result)) || firstLine(failed.result.stdout, 'command failed')
    )
  }
  return e instanceof Error ? e.message : String(e)
}

/**
 * The conflicted paths git itself reports. This is the list to trust.
 *
 * An integration outcome's own `conflicts` is a best-effort parse of a message
 * that can be translated, and it has no parseable form for rename/rename. It
 * is good for a report, not for a decision.
 */
function conflictedPaths(git: Git): string[] {
  return git.diffNameOnly({ diffFilter: 'U' })
}

/** The reason prefix of a failure to check out the worktree's submodules. */
const SUBMODULE_FAILURE = 'submodule setup failed'

/**
 * What the worktree's submodules are pinned to: `.gitmodules` and every gitlink, as one string,
 * or null when the worktree has no `.gitmodules` or submodules are off.
 */
function submoduleState(git: Git, worktree: string, settings: UpdateSettings): string | null {
  if ((settings.submodules ?? 'auto') === 'off') return null
  const file = join(worktree, '.gitmodules')
  if (!existsSync(file)) return null
  const links = git.submodules().map((s) => `${s.path} ${s.commit}`)
  return `${readFileSync(file, 'utf8')}\n${links.join('\n')}`
}

/** Sync submodule URLs and check out the worktree's submodules. @returns the failure reason, or null. */
function populateSubmodules(git: Git): string | null {
  try {
    // Without `sync`, `update --init` keeps the URL a submodule was first cloned from and ignores a changed `.gitmodules`.
    git.rawChecked(['submodule', 'sync', '--recursive'])
    git.submoduleUpdate()
    return null
  } catch (e) {
    return `${SUBMODULE_FAILURE}: ${errorLine(e)}`
  }
}

/**
 * Check out each submodule at the commit the index pins, so the `add .` that follows does not
 * restage a pointer to the PR's checkout. Git skips unmerged submodules, so a pointer that is
 * still conflicted is left alone. @returns the failure reason, or null.
 */
function syncSubmodulesToIndex(
  git: Git,
  worktree: string,
  settings: UpdateSettings,
): string | null {
  return submoduleState(git, worktree, settings) === null ? null : populateSubmodules(git)
}

/**
 * Name the two commits a submodule pointer conflict is between. A gitlink on both sides
 * has no built-in resolver, and "no resolver claims it" does not say which commit to pick.
 * In a rebase stage 2 is the base and stage 3 the PR's commit; in a merge, the reverse.
 */
function withGitlinkCommits<T extends { path: string; why: string }>(
  git: Git,
  needsHuman: readonly T[],
  rebasing: boolean,
): T[] {
  if (needsHuman.length === 0) return [...needsHuman]
  const entries = git.try.lsFilesUnmerged()
  if (!entries.ok) return [...needsHuman]
  return needsHuman.map((c) => {
    const at = (stage: 2 | 3) =>
      entries.value.find((e) => e.path === c.path && e.stage === stage && e.mode === '160000')?.sha
    const [base, branch] = rebasing ? [at(2), at(3)] : [at(3), at(2)]
    return base === undefined || branch === undefined
      ? c
      : { ...c, why: `submodule pointer moved on both sides: base ${base}, branch ${branch}` }
  })
}

/** The `submodule.*` keys `submodule sync` and `update --init` write to the repository's config. */
const SUBMODULE_CONFIG = '^submodule\\..*\\.(url|active)$'

function submoduleConfig(git: Git): Map<string, string> {
  const keys = new Map<string, string>()
  let stdout: string
  try {
    stdout = git.rawChecked(['config', '--get-regexp', SUBMODULE_CONFIG]).stdout
  } catch {
    return keys // exit 1: no such key
  }
  for (const line of stdout.split('\n')) {
    const at = line.indexOf(' ')
    if (at > 0) keys.set(line.slice(0, at), line.slice(at + 1))
  }
  return keys
}

function restore(git: Git, argv: string[]): void {
  try {
    git.rawChecked(argv)
  } catch {
    // Best effort: the temporary worktree is going away either way.
  }
}

/** How one PR is updated: whether it may push, the worktree it runs in, and the rerere cache. */
interface UpdateOneOptions {
  apply: boolean
  worktree: string
  /**
   * The clone's rerere cache, when this run holds it; set only by `updateAll` (`./rerere.ts`).
   * rerere is on while `cache.on`. Absent means off.
   */
  cache?: RerereCache | undefined
}

/**
 * `updateOneUnscoped`, then put the repository's `submodule.*` config back. A linked worktree
 * shares the repository's config, so the URLs of a PR's `.gitmodules` that the submodule setup
 * wrote there would outlive the temporary worktree and be used by the user's own checkout.
 */
export async function updateOne(
  git: Git,
  target: UpdateTarget,
  settings: UpdateSettings,
  runVerb: RunVerb,
  opts: { apply: boolean; worktree: string },
): Promise<UpdateOutcome> {
  return updateOneIn(git, target, settings, runVerb, opts)
}

/** {@link updateOne}, with rerere on when `updateAll` says so. */
async function updateOneIn(
  git: Git,
  target: UpdateTarget,
  settings: UpdateSettings,
  runVerb: RunVerb,
  opts: UpdateOneOptions,
): Promise<UpdateOutcome> {
  if ((settings.submodules ?? 'auto') === 'off')
    return updateOneUnscoped(git, target, settings, runVerb, opts)
  const before = submoduleConfig(git)
  try {
    return await updateOneUnscoped(git, target, settings, runVerb, opts)
  } finally {
    const after = submoduleConfig(git)
    for (const key of after.keys()) {
      if (!before.has(key)) restore(git, ['config', '--unset-all', key])
    }
    for (const [key, value] of before) {
      if (after.get(key) !== value) restore(git, ['config', key, value])
    }
  }
}

/**
 * Update one PR in an already-prepared worktree.
 *
 * The caller creates and removes the worktree. This function handles what
 * happens inside it for one PR, including leaving it clean for the next one. A
 * caught failure always aborts the merge or rebase in progress, because a
 * worktree left in the middle of one would break every PR after it.
 */
async function updateOneUnscoped(
  git: Git,
  target: UpdateTarget,
  settings: UpdateSettings,
  runVerb: RunVerb,
  opts: UpdateOneOptions,
): Promise<UpdateOutcome> {
  const base = baseRef(target, settings.remote)
  const head = `${settings.remote}/${target.head}`

  try {
    // `noTrack`: `head` is a remote-tracking branch, and git would otherwise write
    // `branch.<scratch>.remote` and `.merge` into the checkout's config, a located checkout's
    // included, and leave them there after the branch is gone.
    git.checkout(head, {
      branch: scratchBranch(opts.worktree),
      resetBranch: true,
      force: true,
      noTrack: true,
    })
  } catch (e) {
    return { status: 'failed', reason: `checkout ${head}: ${errorLine(e)}` }
  }
  // A forced checkout keeps untracked files. Whatever the previous PR left (a
  // verify verb's report, say) would otherwise be committed by this PR's `add .`.
  git.try.clean({ directories: true, nested: true })

  // The push lease pins `target.headOid`, the code host's view of the head. A
  // tracking ref behind it (after a skipped or failed fetch) would build on an
  // old head, and the lease would still pass, dropping the newer remote commits.
  const tracked = git.resolveRef('HEAD')
  if (target.headOid !== null && tracked !== target.headOid) {
    return {
      status: 'failed',
      reason: `tracking ref ${head} does not match the PR head; re-run with a fetch`,
    }
  }

  // "Nothing to do" is the common answer in a run over every open PR, and it
  // must cost nothing: no integration, no rebuild, no push.
  const counts = git.try.aheadBehind(base, 'HEAD')
  if (counts.ok && counts.value.behind === 0) return { status: 'up-to-date' }

  const submodulesBefore = submoduleState(git, opts.worktree, settings)
  if (submodulesBefore !== null) {
    const reason = populateSubmodules(git)
    if (reason !== null) return { status: 'failed', reason, unrecorded: true }
  }

  let strategy = target.strategy
  let rebased: Integrated | null = null
  let strategyFallback: string | undefined
  let rebaseRepaired: Repaired[] = []
  const rerere = opts.cache?.on === true
  if (strategy === 'rebase') {
    const repairing = settings.onRebaseConflict === 'repair'
    const attempt = await rebaseThroughRungs(git, base, settings, runVerb, opts.worktree, {
      env: integrationEnv(rerere),
      rerere,
      cache: opts.cache,
      repair: repairing ? repairOf(settings, 'conflict', opts.apply) : null,
      maxRepairs: settings.maxRebaseStops ?? 3,
      target,
      // Each stop replays one commit. More stops than commits means git is
      // not making progress, and the loop would never end.
      maxStops: counts.ok ? counts.value.ahead + 1 : 1000,
      upstream: target.onto?.upstream ?? undefined,
    })
    // A rebase that failed or stopped emptied the cache (`reset`).
    if (attempt.kind === 'failed') {
      return attempt.unrecorded === true
        ? { status: 'failed', reason: attempt.reason, unrecorded: true }
        : { status: 'failed', reason: attempt.reason }
    }
    if (attempt.kind === 'done') {
      rebased = { resolved: attempt.resolved, replayed: attempt.replayed }
      rebaseRepaired = attempt.repaired
    } else if ((settings.onRebaseConflict ?? 'merge') !== 'merge') {
      return { status: 'conflict', needsHuman: attempt.needsHuman }
    } else {
      strategy = 'merge'
      const why = attempt.needsHuman.map((c) => `${c.path} (${c.why})`).join(', ')
      strategyFallback = `rebase stopped on ${why}; retried as a merge`
    }
  }

  let outcome: UpdateOutcome
  try {
    outcome = await integrateAndPush(
      git,
      { ...target, strategy },
      settings,
      runVerb,
      opts,
      rebased,
      submodulesBefore,
      rebaseRepaired,
    )
  } catch (e) {
    if (rerere) opts.cache?.clear()
    throw e
  }
  // Not pushed: failed, conflicted, or a push the person declined. No later PR replays what it
  // recorded, nor anything recorded before it.
  if (rerere && (outcome.status !== 'updated' || !outcome.pushed)) opts.cache?.clear()
  return strategyFallback === undefined || outcome.status === 'up-to-date'
    ? outcome
    : { ...outcome, strategyFallback }
}

/** What resolved a finished rebase's or merge's conflicts: its plans, and what rerere replayed. */
interface Integrated {
  resolved: PathPlan[]
  replayed: string[]
}

type RebaseAttempt =
  | ({ kind: 'done'; repaired: Repaired[] } & Integrated)
  | { kind: 'stuck'; needsHuman: { path: string; why: string }[] }
  | { kind: 'failed'; reason: string; unrecorded?: true }

/** The request for a repair of unclaimed conflicts, at a rebase stop when `replaying` is set. */
function conflictRequest(
  target: UpdateTarget,
  worktree: string,
  needsHuman: readonly { path: string; why: string }[],
  replaying?: RepairRequest['replaying'],
): RepairRequest {
  const why = needsHuman.map((c) => `${c.path} (${c.why})`).join(', ')
  return {
    kind: 'conflict',
    pr: target.number,
    base: target.base,
    head: target.head,
    worktree,
    paths: needsHuman.map((c) => c.path),
    reason: `unclaimed conflicts: ${why}`,
    ...(replaying === undefined ? {} : { replaying }),
  }
}

/**
 * Replay the branch onto `base`, running the fixed resolvers at every stop.
 *
 * Generated files tend to conflict on every commit that touches them. Clearing
 * only the first stop would leave exactly those files failing at the second.
 * A stop the resolvers cannot clear is repaired when `limits.repair` is set,
 * for at most `limits.maxRepairs` stops. Otherwise, or past that cap, it
 * aborts the rebase, leaves the worktree clean, and returns `stuck` for the
 * caller to merge or report.
 */
async function rebaseThroughRungs(
  git: Git,
  base: string,
  settings: UpdateSettings,
  runVerb: RunVerb,
  worktree: string,
  limits: {
    /** The git environment of the rebase and each `--continue` ({@link integrationEnv}). */
    env: Record<string, string>
    /** Whether `env` turns rerere on. */
    rerere: boolean
    /** The cache `rerere` uses, emptied when the rebase does not finish. */
    cache?: RerereCache | undefined
    maxStops: number
    upstream?: string | undefined
    repair: Repair | null
    maxRepairs: number
    target: UpdateTarget
  },
): Promise<RebaseAttempt> {
  // However this ends, leave a clean tree on the branch, because the fallback
  // merge runs in this same worktree. A rebase that does not finish keeps none of the resolutions
  // it recorded at `--continue`, nor a rejected repair's, so the cache is emptied; when it cannot
  // be, the fallback merge runs without rerere (`cache.on`).
  const reset = (): void => {
    git.try.rebaseAbort({ env: limits.env })
    if (limits.rerere) limits.cache?.clear()
    git.try.resetHard('HEAD')
    git.clean({ directories: true, nested: true })
  }
  const failed = (reason: string, unrecorded = false): RebaseAttempt => {
    reset()
    return unrecorded ? { kind: 'failed', reason, unrecorded } : { kind: 'failed', reason }
  }

  const resolved: PathPlan[] = []
  const replayed: string[] = []
  const repaired: Repaired[] = []
  let outcome
  try {
    outcome = git.rebase(base, {
      autostash: false,
      env: limits.env,
      // Without a known old parent head, let git look for it in the reflog.
      ...(limits.upstream === undefined ? { forkPoint: true } : { upstream: limits.upstream }),
    })
  } catch (e) {
    return failed(`rebase ${base}: ${errorLine(e)}`)
  }
  try {
    for (let stops = 0; outcome.status === 'conflict'; stops += 1) {
      if (stops >= limits.maxStops)
        return failed(`rebase ${base}: no progress after ${stops} stops`)
      const stop = planStop(git, settings, worktree, limits.rerere ? outcome : null)
      const { plans } = stop
      const needsHuman = withGitlinkCommits(git, unclaimed(plans), true)
      const stuck = (humans: { path: string; why: string }[]): RebaseAttempt => {
        reset()
        // The repaired stops are discarded with the rebase; say they happened.
        const done =
          repaired.length === 0 ? '' : ` (after ${repaired.length} repaired stop(s), discarded)`
        return { kind: 'stuck', needsHuman: humans.map((h) => ({ ...h, why: h.why + done })) }
      }
      if (
        needsHuman.length > 0 &&
        (limits.repair === null || repaired.length >= limits.maxRepairs)
      ) {
        return stuck(needsHuman)
      }
      const failure = rebuild(git, plans, settings, runVerb, worktree)
      if (failure !== null) return failed(failure)
      if (needsHuman.length > 0 && limits.repair !== null) {
        const sha = git.resolveRef('REBASE_HEAD')
        const res = await tryRepair(
          git,
          limits.repair,
          conflictRequest(
            limits.target,
            worktree,
            needsHuman,
            sha === null ? undefined : { sha, subject: git.logSubject(sha) ?? '', onto: base },
          ),
        )
        if (!res.ok) return stuck(needsHuman.map((c) => ({ path: c.path, why: res.reason })))
        repaired.push({ kind: 'conflict', note: res.note })
      }
      const stale = syncSubmodulesToIndex(git, worktree, settings)
      if (stale !== null) return failed(stale, true)
      try {
        // `.`, not only the conflicted paths. A generator can rewrite files
        // beyond the ones that conflicted, and leaving those unstaged would
        // continue with a half-regenerated tree. This is safe because the
        // worktree is temporary and holds nothing but this integration.
        git.add(['.'])
        outcome = git.rebaseContinue({ env: limits.env })
      } catch (e) {
        return failed(`continuing the rebase: ${errorLine(e)}`)
      }
      resolved.push(...plans)
      for (const path of stop.replayed) if (!replayed.includes(path)) replayed.push(path)
    }
  } catch (e) {
    // A throw (a generator's, say) still abandons the rebase and drops what its earlier stops
    // recorded at `--continue`, then goes on as a throw. A reset that fails must not hide it.
    try {
      reset()
    } catch {
      // The throw below says what went wrong first.
    }
    throw e
  }
  return { kind: 'done', resolved, replayed, repaired }
}

/** The repair for `kind`, or null: a rehearsal, no repair, or `kind` not in `repairOn`. */
function repairOf(settings: UpdateSettings, kind: RepairKind, apply: boolean): Repair | null {
  return apply && settings.repair !== undefined && (settings.repairOn ?? []).includes(kind)
    ? settings.repair
    : null
}

/** Title of the merge commit, clean or repaired: names the PR's branches. */
function mergeTitle(target: UpdateTarget): string {
  return `Merge ${target.base} into ${target.head}`
}

/**
 * Finish an update whose rebase is already done (`rebased`) or merge the base
 * in now, then verify and push.
 */
async function integrateAndPush(
  git: Git,
  target: UpdateTarget,
  settings: UpdateSettings,
  runVerb: RunVerb,
  opts: UpdateOneOptions,
  rebased: Integrated | null,
  submodulesBefore: string | null,
  rebaseRepaired: Repaired[] = [],
): Promise<UpdateOutcome> {
  const base = baseRef(target, settings.remote)
  const head = `${settings.remote}/${target.head}`
  const rerere = opts.cache?.on === true
  const env = integrationEnv(rerere)

  let outcome
  if (rebased === null) {
    try {
      // The merge runs on a temporary local branch, so git's default title
      // would name that branch. Name the PR's own branches instead.
      const baseSha = git.resolveRef(base)
      outcome = git.merge(base, {
        message:
          mergeTitle(target) + (baseSha === null ? '' : `\n\nBase: ${target.base} at ${baseSha}`),
        env,
      })
    } catch (e) {
      git.try.mergeAbort({ env })
      return { status: 'failed', reason: `merge ${base}: ${errorLine(e)}` }
    }
  }

  // A repair edits files with no undo, so a rehearsal never calls one.
  const repairFor = (kind: RepairKind): Repair | null => repairOf(settings, kind, opts.apply)
  const repaired: Repaired[] = [...rebaseRepaired]
  const fail = (reason: string, unrecorded = false, verifyLog?: string): UpdateOutcome => {
    git.try.mergeAbort({ env })
    // A rebuild or repair can leave edits, intent-to-add entries and untracked
    // files, which the next PR's `add .` would otherwise pick up.
    git.try.resetHard('HEAD')
    git.clean({ directories: true, nested: true })
    return {
      status: 'failed',
      reason,
      ...(unrecorded ? { unrecorded } : {}),
      ...(verifyLog === undefined ? {} : { verifyLog }),
    }
  }
  const request = (kind: RepairKind, paths: readonly string[], reason: string): RepairRequest => ({
    kind,
    pr: target.number,
    base: target.base,
    head: target.head,
    worktree: opts.worktree,
    paths,
    reason,
  })

  const resolved: PathPlan[] = rebased?.resolved ?? []
  const replayed: string[] = rebased?.replayed ?? []
  if (outcome?.status === 'conflict') {
    const stop = planStop(git, settings, opts.worktree, rerere ? outcome : null)
    const { plans } = stop
    const needsHuman = withGitlinkCommits(git, unclaimed(plans), false)
    const repair = repairFor('conflict')
    if (needsHuman.length > 0 && repair === null) {
      git.try.mergeAbort({ env })
      return { status: 'conflict', needsHuman }
    }
    const failure = rebuild(git, plans, settings, runVerb, opts.worktree)
    if (failure !== null) return fail(failure)
    if (needsHuman.length > 0 && repair !== null) {
      const res = await tryRepair(git, repair, conflictRequest(target, opts.worktree, needsHuman))
      if (!res.ok) return fail(res.reason)
      repaired.push({ kind: 'conflict', note: res.note })
    }
    const stale = syncSubmodulesToIndex(git, opts.worktree, settings)
    if (stale !== null) return fail(stale, true)
    try {
      // See `rebaseThroughRungs` for why the pathspec is `.`.
      git.add(['.'])
      // rerere records the resolution here (see `integrationEnv`).
      git.commit({
        message: mergeTitle(target),
        body: resolutionBody(
          plans.some((p) => p.kind !== 'unclaimed'),
          repaired.length > 0,
          stop.replayed,
        ),
        // The project's checks belong to `verify:`, run once per PR under the
        // caller's control. Otherwise git would run the commit hooks here and
        // nowhere else, so whether they ran would depend on the strategy. The
        // rebase path turns hooks off the same way (see `targetGitEnv`).
        noVerify: true,
        env,
      })
    } catch (e) {
      return fail(`committing the resolution: ${errorLine(e)}`)
    }
    resolved.push(...plans.filter((p) => p.kind !== 'unclaimed'))
    replayed.push(...stop.replayed)
  }

  const submodulesAfter = submoduleState(git, opts.worktree, settings)
  if (submodulesAfter !== null && submodulesAfter !== submodulesBefore) {
    const reason = populateSubmodules(git)
    if (reason !== null) return fail(reason, true)
  }

  let verbs: readonly string[]
  try {
    const { verifyVerbs } = settings
    verbs =
      typeof verifyVerbs === 'function'
        ? await verifyVerbs(opts.worktree, target.number)
        : verifyVerbs
  } catch (e) {
    return fail(errorLine(e), e instanceof NothingDetectedError)
  }
  const verifyFailure = runVerify(verbs, runVerb, opts.worktree)
  if (verifyFailure !== null) {
    const repair = repairFor('verify-failed')
    if (repair === null) return fail(verifyFailure.summary, false, verifyFailure.log)
    const changed = git.try.diffNameOnly({ rangeArgs: [head, 'HEAD'] })
    const res = await tryRepair(
      git,
      repair,
      request('verify-failed', changed.ok ? changed.value : [], verifyFailure.detail),
    )
    if (!res.ok) return fail(res.reason, false, verifyFailure.log)
    repaired.push({ kind: 'verify-failed', note: res.note })
    try {
      commitRepair(git, target, res.note, env)
    } catch (e) {
      return fail(`committing the repair: ${errorLine(e)}`)
    }
    const again = runVerify(verbs, runVerb, opts.worktree)
    if (again !== null) return fail(`${again.summary} (after repair)`, false, again.log)
  }

  const built = git.resolveRef('HEAD')
  const builtOid = built === null ? {} : { builtOid: built }
  if (!opts.apply) return { status: 'updated', resolved, pushed: false, ...builtOid }

  const extra = {
    ...builtOid,
    ...(replayed.length > 0 ? { replayed } : {}),
    ...(repaired.length > 0 ? { repaired } : {}),
  }
  if (target.strategy === 'rebase' && settings.confirmPush !== undefined) {
    let preview
    try {
      preview = pushPreview(git, target, head)
    } catch (e) {
      return { status: 'failed', reason: `push preview ${target.head}: ${errorLine(e)}` }
    }
    // A prompt that fails says nothing about the PR, so it must not count as
    // a failed update.
    let declined: string | null
    try {
      declined = settings.confirmPush(preview) ? null : 'push declined'
    } catch (e) {
      declined = `push not confirmed: ${errorLine(e)}`
    }
    if (declined !== null) {
      return { status: 'updated', resolved, pushed: false, declined, ...extra }
    }
  }

  let pushedOid: string | null = null
  let report: PushReport
  try {
    pushedOid = git.resolveRef('HEAD')
    report = pushUpdate(git, target, settings)
  } catch (e) {
    return { status: 'failed', reason: `push ${target.head}: ${errorLine(e)}` }
  }
  const rejected = report.refs.find(
    (r): r is Extract<PushRefResult, { flag: '!' }> => r.flag === '!',
  )
  if (rejected !== undefined) {
    // The ref's own lock line, else the remote's first message (a hook's reason).
    const said = rejected.detail ?? remoteLine(report.stderr)
    const why = [rejected.rawReason ?? rejected.summary, said]
      .filter((part) => part !== null && part !== '')
      .join(': ')
    const reason = isStalePush(rejected.rejection)
      ? `push rejected — ${target.head} moved since the run started; re-run`
      : `push ${target.head}: rejected (${why})`
    return { status: 'failed', reason }
  }
  return {
    status: 'updated',
    resolved,
    pushed: true,
    ...(pushedOid === null ? {} : { pushedOid }),
    ...extra,
  }
}

function pushPreview(git: Git, target: UpdateTarget, remoteHead: string): PushPreview {
  return {
    number: target.number,
    head: target.head,
    base: target.base,
    commits: git.logLines({ range: `${remoteHead}..HEAD`, format: '%h %s' }),
    replaced: git.aheadBehind(remoteHead, 'HEAD').behind,
    diffstat: git.diffStat({ rangeArgs: [remoteHead, 'HEAD'] }).trimEnd(),
  }
}

/**
 * Push the work branch onto the PR's own branch.
 *
 * A rebase rewrote history, so it needs `--force-with-lease` pinned to the sha
 * seen at the start of the run. A bare `--force-with-lease` is not enough. It
 * compares against the remote-tracking ref this process just fetched, which a
 * push by someone else during the run would have updated. Pinning to the sha
 * seen at the start makes the lease mean "nobody has changed this since the
 * run looked".
 *
 * Without a known sha there is nothing to pin to. A force-push with no lease
 * should not be done on someone's behalf, so it is refused.
 *
 * A rejected ref comes back in the report, typed, rather than as a throw. A
 * failure that reaches no ref (auth, network, a local hook) still throws.
 */
function pushUpdate(git: Git, target: UpdateTarget, settings: UpdateSettings): PushReport {
  const refspec = `HEAD:refs/heads/${target.head}`
  if (target.strategy !== 'rebase') return git.push(settings.remote, refspec)
  if (target.headOid === null) {
    throw new Error(`refusing to force-push ${target.head} without a known head sha to pin to`)
  }
  return git.push(settings.remote, refspec, {
    forceWithLease: { ref: `refs/heads/${target.head}`, expect: target.headOid },
  })
}

/**
 * Run each rebuild verb and generator the plan needs. Returns a reason on
 * failure, or null on success. The caller aborts on a reason.
 */
function rebuild(
  git: Git,
  plans: readonly PathPlan[],
  settings: UpdateSettings,
  runVerb: RunVerb,
  worktree: string,
): string | null {
  // Give the rebuild a tree it can read. A file with conflict markers is not
  // valid input to a generator or a package manager. Either side works,
  // because the rebuild overwrites the content. `--ours` is the side already
  // on the branch.
  const paths = plans.filter((p) => p.kind !== 'unclaimed').map((p) => p.path)
  if (paths.length > 0) {
    try {
      git.checkoutSide('ours', paths)
    } catch (e) {
      return `staging conflicted paths: ${errorLine(e)}`
    }
  }

  for (const verb of rebuildVerbs(plans)) {
    const res = runVerb(verb, worktree)
    if (res.exitCode !== 0) return `resolver \`${verb}\` failed: ${firstLine(stderrOrError(res))}`
  }
  for (const name of generatorNames(plans)) {
    const res = settings.generators?.find((g) => g.name === name)?.run(worktree)
    if (res === undefined || res.exitCode !== 0) {
      return `generator \`${name}\` failed: ${res === undefined ? '' : firstLine(stderrOrError(res))}`
    }
  }
  return null
}

/** The last non-blank line of `text`, trimmed, or `''` when there is none. */
function lastLine(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  return lines[lines.length - 1] ?? ''
}

/** Run the verify verbs in order. Returns the first failure, or null when all pass. */
function runVerify(
  verbs: readonly string[],
  runVerb: RunVerb,
  worktree: string,
): { summary: string; detail: string; log: string } | null {
  for (const verb of verbs) {
    const res = runVerb(verb, worktree)
    if (res.exitCode !== 0) {
      const stderr = res.stderr || res.error || ''
      const output = `${res.stdout}\n${stderr}`.trim()
      // A command that writes only to stdout, as many test runners do, ends with its summary.
      const why = firstLine(stderr) || lastLine(res.stdout) || `exit status ${res.exitCode}`
      return {
        summary: `verify \`${verb}\` failed: ${why}`,
        // The tail, where test runners print their summary.
        detail: `verify \`${verb}\` failed:\n${output.slice(-4000)}`,
        log: `$ ${verb}\nexit status: ${res.exitCode}\n\n${output}\n`,
      }
    }
  }
  return null
}

/**
 * The environment every git call in a target gets. The config is set after what `parent` holds
 * (typed-git's `gitConfigEnv`), so neither the repository's config nor an inherited
 * `GIT_CONFIG_PARAMETERS` (a parent git's `-c`) wins over it:
 * - `core.hooksPath=/dev/null`, hooks off: commit hooks because the project's checks belong to
 *   `verify:`, and every hook in a worktree that holds a PR's files;
 * - `rerere.enabled=false`: git's rerere neither replays nor records, whatever the repository's
 *   config says, and even where an `rr-cache/` exists, which git otherwise takes as on. Only the
 *   integration in a managed clone turns it back on (`integrationEnv`);
 * - `maintenance.auto=false` and `gc.auto=0` (`NO_MAINTENANCE`): no git pr-update runs starts a
 *   background maintenance or `gc`, which in a managed clone would write and remove files after
 *   the clone's lock is let go. A clone's own config says the same; this keeps an inherited `-c`
 *   from turning it back on. A clone's foreground maintenance passes its own `-c`, which git reads
 *   later still (`maintainClone`). In a located checkout, the person's own git commands still run
 *   git's `gc --auto`.
 *
 * `PATH` is `parent`'s with only its absolute entries (command-seam's `absolutePathEntries`), the
 * ones the git runner itself is found on. git looks programs up on `PATH` from the folder it runs
 * in, a run worktree holding the PR's files: `ssh` for a fetch or push over ssh, a `!` credential
 * helper such as `gh auth setup-git`'s, `gpg` to sign. With `.` on `PATH`, any of them could be a
 * file the PR commits. An unset `PATH` stays unset.
 *
 * `extra` is more config, set after the rest. A call that needs more than the client's settings
 * passes the whole set, since a call's `env` replaces the client's variables one by one.
 */
export function targetGitEnv(
  parent: Record<string, string | undefined> = process.env,
  extra: readonly (readonly [key: string, value: string])[] = [],
): Record<string, string> {
  const env = gitConfigEnv(
    [['core.hooksPath', '/dev/null'], ['rerere.enabled', 'false'], ...NO_MAINTENANCE, ...extra],
    parent,
  )
  const path = absolutePathEntries(pathOf(parent))
  return path === undefined ? env : { ...env, PATH: path }
}

/** Whether `updateAll` uses git's rerere: `apply`, and `UpdateSettings.rerere`. */
function rerereOn(settings: UpdateSettings, apply: boolean): boolean {
  return apply && settings.rerere === true
}

/**
 * The environment of the git calls that integrate the base and record a resolution: the rebase
 * and each `--continue`, the merge, its abort and its resolution commit. `targetGitEnv`, which
 * turns rerere off, with rerere turned back on when `rerere` is set, whatever the repository's
 * own config says.
 *
 * On, which `updateAll` asks for only in a managed clone, where pr-update owns `rr-cache/`, and
 * only while it holds the clone's rerere lock (`./rerere.ts`):
 * - `rerere.enabled=true`: at a conflict git replays a resolution recorded earlier in this run
 *   for the same conflict, and at `--continue` or the commit it records the one pr-update made.
 *   So sibling PRs that meet one conflict, or later stops of one rebase, need it resolved once,
 *   by a resolver or a repair, not once each. The cache lives for one run (`./rerere.ts`).
 * - `rerere.autoUpdate=false`: a replayed path stays conflicted in the index, with the replayed
 *   content in the worktree, so the run can tell which paths were replayed (`replayedPaths`),
 *   report them, and still rebuild a path a resolver claims. `add .` stages the rest.
 *
 * Off, the `rerere.enabled=false` of `targetGitEnv`: in the project root and a located checkout,
 * the person's own `rr-cache/` and rerere config are never used, and no `rr-cache/` is made
 * there. A rehearsal records nothing, so it is off everywhere, and may report a conflict that an
 * `--apply` run in a clone clears with a resolution recorded earlier in that run.
 */
function integrationEnv(rerere: boolean): Record<string, string> {
  return targetGitEnv(
    process.env,
    rerere
      ? [
          ['rerere.enabled', 'true'],
          ['rerere.autoUpdate', 'false'],
        ]
      : [],
  )
}

/**
 * The plan for the conflicts git stopped on: every conflicted path git reports, given to the
 * resolvers, less the paths rerere replayed that no resolver claims (`replayed`, in git's order).
 * A replayed path a resolver claims stays in `plans` and is rebuilt, so a generator's output is
 * never left to an old replay. `stopped` is the merge, rebase or `--continue` outcome that
 * stopped here, when rerere is on.
 */
function planStop(
  git: Git,
  settings: UpdateSettings,
  worktree: string,
  stopped: { status: 'conflict'; rerereReplayed?: string[] | undefined } | null,
): { plans: PathPlan[]; replayed: string[] } {
  const paths = conflictedPaths(git)
  const replays = new Set(stopped === null ? [] : replayedPaths(paths, worktree, stopped))
  const plans = planPaths(
    paths,
    settings.resolvers,
    settings.lockfileInstall,
    settings.generators,
  ).filter((p) => !(p.kind === 'unclaimed' && replays.has(p.path)))
  const replayed = paths.filter((p) => replays.has(p) && !plans.some((q) => q.path === p))
  return { plans, replayed }
}

/**
 * Which of the conflicted `paths` git's rerere replayed a recorded resolution into. Only a path
 * git itself says it replayed counts: the command that stopped here printed `Resolved '<path>'
 * using previous resolution.` (typed-git's `rerereReplayed`, read under `LC_ALL=C`). With
 * `rerere.autoUpdate=false` a replayed path stays conflicted in the index and leaves `MERGE_RR`,
 * so neither tells it apart. Nor does `git rerere remaining`: a conflict rerere never tracks, a
 * binary file or one `.gitattributes` marks `-merge`, is missing from it too, has no markers, and
 * would be taken for a replay and pushed as it was left.
 *
 * A named path whose file still holds conflict markers is not counted, nor one holding a newline
 * (git prints the path unquoted).
 */
function replayedPaths(
  paths: readonly string[],
  worktree: string,
  stopped: { rerereReplayed?: string[] | undefined },
): string[] {
  const named = new Set(stopped.rerereReplayed ?? [])
  return paths.filter(
    (p) => named.has(p) && !p.includes('\n') && !hasConflictMarkers(join(worktree, p)),
  )
}

/** The body of a merge commit that resolved conflicts: what resolved them. */
function resolutionBody(rebuilt: boolean, repaired: boolean, replayed: readonly string[]): string {
  const by = [
    ...(rebuilt ? ['rebuilding the generated artifacts'] : []),
    ...(repaired ? ['the repair'] : []),
    ...(replayed.length > 0
      ? [`git rerere, from a resolution recorded earlier (${replayed.join(', ')})`]
      : []),
  ]
  if (by.length === 0) return 'Conflicts resolved.'
  const last = by.pop()!
  return `Conflicts resolved by ${by.length === 0 ? last : `${by.join(', ')} and ${last}`}.`
}

/** `PATH` in `env`, which Windows names in any case (`Path`). */
function pathOf(env: Record<string, string | undefined>): string | undefined {
  if (process.platform !== 'win32') return env.PATH
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH')
  return key === undefined ? undefined : env[key]
}

/**
 * The git options for a checkout other than the project root, which is someone else's, and for
 * every run worktree and kept tree, the project root's included, which hold a PR's files: hooks
 * and background maintenance off and only the absolute `PATH` entries (`targetGitEnv`), and
 * `runner` with `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and the other variables that pick a
 * repository unset in each child (typed-git's `withoutRepositoryVars`). A run started from a git
 * hook, which exports `GIT_DIR`, then still acts on the target. Pass the `gh` runner to make the
 * git that `gh repo clone` runs ignore them too.
 */
export function targetGitOptions(runner?: CommandRunner): {
  runner: CommandRunner
  env: Record<string, string>
} {
  return { runner: withoutRepositoryVars(runner), env: targetGitEnv() }
}

/**
 * Each of typed-git's `REPOSITORY_VARS`, unset: the environment of every child a run starts in a
 * worktree it made (verify, resolvers, `lockfile_install`, a repair command or agent). With
 * `GIT_DIR` inherited from a git hook, a git the child runs in a linked worktree acts on the
 * repository `GIT_DIR` names, and can move its checked-out branch.
 */
export const UNSET_REPOSITORY_VARS: Readonly<Record<string, undefined>> = Object.freeze(
  Object.fromEntries(REPOSITORY_VARS.map((name) => [name, undefined])),
)

const CONFLICT_MARKER = /^(<{7}|>{7})( |$)/m

function hasConflictMarkers(file: string): boolean {
  return existsSync(file) && CONFLICT_MARKER.test(readFileSync(file, 'utf8'))
}

function refNames(git: Git): Set<string> {
  return new Set(git.forEachRef('refs', { format: '%(refname)' }))
}

/** Each changed or untracked path, with a hash of its content (empty when deleted). */
function dirtyFiles(git: Git, worktree: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const { path } of git.statusEntries()) {
    const file = join(worktree, path)
    const hash = existsSync(file) ? createHash('sha1').update(readFileSync(file)).digest('hex') : ''
    out.set(path, hash)
  }
  return out
}

/** Paths whose content differs between two {@link dirtyFiles} snapshots. */
function touchedSince(before: Map<string, string>, after: Map<string, string>): string[] {
  const touched = [...after].filter(([path, hash]) => before.get(path) !== hash).map(([p]) => p)
  return [...touched, ...[...before.keys()].filter((p) => !after.has(p))]
}

/**
 * Call the repair once, then reject it if it broke the {@link Repair} contract
 * or left conflict markers or `git diff --check` errors behind.
 */
async function tryRepair(
  git: Git,
  repair: Repair,
  req: RepairRequest,
): Promise<{ ok: true; note: string } | { ok: false; reason: string }> {
  const headBefore = git.resolveRef('HEAD')
  const refsBefore = refNames(git)
  const dirtyBefore = dirtyFiles(git, req.worktree)
  // What a rejected repair's own git commands recorded in a clone's cache is cleared with the
  // PR's failure (`RerereCache.clear`).
  let res: RepairResult
  try {
    res = await repair(req)
  } catch (e) {
    return { ok: false, reason: `repair (${req.kind}) threw: ${errorLine(e)}` }
  }
  const rejected = (why: string): { ok: false; reason: string } => {
    return {
      ok: false,
      reason: `repair (${req.kind}) ${why}${res.note === '' ? '' : ` — ${res.note}`}`,
    }
  }

  const headAfter = git.resolveRef('HEAD')
  if (headAfter !== headBefore) {
    return rejected(`moved HEAD from ${headBefore ?? 'nothing'} to ${headAfter ?? 'nothing'}`)
  }
  const created = [...refNames(git)].filter((r) => !refsBefore.has(r))
  if (created.length > 0) return rejected(`created refs: ${created.join(', ')}`)
  if (!res.ok) return rejected('gave up')
  // Only what the repair wrote. Output from a rebuild that ran earlier is not its fault.
  const touched = [
    ...new Set([...req.paths, ...touchedSince(dirtyBefore, dirtyFiles(git, req.worktree))]),
  ]
  if (touched.length === 0) return { ok: true, note: res.note }
  // A file that already had marker-like lines at HEAD (a fixture, a doc) is
  // not a conflict the repair left behind. Only a `conflict` repair is
  // responsible for such files. HEAD is the commit before the repair (checked
  // unmoved above).
  const markedAtHead = (p: string): boolean => {
    const content = git.showAtRev('HEAD', p)
    return content !== null && CONFLICT_MARKER.test(content)
  }
  const marked = touched.filter(
    (p) =>
      hasConflictMarkers(join(req.worktree, p)) && (req.kind === 'conflict' || !markedAtHead(p)),
  )
  if (marked.length > 0) return rejected(`left conflict markers in ${marked.join(', ')}`)
  // Intent-to-add puts new files in `git diff`, so `--check` sees them too.
  const untracked = git.lsFiles({ others: true, excludeStandard: true, paths: touched })
  if (untracked.length > 0) git.add(untracked, { intentToAdd: true })
  const check = git.diffCheck({ paths: touched })
  if (!check.ok) return rejected(`left \`git diff --check\` errors: ${firstLine(check.output)}`)
  return { ok: true, note: res.note }
}

/**
 * Commit what a `verify-failed` repair changed, on top of the update. `env` is the run's
 * `integrationEnv`, so outside a clone this commit, like the others, runs with rerere off.
 */
function commitRepair(
  git: Git,
  target: UpdateTarget,
  note: string,
  env: Record<string, string>,
): void {
  git.add(['.'])
  // A repair that changed nothing (for a flaky check, say) still gets its re-run.
  if (git.diffNameOnly({ cached: true }).length === 0) return
  git.commit({
    message: `Fix verify after updating ${target.head} onto ${target.base}`,
    body: note === '' ? 'Changes made by the pr-update repair.' : note,
    noVerify: true,
    env,
  })
}

/** One PR's outcome as a short line for a report. */
export function describeOutcome(o: UpdateOutcome): string {
  switch (o.status) {
    case 'up-to-date':
      return 'already up to date'
    case 'updated': {
      if (o.declined !== undefined) return o.declined
      if (!o.pushed) return 'would update'
      const notes = [
        ...(o.strategyFallback !== undefined ? ['rebase fell back to merge'] : []),
        ...(o.resolved.length > 0 ? [`resolved ${o.resolved.length}`] : []),
        ...(o.replayed !== undefined && o.replayed.length > 0
          ? [`replayed ${o.replayed.length} by rerere`]
          : []),
        ...(o.repaired ?? []).map((r) => `repaired ${r.kind}`),
      ]
      return `updated${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`
    }
    case 'conflict':
      return `needs a human: ${o.needsHuman.map((c) => `${c.path} (${c.why})`).join(', ')}`
    case 'failed':
      return o.reason
  }
}

/**
 * `updateAll`'s hold on a managed clone whose lock the run took before the survey
 * (`ManagedClones.provide`).
 * - `added` lets the lock go once the run worktree is recorded in the clone, so the lock covers
 *   the survey's fetch, the removal of a killed run's worktree and `worktree add`.
 * - `keeping` takes it back to keep a failed PR's run worktree, `worktree`, where it is and add
 *   the run a new one (`ManagedClones.keeping`); false, with nothing done, when it cannot be had.
 * - `removing` takes it back to remove the run worktree `worktree` and its scratch branch, and
 *   leaves both, with a note, when it cannot be had (`ManagedClones.removing`).
 *
 * Taking it back waits only in `update --apply` and only when the run holds no other clone's
 * lock.
 */
export interface CloneLock {
  added: () => void
  keeping: (worktree: string, keep: () => void) => boolean
  removing: (worktree: string, remove: () => void) => void
}

/**
 * A new run worktree path beside `root`, for the run to go on in after `root` is kept: the
 * `<pid>.<time>` of this process now, so a prune reads it as this run's, one later when that is
 * taken. A `root` of another shape (a test's) gets `-<n>` added instead.
 */
function nextRunRoot(root: string): string {
  const dir = dirname(root)
  if (!/^\d+\.\d+$/.test(basename(root))) {
    let n = 1
    while (existsSync(`${root}-${n}`)) n += 1
    return `${root}-${n}`
  }
  let at = Math.max(Date.now(), Number(basename(root).split('.')[1]) + 1)
  while (existsSync(join(dir, `${process.pid}.${at}`))) at += 1
  return join(dir, `${process.pid}.${at}`)
}

/**
 * Update a list of PRs in one temporary worktree.
 *
 * `targets` must already be in dependency order (the survey's topological
 * sort), because a stack updated child first is work that gets redone.
 *
 * The worktree is created detached at the first target's base and removed in
 * a `finally`, so an exception anywhere still leaves no stray checkout and no
 * registered worktree. The scratch branch is deleted with it.
 */
export async function updateAll(
  git: Git,
  targets: readonly UpdateTarget[],
  settings: UpdateSettings,
  runVerb: RunVerb,
  opts: {
    apply: boolean
    worktreeRoot: string
    onResult?: (r: UpdateResult) => void
    /**
     * Receives each PR left alone because another run holds its branch's lease, or, under
     * `skipOnLeaseError`, because the lease could not be taken.
     */
    onSkip?: (s: { repo: string; number: number; head: string; reason: string }) => void
    /**
     * When the lease cannot be taken (its remote refuses the ref, say), skip that PR with the
     * error as the reason and go on, instead of ending the run. Set for a target other than the
     * project root, whose record lives on its own remote.
     */
    skipOnLeaseError?: boolean | undefined
    /**
     * Which worktrees of `git`'s repository the run may clean up, and how it forgets one it
     * removed. Defaults to {@link PRUNE_ALL}, the project root's way.
     */
    records?: WorktreeRecords | undefined
    /**
     * Called before each target, with the results so far: the target to
     * run, possibly adjusted, or null to leave it out. A restack run uses it
     * to integrate a child onto the head its parent just got, or to hold the
     * child back when the parent was not updated.
     */
    prepare?: (target: UpdateTarget, done: readonly UpdateResult[]) => UpdateTarget | null
    /**
     * Set to keep the worktree of a PR that ended `conflict` or `failed` where it is, as evidence,
     * with its record in `place` (see `./kept.ts`). The run goes on in a new one beside it.
     */
    keepFailed?: { place: KeptPlace }
    /** Set when `git`'s repository is a managed clone whose lock the run holds (see {@link CloneLock}). */
    lock?: CloneLock | undefined
  },
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = []
  if (targets.length === 0) return results

  const records = opts.records ?? PRUNE_ALL
  releaseStaleScratch(git, records)
  // Under the clone's lock, before anything here integrates: no PR replays what a killed run, or
  // an earlier one, recorded.
  // Taken while the run still holds the clone's lock: no PR replays what a killed run, or an
  // earlier one, recorded, nor what a run that holds the cache now records.
  const cache = rerereOn(settings, opts.apply) ? takeRerere(git) : null
  const start = `${settings.remote}/${targets[0]!.base}`
  // The folders above the worktree are made here, not by git, which would make them under the
  // umask: a prune refuses a folder someone else can write to.
  mkdirSync(dirname(opts.worktreeRoot), { recursive: true, mode: FOLDER_MODE })
  git.worktreeAdd(opts.worktreeRoot, { detach: true, startPoint: start })
  opts.lock?.added()
  // The run's worktree now: a new one after each PR kept in the one before.
  let root = opts.worktreeRoot
  let wt = git.at(root)
  // Whether `root` is still the run's to remove: a kept tree is not, once its keep succeeded.
  let ownsRoot = true
  // Set when no run worktree is left to go on in: the rest of the PRs are not attempted.
  let stopped = false
  try {
    for (const planned of targets) {
      // The host was signalled and is stopping: update no further PR.
      if (forwardedSignal() !== undefined) break
      const target = opts.prepare === undefined ? planned : opts.prepare(planned, results)
      if (target === null) continue
      // A rehearsal never takes a lease: it pushes nothing.
      let grant
      try {
        grant = opts.apply
          ? settings.lease?.acquire({ head: target.head, pr: target.number })
          : undefined
      } catch (e) {
        if (opts.skipOnLeaseError !== true) throw e
        opts.onSkip?.({
          repo: target.repo,
          number: target.number,
          head: target.head,
          reason: errorLine(e),
        })
        continue
      }
      if (grant !== undefined && !grant.ok) {
        opts.onSkip?.({
          repo: target.repo,
          number: target.number,
          head: target.head,
          reason: `another pr-update run is updating this branch (${grant.holder})`,
        })
        continue
      }
      let outcome: UpdateOutcome
      try {
        outcome = await updateOneIn(wt, target, settings, runVerb, {
          apply: opts.apply,
          worktree: root,
          cache: cache ?? undefined,
        })
      } finally {
        grant?.release()
      }
      const ran = 'strategyFallback' in outcome ? 'merge' : target.strategy
      const result: UpdateResult = { ...target, strategy: ran, outcome }
      const place = opts.keepFailed?.place
      if (
        place !== undefined &&
        (outcome.status === 'conflict' || (outcome.status === 'failed' && !outcome.unrecorded))
      ) {
        // The keep and the new run worktree are one change to the clone: a prune between them
        // would find no run worktree and could remove the clone.
        const kept = root
        const keep = (): void => {
          try {
            result.keptWorktree = keepWorktree(
              git,
              place,
              kept,
              target,
              outcome.status === 'failed' ? outcome.verifyLog : undefined,
            ).path
          } catch (e) {
            result.keepError = errorLine(e)
            return
          }
          // The kept tree is the record's now, never the run's to clean up, and its scratch
          // branch is free to go.
          ownsRoot = false
          git.try.deleteBranch(scratchBranch(kept), { force: true })
          const next = nextRunRoot(kept)
          try {
            git.worktreeAdd(next, { detach: true, startPoint: start })
          } catch (e) {
            result.keepError =
              `kept at ${kept}, but the next run worktree could not be added (${errorLine(e)}), ` +
              "so the run's other PRs in this repository were not updated"
            stopped = true
            return
          }
          root = next
          wt = git.at(root)
          ownsRoot = true
        }
        if (opts.lock === undefined) keep()
        else if (!opts.lock.keeping(kept, keep)) {
          result.keepError = "mirror busy: another pr-update run holds the clone's lock"
        }
      }
      results.push(result)
      // Reported as each PR finishes, not only at the end. A run over fifty
      // PRs takes minutes, and a caller showing progress needs each result.
      opts.onResult?.(result)
      if (stopped) break
    }
  } finally {
    // Order matters. The scratch branch is checked out in the worktree, and
    // git refuses to delete a branch a worktree holds. Removing the worktree
    // releases it. Each step uses `try`, so a failure in one still lets the
    // others run. A stray worktree is worse than a stray branch, and both are
    // worse than an exception here hiding the real one.
    const remove = (): void => {
      const left = removeWorktree(git, root, records)
      if (left !== undefined) {
        const last = results.at(-1)
        if (last !== undefined) last.worktreeLeft = left
        return
      }
      git.try.deleteBranch(scratchBranch(root), { force: true })
    }
    // When the run's last worktree was kept, nothing of the run's is left to remove.
    if (ownsRoot) {
      if (opts.lock === undefined) remove()
      else opts.lock.removing(root, remove)
    }
    // The cache lives for one run.
    cache?.release()
  }
  return results
}

/**
 * Remove a worktree that a killed run left holding a {@link WORK_BRANCH} branch, and the branch
 * itself. Without this, scratch branches and worktrees pile up. A worktree whose `<pid>.` name
 * prefix is a live process is left alone, since it belongs to a run still going, and so is one
 * `records` does not count as the run's. One git will not remove (a locked one) stays, and so
 * does its branch, which it has checked out.
 */
function releaseStaleScratch(git: Git, records: WorktreeRecords): void {
  const stale = git
    .worktrees()
    .filter(
      (w) =>
        w.branch?.startsWith(WORK_BRANCH) === true &&
        records.owns(w.path) &&
        !isAlive(Number(basename(w.path).split('.')[0])),
    )
  for (const w of stale) removeWorktree(git, w.path, records)
  for (const w of stale) if (w.branch) git.try.deleteBranch(w.branch, { force: true })
}

function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Run-level totals, for the closing line of a report. */
export function tally(results: readonly UpdateResult[]): Record<string, number> {
  const counts = { updated: 0, 'up-to-date': 0, conflict: 0, failed: 0 }
  for (const r of results) counts[r.outcome.status] += 1
  return counts
}
