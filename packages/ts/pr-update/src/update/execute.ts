/**
 * Bringing one PR up to date, and a run of them.
 *
 * The shape is dictated by two facts about updating many PRs at once.
 *
 * **One worktree, reused.** A checkout of a monorepo is expensive and doing it
 * per PR is not affordable at fifty. So the run creates one ephemeral worktree
 * and resets it between PRs. Nothing here ever touches the user's checkout:
 * the branch we work on is a single run-scoped name repointed with `checkout
 * -B`, never the PR's own branch. That matters beyond tidiness — a PR's branch
 * may be checked out in somebody's live worktree, and git refuses to check out
 * the same branch twice. Working on a scratch branch and pushing `HEAD:<head>`
 * sidesteps the question entirely.
 *
 * **One stuck PR must not end the run.** Every failure mode is a recorded
 * outcome, never a throw: a conflict nothing claims, a rebuild verb that
 * fails, a push rejected by a concurrent update. The run continues and the
 * report says what happened to each PR. The alternative — stopping at the
 * first hard PR — means the easy forty-nine never get updated.
 *
 * **Rebase, then merge, then judgement.** A rebase replays every commit, so
 * it can stop once per commit. The deterministic rungs (rerere, lockfile,
 * resolvers, generators) run at every stop. A stop they cannot clear aborts
 * the rebase and the PR is retried as a merge, which resolves the same
 * conflict once; only there is `repair` offered the problem, so an agent is
 * never asked to fix twenty versions of one conflict. The outcome records the
 * change of strategy so a reader does not mistake the push for a rebase.
 *
 * Order matters and comes from the caller: a stack must be updated
 * parent-first, because updating a child before its parent is work that has
 * to be redone the moment the parent moves.
 *
 * Nothing is written without `apply`. A dry run walks the same code, predicts
 * the same conflicts, and pushes nothing.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { firstLine, stderrOrError } from '@osdlc/command-seam'
import { CommandFailed, Git } from '@osdlc/typed-git'

import type {
  ConfirmPush,
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
 * Named for this package, not for any host: a standalone run against an
 * arbitrary repository should not leave a branch name behind that presumes
 * where it was started from.
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
   * The head sha as observed when the run started. A rebase force-push is
   * pinned to it, so a PR somebody pushed to mid-run is rejected rather than
   * overwritten.
   */
  headOid: string | null
  /** The base sha as observed when the run started. Keys the failed-attempt record. */
  baseOid: string | null
  strategy: 'rebase' | 'merge'
}

export interface UpdateSettings {
  remote: string
  resolvers: readonly RegenerateRule[]
  lockfileInstall: string | null
  /** Shell verbs that must pass before a push. Empty means push unverified. */
  verifyVerbs: readonly string[]
  generators?: readonly Generator[] | undefined
  repair?: Repair | undefined
  /** The kinds `repair` is called for. */
  repairOn?: readonly RepairKind[] | undefined
  /** Asked before each rebase force-push; false leaves the branch alone. */
  confirmPush?: ConfirmPush | undefined
  /**
   * What a rebase does when a stop needs more than the deterministic rungs:
   * `merge` (the default) retries the PR as a merge, `fail` reports it.
   */
  onRebaseConflict?: 'merge' | 'fail' | undefined
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
      /** The sha the PR branch was pushed at; set when `pushed`. */
      pushedOid?: string
      repaired?: Repaired[]
      /** Why the built update was not pushed: `confirmPush` said no or threw. */
      declined?: string
    } & StrategyFallback)
  | ({ status: 'conflict'; needsHuman: { path: string; why: string }[] } & StrategyFallback)
  | ({ status: 'failed'; reason: string } & StrategyFallback)

/**
 * `strategy` is the one that ran: `merge` when the outcome carries a
 * `strategyFallback`, whatever the survey planned.
 */
export interface UpdateResult extends UpdateTarget {
  outcome: UpdateOutcome
}

/**
 * A push rejection caused by the remote having moved, not by anything wrong
 * with what we built. Worth reporting distinctly: the answer is to re-run,
 * not to go and look at the branch.
 */
export function isStalePush(stderr: string): boolean {
  return (
    /\brejected\b/i.test(stderr) &&
    /(non-fast-forward|fetch first|stale info|cannot lock ref)/i.test(stderr)
  )
}

/** One line naming why `e` failed: stderr (or the runner's `error`), else stdout. */
function errorLine(e: unknown): string {
  if (e instanceof CommandFailed) {
    return firstLine(stderrOrError(e.result)) || firstLine(e.result.stdout, 'command failed')
  }
  return e instanceof Error ? e.message : String(e)
}

/**
 * The conflicted paths git itself reports, which is the authoritative list.
 *
 * An integration outcome's own `conflicts` is a best-effort read of a
 * translatable message and has no parseable form for rename/rename, so it is
 * useful for a report and not for a decision.
 */
function conflictedPaths(git: Git): string[] {
  return git.diffNameOnly({ diffFilter: 'U' })
}

/**
 * Update one PR in an already-prepared worktree.
 *
 * The caller owns the worktree's lifetime; this owns what happens inside it
 * for one PR, including leaving it clean enough for the next one. A caught
 * failure always aborts the in-progress merge or rebase, because a worktree
 * left mid-integration would corrupt every PR after it.
 */
export async function updateOne(
  git: Git,
  target: UpdateTarget,
  settings: UpdateSettings,
  runVerb: RunVerb,
  opts: { apply: boolean; worktree: string },
): Promise<UpdateOutcome> {
  const base = `${settings.remote}/${target.base}`
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

  // The push lease pins `target.headOid`, the code host's view of the head. A
  // tracking ref behind it (a skipped or failed fetch) would build on a stale
  // base and the lease would still pass, dropping the newer remote commits.
  const tracked = git.resolveRef('HEAD')
  if (target.headOid !== null && tracked !== target.headOid) {
    return {
      status: 'failed',
      reason: `tracking ref ${head} does not match the PR head; re-run with a fetch`,
    }
  }

  // Nothing to do is the common answer in a run over every open PR, and it
  // must cost nothing: no integration, no rebuild, no push.
  const counts = git.try.aheadBehind(base, 'HEAD')
  if (counts.ok && counts.value.behind === 0) return { status: 'up-to-date' }

  let strategy = target.strategy
  let rebased: PathPlan[] | null = null
  let strategyFallback: string | undefined
  if (strategy === 'rebase') {
    const attempt = rebaseThroughRungs(git, base, settings, runVerb, opts.worktree, {
      // Each stop replays one commit, so more stops than commits means git
      // is not making progress and looping would never end.
      maxStops: counts.ok ? counts.value.ahead + 1 : 1000,
    })
    if (attempt.kind === 'failed') return { status: 'failed', reason: attempt.reason }
    if (attempt.kind === 'done') rebased = attempt.resolved
    else if ((settings.onRebaseConflict ?? 'merge') === 'fail') {
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
  )
  return strategyFallback === undefined || outcome.status === 'up-to-date'
    ? outcome
    : { ...outcome, strategyFallback }
}

type RebaseAttempt =
  | { kind: 'done'; resolved: PathPlan[] }
  | { kind: 'stuck'; needsHuman: { path: string; why: string }[] }
  | { kind: 'failed'; reason: string }

/**
 * Replay the branch onto `base`, running the deterministic rungs at every stop.
 *
 * Generated files tend to conflict on every commit that touches them, so
 * clearing only the first stop would leave the case the rungs exist for
 * failing on the second. A stop they cannot clear leaves the worktree clean
 * (the rebase aborted) and answers `stuck`, for the caller to merge or report.
 * `repair` is deliberately not offered here: see the module comment.
 */
function rebaseThroughRungs(
  git: Git,
  base: string,
  settings: UpdateSettings,
  runVerb: RunVerb,
  worktree: string,
  limits: { maxStops: number },
): RebaseAttempt {
  // Whatever the way out, leave a clean tree on the branch: the fallback
  // merges in this same worktree.
  const reset = (): void => {
    git.try.rebaseAbort()
    git.try.resetHard('HEAD')
    git.clean({ directories: true })
  }
  const failed = (reason: string): RebaseAttempt => {
    reset()
    return { kind: 'failed', reason }
  }

  const resolved: PathPlan[] = []
  let outcome
  try {
    outcome = git.rebase(base, { autostash: false, env: noHooksEnv() })
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
    const needsHuman = unclaimed(plans)
    if (needsHuman.length > 0) {
      reset()
      return { kind: 'stuck', needsHuman }
    }
    const failure = rebuild(git, plans, settings, runVerb, worktree)
    if (failure !== null) return failed(failure)
    try {
      // `.` and not the conflicted paths alone: a generator legitimately
      // rewrites files beyond the ones that conflicted, and leaving those
      // unstaged would continue with a half-regenerated tree. Safe because the
      // worktree is ephemeral and held nothing but this integration.
      git.add(['.'])
      outcome = git.rebaseContinue({ env: noHooksEnv() })
    } catch (e) {
      return failed(`continuing the rebase: ${errorLine(e)}`)
    }
    resolved.push(...plans)
  }
  return { kind: 'done', resolved }
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
): Promise<UpdateOutcome> {
  const base = `${settings.remote}/${target.base}`
  const head = `${settings.remote}/${target.head}`

  let outcome
  if (rebased === null) {
    try {
      outcome = git.merge(base)
    } catch (e) {
      git.try.mergeAbort()
      return { status: 'failed', reason: `merge ${base}: ${errorLine(e)}` }
    }
  }

  // A repair edits files with no undo, so a rehearsal never calls one.
  const repairFor = (kind: RepairKind): Repair | null =>
    opts.apply && settings.repair !== undefined && (settings.repairOn ?? []).includes(kind)
      ? settings.repair
      : null
  const repaired: Repaired[] = []
  const fail = (reason: string): UpdateOutcome => {
    git.try.mergeAbort()
    // A rebuild or repair may leave edits, intent-to-add entries and untracked
    // files that the next PR's `add .` would otherwise pick up.
    git.try.resetHard('HEAD')
    git.clean({ directories: true })
    return { status: 'failed', reason }
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
    const needsHuman = unclaimed(plans)
    const repair = repairFor('conflict')
    if (needsHuman.length > 0 && repair === null) {
      git.try.mergeAbort()
      return { status: 'conflict', needsHuman }
    }
    const failure = rebuild(git, plans, settings, runVerb, opts.worktree)
    if (failure !== null) return fail(failure)
    if (needsHuman.length > 0 && repair !== null) {
      const why = needsHuman.map((c) => `${c.path} (${c.why})`).join(', ')
      const res = await tryRepair(
        git,
        repair,
        request(
          'conflict',
          needsHuman.map((c) => c.path),
          `unclaimed conflicts: ${why}`,
        ),
      )
      if (!res.ok) return fail(res.reason)
      repaired.push({ kind: 'conflict', note: res.note })
    }
    try {
      // See `rebaseThroughRungs` for why the pathspec is `.`.
      git.add(['.'])
      git.commit({
        message: `Merge ${target.base} into ${target.head}`,
        body:
          repaired.length > 0
            ? 'Conflicts resolved by rebuilding the generated artifacts and the repair.'
            : 'Conflicts resolved by rebuilding the generated artifacts.',
        // The project's gate is `verify:`'s business, run once per PR under the
        // caller's control: git would otherwise fire the commit hooks here and
        // nowhere else, a gate whose scope is an accident of the strategy. The
        // rebase path turns hooks off the same way (see `noHooksEnv`).
        noVerify: true,
      })
    } catch (e) {
      return fail(`committing the resolution: ${errorLine(e)}`)
    }
    resolved.push(...plans.filter((p) => p.kind !== 'unclaimed'))
  }

  const verifyFailure = runVerify(settings.verifyVerbs, runVerb, opts.worktree)
  if (verifyFailure !== null) {
    const repair = repairFor('verify-failed')
    if (repair === null) return fail(verifyFailure.summary)
    const changed = git.try.diffNameOnly({ rangeArgs: [head, 'HEAD'] })
    const res = await tryRepair(
      git,
      repair,
      request('verify-failed', changed.ok ? changed.value : [], verifyFailure.detail),
    )
    if (!res.ok) return fail(res.reason)
    repaired.push({ kind: 'verify-failed', note: res.note })
    try {
      commitRepair(git, target, res.note)
    } catch (e) {
      return fail(`committing the repair: ${errorLine(e)}`)
    }
    const again = runVerify(settings.verifyVerbs, runVerb, opts.worktree)
    if (again !== null) return fail(`${again.summary} (after repair)`)
  }

  if (!opts.apply) return { status: 'updated', resolved, pushed: false }

  const extra = repaired.length > 0 ? { repaired } : {}
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
  try {
    pushedOid = git.resolveRef('HEAD')
    pushUpdate(git, target, settings)
  } catch (e) {
    const reason =
      e instanceof CommandFailed && isStalePush(e.result.stderr)
        ? `push rejected — ${target.head} moved since the run started; re-run`
        : `push ${target.head}: ${errorLine(e)}`
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
 * observed at the start of the run. The bare `--force-with-lease` would not
 * do: it compares against the remote-tracking ref this process just fetched,
 * which is exactly the value a mid-run push by someone else would have
 * updated. Pinning to the observed sha is what makes the lease mean "nobody
 * has touched this since I looked".
 *
 * Without a known sha there is nothing to pin to, and a force-push with no
 * lease is not something to do on someone's behalf — so it is refused.
 */
function pushUpdate(git: Git, target: UpdateTarget, settings: UpdateSettings): void {
  const refspec = `HEAD:refs/heads/${target.head}`
  if (target.strategy !== 'rebase') {
    git.push(settings.remote, refspec)
    return
  }
  if (target.headOid === null) {
    throw new Error(`refusing to force-push ${target.head} without a known head sha to pin to`)
  }
  git.push(settings.remote, refspec, {
    forceWithLease: { ref: `refs/heads/${target.head}`, expect: target.headOid },
  })
}

/**
 * Run each rebuild verb and generator the plan needs. Returns a reason on
 * failure, null on success; the caller aborts on a reason.
 */
function rebuild(
  git: Git,
  plans: readonly PathPlan[],
  settings: UpdateSettings,
  runVerb: RunVerb,
  worktree: string,
): string | null {
  // Give the rebuild a tree it can read: a file with conflict markers in it is
  // not valid input to a generator or a package manager. Either side works
  // because the rebuild overwrites the content anyway; `--ours` is the side
  // that already exists on the branch.
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

/** Run the verify verbs in order; the first failure, or null when all pass. */
function runVerify(
  verbs: readonly string[],
  runVerb: RunVerb,
  worktree: string,
): { summary: string; detail: string } | null {
  for (const verb of verbs) {
    const res = runVerb(verb, worktree)
    if (res.exitCode !== 0) {
      const stderr = res.stderr || res.error || ''
      const output = `${res.stdout}\n${stderr}`.trim()
      return {
        summary: `verify \`${verb}\` failed: ${firstLine(stderr)}`,
        // The tail, where test runners print their summary.
        detail: `verify \`${verb}\` failed:\n${output.slice(-4000)}`,
      }
    }
  }
  return null
}

/** Commit hooks off for one call: the project's gate is `verify:`'s business. */
export function noHooksEnv(
  parent: Record<string, string | undefined> = process.env,
): Record<string, string> {
  // Append to any GIT_CONFIG_* the parent already set instead of clobbering it.
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
  // Only what the repair wrote: rebuild output that ran before it is not its fault.
  const touched = [
    ...new Set([...req.paths, ...touchedSince(dirtyBefore, dirtyFiles(git, req.worktree))]),
  ]
  if (touched.length === 0) return { ok: true, note: res.note }
  // A file that already held marker-like lines at HEAD (a fixture, a doc) is
  // not a conflict the repair left behind; only a `conflict` repair owns such
  // files. HEAD is the commit before the repair (checked unmoved above).
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
  // A repair that changed nothing (a flaky check, say) still gets its re-run.
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
 * Update a list of PRs in one ephemeral worktree.
 *
 * `targets` must already be in dependency order — the survey's topological
 * sort — because a stack updated child-first is work that gets redone.
 *
 * The worktree is created detached at the first target's base and torn down
 * in a `finally`, so an exception anywhere still leaves no stray checkout and
 * no registered worktree behind. The scratch branch is deleted with it.
 */
export async function updateAll(
  git: Git,
  targets: readonly UpdateTarget[],
  settings: UpdateSettings,
  runVerb: RunVerb,
  opts: { apply: boolean; worktreeRoot: string; onResult?: (r: UpdateResult) => void },
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = []
  if (targets.length === 0) return results

  releaseStaleScratch(git)
  const start = `${settings.remote}/${targets[0]!.base}`
  git.worktreeAdd(opts.worktreeRoot, { detach: true, startPoint: start })
  const wt = git.at(opts.worktreeRoot)
  try {
    for (const target of targets) {
      const outcome = await updateOne(wt, target, settings, runVerb, {
        apply: opts.apply,
        worktree: opts.worktreeRoot,
      })
      const ran = 'strategyFallback' in outcome ? 'merge' : target.strategy
      const result = { ...target, strategy: ran, outcome }
      results.push(result)
      // Streamed rather than returned only at the end: a run over fifty PRs
      // takes minutes, and a caller rendering progress needs each one as it
      // lands.
      opts.onResult?.(result)
    }
  } finally {
    // Order matters: the scratch branch is checked out in the worktree, and
    // git refuses to delete a branch some worktree holds. Removing the
    // worktree releases it. Each step is `try` so a failure in one still
    // leaves the others to run — a stray worktree is worse than a stray
    // branch, and both are worse than an exception here masking the real one.
    git.try.worktreeRemove(opts.worktreeRoot, { force: true })
    git.try.worktreePrune()
    git.try.deleteBranch(scratchBranch(opts.worktreeRoot), { force: true })
  }
  return results
}

/**
 * Remove a worktree that a killed run left holding a {@link WORK_BRANCH} branch, and the branch
 * itself. Without this, scratch branches and worktrees pile up. A worktree whose `<pid>.` name
 * prefix is a live process is left alone, since it belongs to a run still going.
 */
function releaseStaleScratch(git: Git): void {
  const stale = git
    .worktrees()
    .filter(
      (w) =>
        w.branch?.startsWith(WORK_BRANCH) === true &&
        !isAlive(Number(basename(w.path).split('.')[0])),
    )
  for (const w of stale) {
    git.try.worktreeRemove(w.path, { force: true })
  }
  if (stale.length > 0) git.try.worktreePrune()
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
