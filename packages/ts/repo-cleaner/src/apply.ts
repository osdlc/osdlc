/**
 * Apply an approved cleanup plan.
 *
 * Re-sweeps each repository and drops selected rows that are gone, no longer
 * deletable, changed, or lack a grant. Deletes the rest in a fixed order and
 * stops at the first failure:
 *
 * 1. worktrees, each unlocked first when its lock's owner is dead, and each
 *    checked again for live processes just before it is unlocked or removed;
 * 2. local branches;
 * 3. remote branches;
 * 4. one prune per repository.
 *
 * Branch deletes are compare-and-swap on the planned sha. Every step is
 * verified, and the receipt is rewritten after each.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'
import { CommandFailed, Git, PUSH_REJECTIONS } from '@osdlc/typed-git'

import { localDeleteCommand, remoteDeleteCommand } from './branches.ts'
import type { HostHooks } from './hooks.ts'
import { busyHolders, defaultProcessProbe, parseLockOwner, type ProcessProbe } from './processes.ts'
import {
  PLAN_CATEGORIES,
  fingerprint,
  isPlanCategory,
  sameFingerprint,
  type Plan,
  type PlanRepo,
} from './plan.ts'
import type { Dropped, Receipt, RowRef, Step } from './receipt.ts'
import { sweepRepo } from './sweep.ts'
import { AUTHORIZATIONS, type Authorization, type SweepItem, type SweepProgress } from './types.ts'
import { worktreePruneCommand, worktreeRemoveCommand, worktreeUnlockCommand } from './worktrees.ts'
import { writeJsonAtomic } from './write-json.ts'

/** An authorization the caller gave, for one row or (`row: null`) for all. */
export interface Grant {
  name: Authorization
  row: RowRef | null
}

export interface ApplyOptions extends HostHooks {
  /** Injected runners. Defaults spawn the real `git` and `gh`. */
  git?: CommandRunner | undefined
  gh?: CommandRunner | undefined
  /**
   * Answers lock-owner and working-directory questions, for the re-sweep and
   * for the checks just before an unlock and a remove. Defaults to `ps` and
   * `lsof`.
   */
  probe?: ProcessProbe | undefined
  /** The caller's directory; the sweep never offers the worktree holding it. */
  callerCwd: string
  dryRun: boolean
  /** Where the receipt is written after each step; null writes none. Unused under `dryRun`. */
  receiptPath: string | null
  /** Where the plan came from, shown in the receipt. */
  planPath: string
  /** Limit the run to the plan repository rooted here. */
  repoRoot?: string | undefined
  now?: () => Date
  /** Rows dropped before this run, such as by a preview; recorded first in the receipt. */
  dropped?: readonly Dropped[] | undefined
  /** Passed to the re-sweep's `onProgress`, for a status line. */
  onSweepProgress?: ((progress: SweepProgress) => void) | undefined
  /** Told before each step runs: its 0-based index, the step count and the step. Not called under `dryRun`. */
  onStep?: ((index: number, total: number, step: Step) => void) | undefined
}

/** A selection or grant the plan cannot satisfy. Nothing has been touched. */
export class ApplyArgumentError extends Error {}

/** `<category>:<id>`, split at the first colon. */
export function parseRowRef(text: string): RowRef {
  const colon = text.indexOf(':')
  const category = colon < 0 ? '' : text.slice(0, colon)
  const id = colon < 0 ? '' : text.slice(colon + 1)
  if (!isPlanCategory(category) || id === '') {
    throw new ApplyArgumentError(
      `bad row ${JSON.stringify(text)}: expected <category>:<id> with category one of ${PLAN_CATEGORIES.join(', ')}`,
    )
  }
  return { category, id }
}

/** `<name>` for every row, or `<name>=<category>:<id>` for one. */
export function parseGrant(text: string): Grant {
  const eq = text.indexOf('=')
  const name = eq < 0 ? text : text.slice(0, eq)
  if (!(AUTHORIZATIONS as readonly string[]).includes(name)) {
    throw new ApplyArgumentError(
      `unknown authorization ${JSON.stringify(name)}: expected one of ${AUTHORIZATIONS.join(', ')}`,
    )
  }
  return { name: name as Authorization, row: eq < 0 ? null : parseRowRef(text.slice(eq + 1)) }
}

const sameRow = (a: RowRef, b: RowRef): boolean => a.category === b.category && a.id === b.id
const label = (row: RowRef): string => `${row.category}:${row.id}`

function errorText(err: unknown): string {
  if (err instanceof CommandFailed) return err.detail.trim() || err.message
  return err instanceof Error ? err.message : String(err)
}

interface Selected {
  repo: PlanRepo
  ref: RowRef
}

/**
 * A row to apply, optionally pinned to the plan repository rooted at `repo`.
 * Without `repo`, a row id that two plan repositories share is ambiguous.
 */
export type RowSelection = RowRef & { repo?: string }

const sameSelection = (a: RowSelection, b: RowSelection): boolean =>
  sameRow(a, b) &&
  (a.repo === undefined ? '' : resolve(a.repo)) === (b.repo === undefined ? '' : resolve(b.repo))

/** Each selected row's plan repository. Unknown and ambiguous rows are errors. */
function locate(
  plan: Plan,
  rows: readonly RowSelection[],
  repoRoot: string | undefined,
): Selected[] {
  const repos =
    repoRoot === undefined
      ? plan.repos
      : plan.repos.filter((r) => resolve(r.root) === resolve(repoRoot))
  if (repos.length === 0) throw new ApplyArgumentError(`no plan repository at ${repoRoot}`)
  return rows.map(({ repo, ...ref }) => {
    const hits = repos.filter(
      (r) =>
        (repo === undefined || resolve(r.root) === resolve(repo)) &&
        r.rows.some((row) => sameRow(row, ref)),
    )
    if (hits.length === 0) throw new ApplyArgumentError(`row ${label(ref)} is not in the plan`)
    if (hits.length > 1) {
      throw new ApplyArgumentError(
        `row ${label(ref)} is in ${hits.length} plan repositories; pass --repo-root`,
      )
    }
    return { repo: hits[0]!, ref }
  })
}

function granted(grants: readonly Grant[], ref: RowRef, name: Authorization): boolean {
  return grants.some((g) => g.name === name && (g.row === null || sameRow(g.row, ref)))
}

interface Accepted {
  repo: string
  item: SweepItem
  force: boolean
}

/** The plan repository's rows as they stand now, with the host's overlay applied. */
function resweep(repo: PlanRepo, opts: ApplyOptions): SweepItem[] {
  const sweep = sweepRepo(repo.root, {
    remote: repo.remote,
    noGh: repo.no_gh,
    branch: repo.branch ?? undefined,
    cwd: opts.callerCwd,
    git: opts.git,
    gh: opts.gh,
    probe: opts.probe,
    onProgress: opts.onSweepProgress,
  })
  if (sweep.repo === null || sweep.error !== null) {
    throw new Error(sweep.error ?? `could not read repository: ${repo.root}`)
  }
  return opts.annotate === undefined ? sweep.items : opts.annotate(sweep.repo, sweep.items)
}

/** Re-sweep, then split the selection into rows to run and rows dropped. */
function recheck(
  selected: readonly Selected[],
  grants: readonly Grant[],
  implicit: boolean,
  opts: ApplyOptions,
): { accepted: Accepted[]; dropped: Dropped[] } {
  const swept = new Map<PlanRepo, SweepItem[]>()
  for (const { repo } of selected) {
    if (!swept.has(repo)) swept.set(repo, resweep(repo, opts))
  }

  const accepted: Accepted[] = []
  const dropped: Dropped[] = []
  for (const { repo, ref } of selected) {
    const drop = (reason: Dropped['reason'], detail: string): void => {
      dropped.push({ repo: repo.root, ...ref, reason, detail })
    }
    const planned = repo.rows.find((row) => sameRow(row, ref))!
    const item = swept.get(repo)!.find((it) => sameRow(it as RowRef, ref))
    if (item === undefined) {
      drop('gone', 'no longer in the sweep')
      continue
    }
    if (!item.deletable) {
      drop('not-deletable', item.reason)
      continue
    }
    if (implicit && item.classification !== 'safe-to-delete') {
      drop('needs-review', `${item.reason}; name it with --row to apply it`)
      continue
    }
    const now = fingerprint(item)
    if (!sameFingerprint(planned.fingerprint, now)) {
      drop(
        'facts-changed',
        `planned ${JSON.stringify(planned.fingerprint)}, now ${JSON.stringify(now)}`,
      )
      continue
    }
    const missing = item.requires.filter((name) => !granted(grants, ref, name))
    if (missing.length > 0) {
      drop('not-authorized', `needs ${missing.join(', ')}`)
      continue
    }
    accepted.push({ repo: repo.root, item, force: granted(grants, ref, 'discard-changes') })
  }
  return { accepted, dropped }
}

function pending(
  repo: string,
  row: RowRef | null,
  action: Step['action'],
  command: string,
  expectedSha: string | null = null,
): Step {
  return {
    repo,
    row,
    action,
    command,
    expected_sha: expectedSha,
    result: 'pending',
    error: null,
    verification: null,
  }
}

const pruneStep = (repo: string, row: RowRef | null): Step =>
  pending(repo, row, 'prune-worktrees', worktreePruneCommand(repo))

function stepsFor({ repo, item, force }: Accepted): Step[] {
  const ref: RowRef = { category: item.category, id: item.id }
  const sha = typeof item.facts['sha'] === 'string' ? item.facts['sha'] : null
  switch (item.category) {
    case 'worktree': {
      // Remove and prune both skip a locked worktree, so a stale lock goes first.
      const unlock =
        item.facts['stale_lock'] === true
          ? [pending(repo, ref, 'unlock-worktree', worktreeUnlockCommand(repo, item.id))]
          : []
      if (item.facts['on_disk'] === false) return [...unlock, pruneStep(repo, ref)]
      return [
        ...unlock,
        pending(repo, ref, 'remove-worktree', worktreeRemoveCommand(repo, item.id, { force })),
      ]
    }
    case 'local_branch':
      return [pending(repo, ref, 'delete-local', localDeleteCommand(item.id, sha ?? ''), sha)]
    case 'remote_branch':
      return [
        pending(
          repo,
          ref,
          'delete-remote',
          remoteDeleteCommand(
            String(item.facts['remote']),
            String(item.facts['branch']),
            sha ?? '',
          ),
          sha,
        ),
      ]
  }
}

/**
 * Refuse while a process other than an idle shell works inside `path`. Reads
 * the process table afresh; a table that cannot be read refuses too.
 */
function assertNoLiveProcess(path: string, probe: ProcessProbe): void {
  let busy
  try {
    busy = busyHolders(probe.holders(path, { fresh: true }))
  } catch (err) {
    throw new Error(`refused: cannot tell whether a process runs in ${path}: ${errorText(err)}`)
  }
  if (busy.length > 0) {
    throw new Error(
      `refused: running in ${path}: ${busy.map((h) => `${h.command} (pid ${h.pid})`).join(', ')}`,
    )
  }
}

/** Run one step, then confirm it took. Throws with the reason on failure. */
function execute(step: Step, row: Accepted | null, git: Git, probe: ProcessProbe): string {
  const at = git.at(step.repo)
  const registered = (path: string): boolean =>
    at.worktrees().some((w) => resolve(w.path) === resolve(path))

  switch (step.action) {
    case 'unlock-worktree': {
      const path = row!.item.id
      // The sweep that accepted this row is behind us; ask again just before
      // acting, so an owner that came back keeps its lock.
      const lockReason = row!.item.facts['lock_reason']
      const owner = parseLockOwner(typeof lockReason === 'string' ? lockReason : null)
      if (owner === null) throw new Error(`refused: lock on ${path} names no owner`)
      if (probe.alive(owner.pid, owner.startedAt)) {
        throw new Error(`refused: lock owner pid ${owner.pid} is alive`)
      }
      if (row!.item.facts['on_disk'] !== false) assertNoLiveProcess(path, probe)
      at.worktreeUnlock(path)
      const entry = at.worktrees().find((w) => resolve(w.path) === resolve(path))
      if (entry?.locked === true) throw new Error(`still locked: ${path}`)
      return 'lock owner dead, unlocked'
    }
    case 'prune-worktrees': {
      at.worktreePrune()
      if (row !== null && registered(row.item.id)) throw new Error('still registered after prune')
      return row === null ? 'pruned' : 'unregistered'
    }
    case 'remove-worktree': {
      const path = row!.item.id
      assertNoLiveProcess(path, probe)
      at.worktreeRemove(path, { force: row!.force })
      if (existsSync(path)) throw new Error(`directory still exists: ${path}`)
      if (registered(path)) throw new Error(`still registered: ${path}`)
      return 'directory gone and unregistered'
    }
    case 'delete-local': {
      const name = row!.item.id
      const holder = at.worktrees().find((w) => w.branch === name)
      if (holder !== undefined) throw new Error(`refused: checked out in ${holder.path}`)
      at.deleteRef(`refs/heads/${name}`, { expected: step.expected_sha! })
      // `update-ref -d` does not remove the `branch.<name>` config section.
      at.configRemoveSection(`branch.${name}`)
      if (at.resolveRef(`refs/heads/${name}`) !== null) throw new Error('ref still resolves')
      return 'ref does not resolve'
    }
    case 'delete-remote': {
      const remote = String(row!.item.facts['remote'])
      const ref = `refs/heads/${String(row!.item.facts['branch'])}`
      const report = at.push(remote, `:${ref}`, {
        forceWithLease: { ref, expect: step.expected_sha! },
      })
      const refused = report.refs.find((r) => r.flag === '!')
      if (refused?.flag === '!') {
        const why = refused.rawReason === null ? '' : ` (${refused.rawReason})`
        throw new Error(`${refused.summary}${why}: ${PUSH_REJECTIONS[refused.rejection].message}`)
      }
      if (at.lsRemote(remote, ref).some((r) => r.ref === ref)) {
        throw new Error(`ls-remote still lists ${ref}`)
      }
      return 'ls-remote lists nothing'
    }
  }
}

/**
 * Apply the `requested` rows of `plan` under `grants`. An empty `requested`
 * selects every row of the plan (of `repoRoot`'s repository, when given) and
 * then drops each one the re-sweep does not judge `safe-to-delete`: a row to
 * review runs only when it is named. A row named twice runs once. A row whose
 * `requires` was not granted is dropped, never run.
 *
 * @throws ApplyArgumentError before touching anything, when a row or grant does
 *   not fit the plan.
 */
export function applyPlan(
  plan: Plan,
  requested: readonly RowSelection[],
  grants: readonly Grant[],
  opts: ApplyOptions,
): Receipt {
  const now = opts.now ?? (() => new Date())
  // Every row of the plan keeps its repository, so a branch name two
  // repositories share is two rows, not an ambiguity.
  const wanted: readonly RowSelection[] =
    requested.length > 0
      ? requested
      : plan.repos
          .filter((r) => opts.repoRoot === undefined || resolve(r.root) === resolve(opts.repoRoot))
          .flatMap((r) =>
            r.rows.map((row) => ({ category: row.category, id: row.id, repo: r.root })),
          )
  const rows = wanted.filter(
    (row, i) => wanted.findIndex((other) => sameSelection(other, row)) === i,
  )
  if (rows.length === 0) throw new ApplyArgumentError('the plan has no rows to apply')
  const selected = locate(plan, rows, opts.repoRoot)
  for (const grant of grants) {
    if (grant.row !== null && !rows.some((r) => sameRow(r, grant.row!))) {
      throw new ApplyArgumentError(`--allow names unselected row ${label(grant.row)}`)
    }
  }

  const receipt: Receipt = {
    version: 1,
    plan: opts.planPath,
    status: opts.dryRun ? 'dry-run' : 'applying',
    started_at: now().toISOString(),
    finished_at: null,
    dropped: [],
    steps: [],
  }
  const { accepted, dropped } = recheck(selected, grants, requested.length === 0, opts)
  receipt.dropped = [...(opts.dropped ?? []), ...dropped]

  const ordered = PLAN_CATEGORIES.flatMap((category) =>
    accepted.filter((row) => row.item.category === category),
  )
  const plannedSteps: Array<[Step, Accepted | null]> = ordered.flatMap((row) =>
    stepsFor(row).map((step): [Step, Accepted | null] => [step, row]),
  )
  for (const repo of new Set(ordered.map((row) => row.repo))) {
    plannedSteps.push([pruneStep(repo, null), null])
  }
  receipt.steps = plannedSteps.map(([step]) => step)

  if (opts.dryRun) {
    for (const step of receipt.steps) step.result = 'would-run'
    receipt.finished_at = now().toISOString()
    return receipt
  }

  const receiptPath = opts.receiptPath
  const save = (): void => {
    if (receiptPath !== null) writeJsonAtomic(receiptPath, receipt)
  }
  save()
  const git = new Git(opts.callerCwd, { runner: opts.git })
  const probe = opts.probe ?? defaultProcessProbe()
  // Worktrees whose lock this run cleared. typed-git has no `worktree lock`
  // verb, so a failed remove cannot put the lock back; the receipt says so.
  const unlocked = new Set<string>()
  for (const [i, [step, row]] of plannedSteps.entries()) {
    opts.onStep?.(i, plannedSteps.length, step)
    try {
      step.verification = execute(step, row, git, probe)
      step.result = 'ok'
      if (step.action === 'unlock-worktree') unlocked.add(row!.item.id)
    } catch (err) {
      step.result = 'failed'
      step.error = errorText(err)
      if (row !== null && step.action !== 'unlock-worktree' && unlocked.has(row.item.id)) {
        step.error += `; the lock on ${row.item.id} was cleared earlier in this run and is not restored`
      }
      receipt.status = 'failed'
      receipt.finished_at = now().toISOString()
      save()
      return receipt
    }
    save()
  }
  receipt.status = 'complete'
  receipt.finished_at = now().toISOString()
  save()
  return receipt
}
