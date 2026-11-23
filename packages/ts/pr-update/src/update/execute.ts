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
 * generators) run at every stop. A stop they cannot clear aborts the rebase,
 * and the PR is retried as a merge, which meets the same conflict once. Only
 * then is `repair` called, so an agent is never asked to fix twenty versions
 * of one conflict. The outcome records the change of strategy, so a reader
 * does not mistake the push for a rebase.
 *
 * With `on_rebase_conflict: repair`, a repository that refuses merges repairs
 * each stop instead, up to a cap, and never falls back to a merge.
 *
 * The caller decides the order. A stack must be updated parent first, because
 * updating a child before its parent is work that has to be redone as soon as
 * the parent moves.
 *
 * Nothing is written without `apply`. A dry run runs the same code, predicts
 * the same conflicts, and pushes nothing.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { firstLine, forwardedSignal, isCommandFailed, stderrOrError } from '@osdlc/command-seam'
import {
  CommandFailed,
  Git,
  type PushRefResult,
  type PushRejection,
  type PushReport,
} from '@osdlc/typed-git'

import { NothingDetectedError } from '../detect.ts'
import { keepWorktree, type KeptPlace } from './kept.ts'
import { PRUNE_ALL, removeWorktree, type WorktreeRecords } from './registrations.ts'
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
  /** Set when `keepFailed` moved this PR's worktree aside: its path. */
  keptWorktree?: string
  /** Set when `keepFailed` could not keep it: why. The outcome is unchanged. */
  keepError?: string
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
  opts: { apply: boolean; worktree: string },
): Promise<UpdateOutcome> {
  const base = baseRef(target, settings.remote)
  const head = `${settings.remote}/${target.head}`

  try {
    git.checkout(head, {
      branch: scratchBranch(opts.worktree),
      resetBranch: true,
      force: true,
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
  let rebased: PathPlan[] | null = null
  let strategyFallback: string | undefined
  let rebaseRepaired: Repaired[] = []
  if (strategy === 'rebase') {
    const repairing = settings.onRebaseConflict === 'repair'
    const attempt = await rebaseThroughRungs(git, base, settings, runVerb, opts.worktree, {
      repair: repairing ? repairOf(settings, 'conflict', opts.apply) : null,
      maxRepairs: settings.maxRebaseStops ?? 3,
      target,
      // Each stop replays one commit. More stops than commits means git is
      // not making progress, and the loop would never end.
      maxStops: counts.ok ? counts.value.ahead + 1 : 1000,
      upstream: target.onto?.upstream ?? undefined,
    })
    if (attempt.kind === 'failed') {
      return attempt.unrecorded === true
        ? { status: 'failed', reason: attempt.reason, unrecorded: true }
        : { status: 'failed', reason: attempt.reason }
    }
    if (attempt.kind === 'done') {
      rebased = attempt.resolved
      rebaseRepaired = attempt.repaired
    } else if ((settings.onRebaseConflict ?? 'merge') !== 'merge') {
      return { status: 'conflict', needsHuman: attempt.needsHuman }
    } else {
      strategy = 'merge'
      const why = attempt.needsHuman.map((c) => `${c.path} (${c.why})`).join(', ')
      strategyFallback = `rebase stopped on ${why}; retried as a merge`
    }
  }

  const outcome = await integrateAndPush(
    git,
    { ...target, strategy },
    settings,
    runVerb,
    opts,
    rebased,
    submodulesBefore,
    rebaseRepaired,
  )
  return strategyFallback === undefined || outcome.status === 'up-to-date'
    ? outcome
    : { ...outcome, strategyFallback }
}

type RebaseAttempt =
  | { kind: 'done'; resolved: PathPlan[]; repaired: Repaired[] }
  | { kind: 'stuck'; needsHuman: { path: string; why: string }[] }
  | { kind: 'failed'; reason: string; unrecorded?: true }

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

async function rebaseThroughRungs(
  git: Git,
  base: string,
  settings: UpdateSettings,
  runVerb: RunVerb,
  worktree: string,
  limits: {
    maxStops: number
    upstream?: string | undefined
    repair: Repair | null
    maxRepairs: number
    target: UpdateTarget
  },
): Promise<RebaseAttempt> {
  // However this ends, leave a clean tree on the branch, because the fallback
  // merge runs in this same worktree.
  const reset = (): void => {
    git.try.rebaseAbort()
    git.try.resetHard('HEAD')
    git.clean({ directories: true, nested: true })
  }
  const failed = (reason: string, unrecorded = false): RebaseAttempt => {
    reset()
    return unrecorded ? { kind: 'failed', reason, unrecorded } : { kind: 'failed', reason }
  }

  const resolved: PathPlan[] = []
  const repaired: Repaired[] = []
  let outcome
  try {
    outcome = git.rebase(base, {
      autostash: false,
      env: noHooksEnv(),
      // Without a known old parent head, let git look for it in the reflog.
      ...(limits.upstream === undefined ? { forkPoint: true } : { upstream: limits.upstream }),
    })
  } catch (e) {
    return failed(`rebase ${base}: ${errorLine(e)}`)
  }
  for (let stops = 0; outcome.status === 'conflict'; stops += 1) {
    if (stops >= limits.maxStops) return failed(`rebase ${base}: no progress after ${stops} stops`)
    const paths = conflictedPaths(git)
    // An empty list after a reported conflict means rerere replayed a
    // resolution recorded earlier in this run. The tree is already correct.
    const plans =
      paths.length === 0
        ? []
        : planPaths(paths, settings.resolvers, settings.lockfileInstall, settings.generators)
    const needsHuman = withGitlinkCommits(git, unclaimed(plans), true)
    const stuck = (humans: { path: string; why: string }[]): RebaseAttempt => {
      reset()
      // The repaired stops are discarded with the rebase; say they happened.
      const done =
        repaired.length === 0 ? '' : ` (after ${repaired.length} repaired stop(s), discarded)`
      return { kind: 'stuck', needsHuman: humans.map((h) => ({ ...h, why: h.why + done })) }
    }
    if (needsHuman.length > 0 && (limits.repair === null || repaired.length >= limits.maxRepairs)) {
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
      outcome = git.rebaseContinue({ env: noHooksEnv() })
    } catch (e) {
      return failed(`continuing the rebase: ${errorLine(e)}`)
    }
    resolved.push(...plans)
  }
  return { kind: 'done', resolved, repaired }
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
  opts: { apply: boolean; worktree: string },
  rebased: PathPlan[] | null,
  submodulesBefore: string | null,
  rebaseRepaired: Repaired[] = [],
): Promise<UpdateOutcome> {
  const base = baseRef(target, settings.remote)
  const head = `${settings.remote}/${target.head}`

  let outcome
  if (rebased === null) {
    try {
      // The merge runs on a temporary local branch, so git's default title
      // would name that branch. Name the PR's own branches instead.
      const baseSha = git.resolveRef(base)
      outcome = git.merge(base, {
        message:
          mergeTitle(target) + (baseSha === null ? '' : `\n\nBase: ${target.base} at ${baseSha}`),
      })
    } catch (e) {
      git.try.mergeAbort()
      return { status: 'failed', reason: `merge ${base}: ${errorLine(e)}` }
    }
  }

  // A repair edits files with no undo, so a rehearsal never calls one.
  const repairFor = (kind: RepairKind): Repair | null => repairOf(settings, kind, opts.apply)
  const repaired: Repaired[] = [...rebaseRepaired]
  const fail = (reason: string, unrecorded = false, verifyLog?: string): UpdateOutcome => {
    git.try.mergeAbort()
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

  const resolved: PathPlan[] = rebased ?? []
  if (outcome?.status === 'conflict') {
    const paths = conflictedPaths(git)
    // See `rebaseThroughRungs` for an empty list.
    const plans =
      paths.length === 0
        ? []
        : planPaths(paths, settings.resolvers, settings.lockfileInstall, settings.generators)
    const needsHuman = withGitlinkCommits(git, unclaimed(plans), false)
    const repair = repairFor('conflict')
    if (needsHuman.length > 0 && repair === null) {
      git.try.mergeAbort()
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
      git.commit({
        message: mergeTitle(target),
        body:
          repaired.length > 0
            ? 'Conflicts resolved by rebuilding the generated artifacts and the repair.'
            : 'Conflicts resolved by rebuilding the generated artifacts.',
        // The project's checks belong to `verify:`, run once per PR under the
        // caller's control. Otherwise git would run the commit hooks here and
        // nowhere else, so whether they ran would depend on the strategy. The
        // rebase path turns hooks off the same way (see `noHooksEnv`).
        noVerify: true,
      })
    } catch (e) {
      return fail(`committing the resolution: ${errorLine(e)}`)
    }
    resolved.push(...plans.filter((p) => p.kind !== 'unclaimed'))
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
      commitRepair(git, target, res.note)
    } catch (e) {
      return fail(`committing the repair: ${errorLine(e)}`)
    }
    const again = runVerify(verbs, runVerb, opts.worktree)
    if (again !== null) return fail(`${again.summary} (after repair)`, false, again.log)
  }

  const built = git.resolveRef('HEAD')
  const builtOid = built === null ? {} : { builtOid: built }
  if (!opts.apply) return { status: 'updated', resolved, pushed: false, ...builtOid }

  const extra = { ...builtOid, ...(repaired.length > 0 ? { repaired } : {}) }
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
      return {
        summary: `verify \`${verb}\` failed: ${firstLine(stderr)}`,
        // The tail, where test runners print their summary.
        detail: `verify \`${verb}\` failed:\n${output.slice(-4000)}`,
        log: `$ ${verb}\nexit status: ${res.exitCode}\n\n${output}\n`,
      }
    }
  }
  return null
}

/** Commit hooks off for one call, because the project's checks belong to `verify:`. */
export function noHooksEnv(
  parent: Record<string, string | undefined> = process.env,
): Record<string, string> {
  // Append to any GIT_CONFIG_* the parent already set instead of overwriting it.
  const parsed = Number.parseInt(parent.GIT_CONFIG_COUNT ?? '', 10)
  const i = Number.isInteger(parsed) && parsed > 0 ? parsed : 0
  return {
    GIT_CONFIG_COUNT: String(i + 1),
    [`GIT_CONFIG_KEY_${i}`]: 'core.hooksPath',
    [`GIT_CONFIG_VALUE_${i}`]: '/dev/null',
  }
}

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
  let res: RepairResult
  try {
    res = await repair(req)
  } catch (e) {
    return { ok: false, reason: `repair (${req.kind}) threw: ${errorLine(e)}` }
  }
  const rejected = (why: string): { ok: false; reason: string } => ({
    ok: false,
    reason: `repair (${req.kind}) ${why}${res.note === '' ? '' : ` — ${res.note}`}`,
  })

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

/** Commit what a `verify-failed` repair changed, on top of the update. */
function commitRepair(git: Git, target: UpdateTarget, note: string): void {
  git.add(['.'])
  // A repair that changed nothing (for a flaky check, say) still gets its re-run.
  if (git.diffNameOnly({ cached: true }).length === 0) return
  git.commit({
    message: `Fix verify after updating ${target.head} onto ${target.base}`,
    body: note === '' ? 'Changes made by the pr-update repair.' : note,
    noVerify: true,
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
     * Set to move the worktree of a PR that ended `conflict` or `failed` aside, into `place`,
     * for a person to pick up (see `./kept.ts`). The run goes on in a fresh one.
     */
    keepFailed?: { place: KeptPlace }
  },
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = []
  if (targets.length === 0) return results

  const records = opts.records ?? PRUNE_ALL
  releaseStaleScratch(git, records)
  const start = `${settings.remote}/${targets[0]!.base}`
  git.worktreeAdd(opts.worktreeRoot, { detach: true, startPoint: start })
  const wt = git.at(opts.worktreeRoot)
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
        outcome = await updateOne(wt, target, settings, runVerb, {
          apply: opts.apply,
          worktree: opts.worktreeRoot,
        })
      } finally {
        grant?.release()
      }
      const ran = 'strategyFallback' in outcome ? 'merge' : target.strategy
      const result: UpdateResult = { ...target, strategy: ran, outcome }
      if (
        opts.keepFailed !== undefined &&
        (outcome.status === 'conflict' || (outcome.status === 'failed' && !outcome.unrecorded))
      ) {
        try {
          result.keptWorktree = keepWorktree(
            git,
            opts.keepFailed.place,
            opts.worktreeRoot,
            target,
            outcome.status === 'failed' ? outcome.verifyLog : undefined,
          ).path
        } catch (e) {
          result.keepError = errorLine(e)
        }
        if (!existsSync(opts.worktreeRoot)) {
          records.forget(git, opts.worktreeRoot, false)
          git.worktreeAdd(opts.worktreeRoot, { detach: true, startPoint: start })
        }
      }
      results.push(result)
      // Reported as each PR finishes, not only at the end. A run over fifty
      // PRs takes minutes, and a caller showing progress needs each result.
      opts.onResult?.(result)
    }
  } finally {
    // Order matters. The scratch branch is checked out in the worktree, and
    // git refuses to delete a branch a worktree holds. Removing the worktree
    // releases it. Each step uses `try`, so a failure in one still lets the
    // others run. A stray worktree is worse than a stray branch, and both are
    // worse than an exception here hiding the real one.
    removeWorktree(git, opts.worktreeRoot, records)
    git.try.deleteBranch(scratchBranch(opts.worktreeRoot), { force: true })
  }
  return results
}

/**
 * Remove a worktree that a killed run left holding a {@link WORK_BRANCH} branch, and the branch
 * itself. Without this, scratch branches and worktrees pile up. A worktree whose `<pid>.` name
 * prefix is a live process is left alone, since it belongs to a run still going, and so is one
 * `records` does not count as the run's.
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
  if (records === PRUNE_ALL) {
    for (const w of stale) git.try.worktreeRemove(w.path, { force: true })
    if (stale.length > 0) git.try.worktreePrune()
  } else {
    for (const w of stale) removeWorktree(git, w.path, records)
  }
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
