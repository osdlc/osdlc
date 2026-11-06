/**
 * Cleaning up: `check` a plan against an approval, then `run` what it shows.
 *
 * `check` resolves the approval (the rows picked, the rows spared, the risks
 * allowed), refuses one that contradicts itself, sweeps every plan repository
 * again and drops each selected row that is gone, cannot be deleted, moved
 * since the plan, or carries a risk not allowed. It returns the steps a run
 * would take. `run` sweeps once more and takes those steps in a fixed order,
 * stopping at the first failure:
 *
 * 1. spared remote branches, each tip checked with `ls-remote`;
 * 2. worktrees, each unlocked first when its lock's owner is dead, and each
 *    checked again for live processes just before it is unlocked or removed;
 *    one with submodules is removed with `--force` after its files and every
 *    submodule are checked again;
 * 3. local branches;
 * 4. remote branches;
 * 5. one prune per repository.
 *
 * Branch deletes are compare-and-swap on the planned sha. Every step is
 * verified, and the receipt is rewritten after each.
 */

import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'

import { shellJoin } from '@osdlc/command-seam'
import { CommandFailed, Git, PUSH_REJECTIONS } from '@osdlc/typed-git'

import { localDeleteCommand, remoteDeleteCommand } from './branches.ts'
import type { Annotate } from './hooks.ts'
import { fingerprint, runnable, sameFingerprint, type Plan, type PlanRepo } from './plan.ts'
import { busyHolders, defaultProcessProbe, parseLockOwner, type ProcessProbe } from './processes.ts'
import { RECEIPT_VERSION, type Dropped, type Receipt, type Step } from './receipt.ts'
import { defaultCacheDir, mirrorProblem } from './remote-mirror.ts'
import { inspectSubmodules, submoduleHazards, worktreeGitDir } from './submodules.ts'
import { holdFreedBranches, sweepRepo, type Runners } from './sweep.ts'
import {
  KINDS,
  RISKS,
  RepoCleanerError,
  type Kind,
  type RemoteRow,
  type Risk,
  type Row,
  type RowId,
  type Sweep,
  type SweepProgress,
} from './types.ts'
import { worktreePruneCommand, worktreeRemoveCommand, worktreeUnlockCommand } from './worktrees.ts'
import { writeJsonAtomic } from './write-json.ts'

/** A risk allowed for every row (`row` absent), or for one row. */
export interface Allow {
  risk: Risk
  /** A row id or bare name, resolved as a pick is. */
  row?: string | undefined
}

/**
 * What a person approved. Rows are named by id (`branch:feat/x`), or by a
 * bare name or path when only one plan row has it.
 *
 *   `pick`   work on exactly these rows; a `review` row, or a `keep` row with
 *            an action, runs only when picked. Default: every `delete` row.
 *   `spare`  leave these rows alone; a spared remote branch is still checked,
 *            and the run stops if it is gone or moved since the plan.
 *   `allow`  the risks a row's action may carry.
 */
export interface Approval {
  pick?: readonly string[] | undefined
  spare?: readonly string[] | undefined
  allow?: readonly (Risk | Allow)[] | undefined
}

/** A row reference resolved to one plan row. */
export interface Resolved {
  repo: string
  id: RowId
}

/** An approval with every row resolved to its plan row. */
export interface ResolvedApproval {
  pick: Resolved[]
  spare: Resolved[]
  allow: { risk: Risk; row: Resolved | null }[]
}

interface Shared extends Runners {
  /** Where the caller stands: the base for relative worktree paths, and a worktree never removed. Defaults to the process's cwd. */
  cwd?: string | undefined
  /** A host's re-ranking, applied to every re-sweep as the sweep applied it. */
  annotate?: Annotate | undefined
  /** Told what the re-sweep is doing, for a status line. */
  onProgress?: ((progress: SweepProgress) => void) | undefined
}

export interface CheckOptions extends Shared {
  /**
   * A sweep made just now, used as the re-check instead of sweeping again: for
   * a preview straight after a sweep. `run` always sweeps again.
   */
  sweep?: Sweep | undefined
  /** Where remote URL clones are kept; a plan repository there must still push only where it fetches from. */
  cacheDir?: string | undefined
}

export interface RunOptions extends Shared {
  /** Where the receipt is rewritten after each step; none when absent. */
  receiptPath?: string | undefined
  /** Where the plan came from, recorded in the receipt. Default `(memory)`. */
  source?: string | undefined
  now?: (() => Date) | undefined
  /** Told once the steps are known, before the first runs; each step's `result` is updated in place. */
  onStart?: ((steps: readonly Step[]) => void) | undefined
  /** Told before each step: its index, the step count and the step. */
  onStep?: ((index: number, total: number, step: Step) => void) | undefined
  /** Told after each step, with its `result` set, before the receipt is saved. */
  onStepDone?: ((index: number, total: number, step: Step) => void) | undefined
}

/** What a run would do, for a person to approve: the steps, and the rows dropped and why. */
export interface Preview {
  plan: Plan
  approval: ResolvedApproval
  /** Each with `result: 'would-run'`. */
  steps: Step[]
  dropped: Dropped[]
  /** Allowed risks no row that runs carries. Not an error: what a row carries can change between runs. */
  unusedAllows: { risk: Risk; row: RowId | null }[]
}

// ── resolving an approval ──────────────────────────────────────────────────

const KIND_OF = new Set<string>(KINDS)

/** `kind:name` split, or a bare name. A one-letter prefix is a Windows drive, not a kind. */
function parseRef(text: string): { kind: Kind | null; name: string } {
  const colon = text.indexOf(':')
  if (colon > 1) {
    const kind = text.slice(0, colon)
    const name = text.slice(colon + 1)
    if (!KIND_OF.has(kind)) {
      throw new RepoCleanerError(
        'bad-input',
        `bad row ${JSON.stringify(text)}: expected <kind>:<name> with kind one of ${KINDS.join(', ')}, or a bare name`,
      )
    }
    if (name === '')
      throw new RepoCleanerError('bad-input', `bad row ${JSON.stringify(text)}: no name`)
    return { kind: kind as Kind, name }
  }
  if (text === '') throw new RepoCleanerError('bad-input', 'an empty row')
  return { kind: null, name: text }
}

/** The names a worktree reference may match: as written, against `cwd`, and resolved through symlinks. */
function pathForms(name: string, cwd: string): string[] {
  const abs = isAbsolute(name) ? name : resolve(cwd, name)
  const forms = new Set([name, abs])
  try {
    forms.add(realpathSync(abs))
  } catch {
    // A gone worktree has no real path; the plan names it as git did.
  }
  return [...forms]
}

const nameOf = (id: RowId): { kind: Kind; name: string } => {
  const colon = id.indexOf(':')
  return { kind: id.slice(0, colon) as Kind, name: id.slice(colon + 1) }
}

/**
 * The plan row `text` names. Checked against the plan's options first, so a
 * row the plan could never hold is a conflict, not a miss.
 */
function resolveRef(plan: Plan, text: string, flag: string, cwd: string): Resolved {
  const ref = parseRef(text)
  const { only, branch } = plan.options
  if (ref.kind !== null && !only.includes(ref.kind)) {
    throw new RepoCleanerError(
      'conflict',
      `${flag} ${text}: the sweep has no ${ref.kind} rows (it swept ${only.join(', ')})`,
    )
  }
  if (branch !== null && ref.kind === 'branch' && ref.name !== branch) {
    throw new RepoCleanerError('conflict', `${flag} ${text} is not a row of --branch ${branch}`)
  }
  if (branch !== null && ref.kind === 'remote' && !ref.name.endsWith(`/${branch}`)) {
    throw new RepoCleanerError('conflict', `${flag} ${text} is not a row of --branch ${branch}`)
  }
  const hits: Resolved[] = []
  for (const repo of plan.repos) {
    for (const row of repo.rows) {
      const { kind, name } = nameOf(row.id)
      if (ref.kind !== null && ref.kind !== kind) continue
      const forms = kind === 'worktree' ? pathForms(ref.name, cwd) : [ref.name]
      if (forms.includes(name)) hits.push({ repo: repo.root, id: row.id })
    }
  }
  if (hits.length === 0)
    throw new RepoCleanerError('not-found', `${flag} ${text}: no such row in the plan`)
  if (hits.length > 1) {
    const where = [...new Set(hits.map((h) => `${h.id} in ${h.repo}`))].join(', ')
    throw new RepoCleanerError(
      'ambiguous',
      `${flag} ${text} matches ${hits.length} rows (${where}); name one by its full id, or sweep only its repository`,
    )
  }
  return hits[0]!
}

const same = (a: Resolved, b: Resolved): boolean => a.repo === b.repo && a.id === b.id
const uniq = (rows: Resolved[]): Resolved[] =>
  rows.filter((r, i) => rows.findIndex((o) => same(o, r)) === i)

/**
 * `approval` resolved against `plan`, or a {@link RepoCleanerError} for one
 * that contradicts itself or names rows the plan does not have.
 */
export function resolveApproval(plan: Plan, approval: Approval, cwd: string): ResolvedApproval {
  const pick = uniq((approval.pick ?? []).map((t) => resolveRef(plan, t, '--pick', cwd)))
  const spare = uniq((approval.spare ?? []).map((t) => resolveRef(plan, t, '--spare', cwd)))
  for (const p of pick) {
    if (spare.some((s) => same(s, p))) {
      throw new RepoCleanerError('conflict', `${p.id} is both picked and spared`)
    }
  }
  const allow = (approval.allow ?? []).map((a) => {
    const { risk, row } = typeof a === 'string' ? { risk: a, row: undefined } : a
    if (!(RISKS as readonly string[]).includes(risk)) {
      throw new RepoCleanerError(
        'bad-input',
        `unknown risk ${JSON.stringify(risk)}: expected one of ${RISKS.join(', ')}`,
      )
    }
    if (row === undefined) return { risk, row: null }
    const at = resolveRef(plan, row, '--allow', cwd)
    if (spare.some((s) => same(s, at))) {
      throw new RepoCleanerError('conflict', `--allow ${risk}=${row}: ${at.id} is spared`)
    }
    if (pick.length > 0 && !pick.some((p) => same(p, at))) {
      throw new RepoCleanerError('conflict', `--allow ${risk}=${row}: ${at.id} is not picked`)
    }
    return { risk, row: at }
  })
  return { pick, spare, allow }
}

// ── the re-check ───────────────────────────────────────────────────────────

interface Accepted {
  repo: string
  row: Row
  /** `discard-changes` was allowed: the remove is forced. */
  force: boolean
  /** `abandon-unmerged` was allowed: work no remote has may go, a submodule's included. */
  abandon: boolean
}

function allowed(allow: ResolvedApproval['allow'], at: Resolved, risk: Risk): boolean {
  return allow.some((a) => a.risk === risk && (a.row === null || same(a.row, at)))
}

/** The plan repository's rows as they stand now, annotated as the sweep annotated them. */
function resweep(repo: PlanRepo, plan: Plan, kinds: readonly Kind[], opts: CheckOptions): Row[] {
  const branchScoped = plan.options.branch !== null
  const given = opts.sweep?.repos.find((r) => r.repo?.root === repo.root)
  if (given !== undefined && given.error === null) {
    return holdFreedBranches([...given.rows], branchScoped)
  }
  const swept = sweepRepo(repo.root, {
    ...opts,
    only: kinds,
    against: plan.options.against ?? undefined,
    provider: plan.options.provider,
    fetch: repo.fetched,
    branch: plan.options.branch ?? undefined,
    cwd: opts.cwd ?? process.cwd(),
  })
  if (swept.repo === null || swept.error !== null) {
    throw new Error(swept.error ?? `could not read repository: ${repo.root}`)
  }
  return swept.rows
}

interface Rechecked {
  accepted: Accepted[]
  dropped: Dropped[]
  /** Spared remote branches whose tips the run checks first. */
  verified: Accepted[]
}

/**
 * Re-sweep, then split the selection into rows to run and rows dropped. With
 * no pick every plan row is selected. `safeOnly` drops each one the re-sweep
 * does not judge `delete`.
 */
function recheck(
  plan: Plan,
  approval: ResolvedApproval,
  opts: CheckOptions,
  safeOnly: boolean,
): Rechecked {
  const implicit = approval.pick.length === 0
  // With no pick, every row that could run: a plan also holds the blocked and
  // structural rows, so a pick of one can be skipped with its reason.
  const selected: Resolved[] = implicit
    ? plan.repos.flatMap((r) =>
        r.rows
          .filter(runnable)
          .map((row) => ({ repo: r.root, id: row.id }))
          .filter((s) => !approval.spare.some((p) => same(p, s))),
      )
    : approval.pick
  const all = [...selected, ...approval.spare]
  const swept = new Map<string, Row[]>()
  for (const { repo: root } of all) {
    if (swept.has(root)) continue
    const repo = plan.repos.find((r) => r.root === root)!
    // Only the kinds the selection is in: a plan of local rows need not
    // compare every remote branch again. A branch brings its worktrees, which
    // decide whether it is free to go or held.
    const wanted = new Set(all.filter((s) => s.repo === root).map((s) => nameOf(s.id).kind))
    if (wanted.has('branch') && plan.options.only.includes('worktree')) wanted.add('worktree')
    const kinds = KINDS.filter((k) => wanted.has(k))
    swept.set(root, resweep(repo, plan, kinds, opts))
  }
  const planned = (s: Resolved) =>
    plan.repos.find((r) => r.root === s.repo)!.rows.find((row) => row.id === s.id)!
  const current = (s: Resolved): Row | undefined => swept.get(s.repo)!.find((r) => r.id === s.id)

  // A spared remote branch is checked, not dropped: one that moved refuses the run.
  const verified: Accepted[] = []
  for (const s of approval.spare) {
    if (nameOf(s.id).kind !== 'remote') continue
    const row = current(s)
    const plannedSha = planned(s).fingerprint['sha']
    if (row === undefined || row.kind !== 'remote') {
      throw new RepoCleanerError(
        'spared-changed',
        `spared ${s.id} is no longer on the remote; refusing to run`,
      )
    }
    if (typeof plannedSha !== 'string' || row.evidence.sha !== plannedSha) {
      throw new RepoCleanerError(
        'spared-changed',
        `spared ${s.id} moved since the plan (planned ${String(plannedSha)}, now ${row.evidence.sha}); refusing to run`,
      )
    }
    verified.push({ repo: s.repo, row, force: false, abandon: false })
  }

  const accepted: Accepted[] = []
  const dropped: Dropped[] = []
  for (const s of selected) {
    const drop = (reason: Dropped['reason'], detail: string): void => {
      dropped.push({ repo: s.repo, row: s.id, reason, detail })
    }
    const row = current(s)
    if (row === undefined) {
      drop('gone', 'no longer in the sweep')
      continue
    }
    if (row.action === null) {
      drop(row.verdict === 'blocked' ? 'blocked' : 'keep', row.why)
      continue
    }
    if (safeOnly && row.verdict !== 'delete') {
      drop('needs-pick', `${row.verdict}: ${row.why}; pick it to run it`)
      continue
    }
    const now = fingerprint(row)
    const was = planned(s).fingerprint
    if (!sameFingerprint(was, now)) {
      drop('changed', `planned ${JSON.stringify(was)}, now ${JSON.stringify(now)}`)
      continue
    }
    const missing = row.risks.filter((risk) => !allowed(approval.allow, s, risk))
    if (missing.length > 0) {
      drop('not-allowed', `needs ${missing.join(', ')}`)
      continue
    }
    accepted.push({
      repo: s.repo,
      row,
      force: allowed(approval.allow, s, 'discard-changes'),
      abandon: allowed(approval.allow, s, 'abandon-unmerged'),
    })
  }
  // A branch freed by its worktree's removal goes only with that worktree.
  const leaving = new Set(accepted.filter((a) => a.row.kind === 'worktree').map((a) => a.row.name))
  const held = accepted.filter(
    (a) =>
      a.row.kind === 'branch' &&
      a.row.evidence.worktree !== undefined &&
      !leaving.has(a.row.evidence.worktree),
  )
  for (const { repo, row } of held) {
    const worktree = row.kind === 'branch' ? row.evidence.worktree : undefined
    dropped.push({
      repo,
      row: row.id,
      reason: 'held',
      detail: `checked out in ${String(worktree)}, which this run does not remove`,
    })
  }
  return { accepted: accepted.filter((a) => !held.includes(a)), dropped, verified }
}

// ── one row per remote branch ──────────────────────────────────────────────

/**
 * A network URL as `host[:port]/path`, the same for `git@host:o/r.git`,
 * `ssh://git@host/o/r` and `https://host/o/r/`; the whole path is kept, so
 * nested groups stay apart. Null for a path on this machine, including
 * `file://` and a Windows drive path.
 */
export function networkRemoteKey(url: string): string | null {
  const u = url.trim()
  if (/^[a-z]:[\\/]/i.test(u) || /^file:/i.test(u)) return null
  const uri = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::(\d+))?(\/.*)?$/i.exec(u)
  const scp = uri === null ? /^(?:[^@/:]+@)?([^/:]+):(?!\/\/)(.+)$/.exec(u) : null
  const host = uri?.[1] ?? scp?.[1]
  if (host === undefined) return null
  const port = uri?.[2] === undefined ? '' : `:${uri[2]}`
  const path = (uri?.[3] ?? scp?.[2] ?? '').replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
  return `${host.toLowerCase()}${port}/${path}`
}

/**
 * One string per remote repository, so two clones that push to the same one
 * agree. Built from the push URLs git would use (`remote get-url --push
 * --all`, which applies `url.*.insteadOf` and `pushInsteadOf`). Null when git
 * reports no URL; such a row is never treated as a duplicate.
 */
function remoteKey(git: Git, repo: string, remote: string): string | null {
  const urls = git.at(repo).try.remoteGetUrls(remote, { push: true })
  if (!urls.ok || urls.value === null || urls.value.length === 0) return null
  const keys = urls.value.map(
    (url) =>
      networkRemoteKey(url) ?? resolve(repo, url.trim().replace(/^file:\/\/(localhost)?/i, '')),
  )
  return [...new Set(keys)].sort().join('\n')
}

/**
 * Keep the first row for each remote branch. Two clones of one remote each
 * list its branches; deleting one twice fails the second push and stops the
 * run, so the later row is dropped as `duplicate`, and one spared through
 * another clone as `spared`.
 */
function onePerRemoteBranch(r: Rechecked, git: Git): { accepted: Accepted[]; dropped: Dropped[] } {
  const keyOf = (a: Accepted): string | null => {
    if (a.row.kind !== 'remote') return null
    const remote = remoteKey(git, a.repo, a.row.evidence.remote)
    return remote === null ? null : `${remote}\0${a.row.evidence.branch}`
  }
  const sparedAt = new Map<string, string>()
  for (const a of r.verified) {
    const key = keyOf(a)
    if (key !== null) sparedAt.set(key, a.repo)
  }
  const seen = new Map<string, string>()
  const kept: Accepted[] = []
  const extra: Dropped[] = []
  for (const a of r.accepted) {
    if (a.row.kind !== 'remote') {
      kept.push(a)
      continue
    }
    const key = keyOf(a)
    const spared = key === null ? undefined : sparedAt.get(key)
    if (spared !== undefined) {
      extra.push({
        repo: a.repo,
        row: a.row.id,
        reason: 'spared',
        detail: `the same remote branch is spared through ${spared}`,
      })
      continue
    }
    const first = key === null ? undefined : seen.get(key)
    if (first !== undefined) {
      extra.push({
        repo: a.repo,
        row: a.row.id,
        reason: 'duplicate',
        detail: `the same remote branch is deleted from ${first}`,
      })
      continue
    }
    if (key !== null) seen.set(key, a.repo)
    kept.push(a)
  }
  return { accepted: kept, dropped: [...r.dropped, ...extra] }
}

// ── steps ──────────────────────────────────────────────────────────────────

function pending(
  repo: string,
  row: RowId | null,
  action: Step['action'],
  command: string,
  expectedSha: string | null = null,
): Step {
  return {
    repo,
    row,
    action,
    command,
    expectedSha,
    result: 'pending',
    error: null,
    verification: null,
  }
}

const pruneStep = (repo: string, row: RowId | null): Step =>
  pending(repo, row, 'prune-worktrees', worktreePruneCommand(repo))

function verifyStep({ repo, row }: Accepted): Step {
  const r = row as RemoteRow
  return pending(
    repo,
    r.id,
    'verify-remote',
    shellJoin(['git', 'ls-remote', r.evidence.remote, `refs/heads/${r.evidence.branch}`]),
    r.evidence.sha,
  )
}

function stepsFor({ repo, row, force }: Accepted): Step[] {
  switch (row.kind) {
    case 'worktree': {
      // Remove and prune both skip a locked worktree, so a stale lock goes first.
      const unlock =
        row.evidence.staleLock === true
          ? [pending(repo, row.id, 'unlock-worktree', worktreeUnlockCommand(repo, row.name))]
          : []
      if (row.action === 'prune') return [...unlock, pruneStep(repo, row.id)]
      const forced = force || row.evidence.forcedForSubmodules === true
      return [
        ...unlock,
        pending(
          repo,
          row.id,
          'remove-worktree',
          worktreeRemoveCommand(repo, row.name, { force: forced }),
        ),
      ]
    }
    case 'branch':
      return [
        pending(
          repo,
          row.id,
          'delete-branch',
          localDeleteCommand(row.name, row.evidence.sha),
          row.evidence.sha,
        ),
      ]
    case 'remote':
      return [
        pending(
          repo,
          row.id,
          'delete-remote',
          remoteDeleteCommand(row.evidence.remote, row.evidence.branch, row.evidence.sha),
          row.evidence.sha,
        ),
      ]
  }
}

interface Planned {
  steps: Array<[Step, Accepted | null]>
  dropped: Dropped[]
  accepted: Accepted[]
}

function planSteps(
  plan: Plan,
  approval: ResolvedApproval,
  opts: CheckOptions,
  safeOnly: boolean,
): Planned {
  const cwd = opts.cwd ?? process.cwd()
  const rechecked = recheck(plan, approval, opts, safeOnly)
  const { accepted, dropped } = onePerRemoteBranch(rechecked, new Git(cwd, { runner: opts.git }))
  const ordered = KINDS.flatMap((kind) => accepted.filter((a) => a.row.kind === kind))
  const steps: Array<[Step, Accepted | null]> = [
    // Spared tips first: one that moved stops the run before anything is deleted.
    ...rechecked.verified.map((a): [Step, Accepted | null] => [verifyStep(a), a]),
    ...ordered.flatMap((a) => stepsFor(a).map((step): [Step, Accepted | null] => [step, a])),
  ]
  for (const repo of new Set(ordered.map((a) => a.repo))) steps.push([pruneStep(repo, null), null])
  return { steps, dropped, accepted: ordered }
}

/** Plan repositories kept in the remote URL cache must still push only where they fetch from. */
function checkMirrors(plan: Plan, cacheDir: string): void {
  const dir = existsSync(cacheDir) ? realpathSync(cacheDir) : cacheDir
  for (const repo of plan.repos) {
    if (!repo.root.startsWith(dir + sep)) continue
    const problem = mirrorProblem(repo.root)
    if (problem !== null) throw new RepoCleanerError('bad-plan', `${problem}; refusing to run`)
  }
}

/**
 * What running `plan` under `approval` would do now: sweeps every repository
 * the selection is in again (or reads `opts.sweep`), and returns the steps
 * and the rows dropped, with why. Deletes nothing.
 *
 * @throws RepoCleanerError for an approval that contradicts itself, names a
 *   row the plan does not have or names one ambiguously, or spares a remote
 *   branch that moved. Nothing has been touched.
 */
export function check(plan: Plan, approval: Approval, opts: CheckOptions = {}): Preview {
  const cwd = opts.cwd ?? process.cwd()
  checkMirrors(plan, opts.cacheDir ?? defaultCacheDir())
  const resolved = resolveApproval(plan, approval, cwd)
  const { steps, dropped, accepted } = planSteps(plan, resolved, opts, resolved.pick.length === 0)
  for (const [step] of steps) step.result = 'would-run'
  const unusedAllows = resolved.allow
    .filter(
      (a) =>
        !accepted.some(
          (row) =>
            row.row.risks.includes(a.risk) &&
            (a.row === null || (a.row.repo === row.repo && a.row.id === row.row.id)),
        ),
    )
    .map((a) => ({ risk: a.risk, row: a.row?.id ?? null }))
  return { plan, approval: resolved, steps: steps.map(([s]) => s), dropped, unusedAllows }
}

// ── the run ────────────────────────────────────────────────────────────────

function errorText(err: unknown): string {
  if (err instanceof CommandFailed) return err.detail.trim() || err.message
  return err instanceof Error ? err.message : String(err)
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

/**
 * Refuse a remove forced for submodules that would now lose something not
 * allowed. The force skips git's own check, so this one stands in for it: the
 * worktree's own files must be clean unless `discard-changes` was allowed, and
 * every submodule clean (or `discard-changes`), pushed (or `abandon-unmerged`)
 * and readable, read afresh.
 */
function assertSubmodulesSafe(path: string, git: Git, a: Accepted): void {
  const reasons: string[] = []
  if (!a.force) {
    const status = git.at(path).statusPorcelain()
    if (status.length > 0) {
      reasons.push(`${path} has ${status.length} modified or untracked file(s) since the sweep`)
    }
  }
  const report = inspectSubmodules(git, path)
  reasons.push(...submoduleHazards(report, { discard: a.force, abandon: a.abandon }))
  if (reasons.length > 0) throw new Error(`refused: ${reasons.join('; ')}`)
}

/**
 * The gone worktrees a `git worktree prune` here would delete submodule work
 * with: each keeps, in its own git dir, a submodule git dir holding commits or
 * stashes no remote has, or one that cannot be read. Locked ones are left out,
 * since prune skips them, and so are those in `abandoned`, whose rows this run
 * prunes with `abandon-unmerged` allowed.
 */
function pruneHazards(at: Git, abandoned: ReadonlySet<string>): string[] {
  const common = at.soft.gitCommonDir()
  if (common === null) return []
  const out: string[] = []
  for (const w of at.worktrees()) {
    if (w.locked || existsSync(join(w.path, '.git'))) continue
    const gitDir = worktreeGitDir(common, w.path)
    if (gitDir === null) continue
    const hazards = submoduleHazards(inspectSubmodules(at, w.path, { gitDir }), {
      discard: true,
      abandon: abandoned.has(resolve(w.path)),
    })
    if (hazards.length > 0) out.push(`${w.path}: ${hazards.join('; ')}`)
  }
  return out
}

/** Run one step, then confirm it took. Throws with the reason on failure. */
function execute(
  step: Step,
  a: Accepted | null,
  git: Git,
  probe: ProcessProbe,
  abandoned: ReadonlySet<string>,
): string {
  const at = git.at(step.repo)
  const registered = (path: string): boolean =>
    at.worktrees().some((w) => resolve(w.path) === resolve(path))
  const row = a?.row

  switch (step.action) {
    case 'unlock-worktree': {
      if (row?.kind !== 'worktree') throw new Error('unlock without a worktree')
      const path = row.name
      // The sweep that accepted this row is behind us; ask again just before
      // acting, so an owner that came back keeps its lock.
      const owner = parseLockOwner(row.evidence.lockReason ?? null)
      if (owner === null) throw new Error(`refused: lock on ${path} names no owner`)
      if (probe.alive(owner.pid, owner.startedAt))
        throw new Error(`refused: lock owner pid ${owner.pid} is alive`)
      if (row.evidence.onDisk !== false) assertNoLiveProcess(path, probe)
      at.worktreeUnlock(path)
      const entry = at.worktrees().find((w) => resolve(w.path) === resolve(path))
      if (entry?.locked === true) throw new Error(`still locked: ${path}`)
      return 'lock owner dead, unlocked'
    }
    case 'prune-worktrees': {
      // Prune drops every gone worktree, not just this row's, and each one's
      // git dir with it, submodule git dirs included.
      const hazards = pruneHazards(at, abandoned)
      if (hazards.length > 0) {
        if (row === undefined) return `not pruned: ${hazards.join('; ')}`
        throw new Error(`refused: pruning would delete submodule work: ${hazards.join('; ')}`)
      }
      at.worktreePrune()
      if (row !== undefined && registered(row.name)) throw new Error('still registered after prune')
      return row === undefined ? 'pruned' : 'unregistered'
    }
    case 'remove-worktree': {
      if (row?.kind !== 'worktree') throw new Error('remove without a worktree')
      const path = row.name
      assertNoLiveProcess(path, probe)
      const forSubmodules = row.evidence.forcedForSubmodules === true
      if (forSubmodules) assertSubmodulesSafe(path, git, a!)
      at.worktreeRemove(path, { force: a!.force || forSubmodules })
      if (existsSync(path)) throw new Error(`directory still exists: ${path}`)
      if (registered(path)) throw new Error(`still registered: ${path}`)
      return 'directory gone and unregistered'
    }
    case 'delete-branch': {
      if (row?.kind !== 'branch') throw new Error('delete-branch without a branch')
      const name = row.name
      const holder = at.worktrees().find((w) => w.branch === name)
      if (holder !== undefined) throw new Error(`refused: checked out in ${holder.path}`)
      at.deleteRef(`refs/heads/${name}`, { expected: step.expectedSha! })
      // `update-ref -d` does not remove the `branch.<name>` config section.
      at.configRemoveSection(`branch.${name}`)
      if (at.resolveRef(`refs/heads/${name}`) !== null) throw new Error('ref still resolves')
      return 'ref does not resolve'
    }
    case 'verify-remote': {
      if (row?.kind !== 'remote') throw new Error('verify-remote without a remote branch')
      const ref = `refs/heads/${row.evidence.branch}`
      const tip = at.lsRemote(row.evidence.remote, ref).find((r) => r.ref === ref)
      if (tip === undefined)
        throw new Error(`refused: spared ${ref} is gone from ${row.evidence.remote}`)
      if (tip.sha !== step.expectedSha) {
        throw new Error(`refused: spared ${ref} moved to ${tip.sha}, planned ${step.expectedSha}`)
      }
      return 'tip unchanged; spared'
    }
    case 'delete-remote': {
      if (row?.kind !== 'remote') throw new Error('delete-remote without a remote branch')
      const { remote } = row.evidence
      const ref = `refs/heads/${row.evidence.branch}`
      const report = at.push(remote, `:${ref}`, {
        forceWithLease: { ref, expect: step.expectedSha! },
      })
      const refused = report.refs.find((r) => r.flag === '!')
      if (refused?.flag === '!') {
        const why = refused.rawReason === null ? '' : ` (${refused.rawReason})`
        throw new Error(`${refused.summary}${why}: ${PUSH_REJECTIONS[refused.rejection].message}`)
      }
      if (at.lsRemote(remote, ref).some((r) => r.ref === ref))
        throw new Error(`ls-remote still lists ${ref}`)
      return 'ls-remote lists nothing'
    }
  }
}

/**
 * Take the steps `preview` showed: sweeps again, drops a row that moved since
 * the preview, and runs the rest in order, compare-and-swap, verifying each
 * step and stopping at the first failure. Only what the preview showed runs; a
 * row it dropped stays dropped.
 *
 * @throws RepoCleanerError (`spared-changed`) when a spared remote branch moved
 *   since the preview. Nothing has been touched.
 */
export function run(preview: Preview, opts: RunOptions = {}): Receipt {
  const now = opts.now ?? (() => new Date())
  const cwd = opts.cwd ?? process.cwd()
  // Only the rows the preview would run, pinned to their repositories. A
  // spared tip check is not a selection; the approval carries it again.
  const shown = preview.steps.flatMap((s) =>
    s.row === null || s.action === 'verify-remote' ? [] : [{ repo: s.repo, id: s.row }],
  )
  const pick = uniq(shown)
  const approval: ResolvedApproval = {
    pick,
    spare: preview.approval.spare,
    allow: preview.approval.allow.filter(
      (a) => a.row === null || pick.some((p) => same(p, a.row!)),
    ),
  }
  const receipt: Receipt = {
    version: RECEIPT_VERSION,
    plan: opts.source ?? '(memory)',
    status: 'running',
    startedAt: now().toISOString(),
    finishedAt: null,
    dropped: [...preview.dropped],
    steps: [],
  }
  const save = (): void => {
    if (opts.receiptPath !== undefined) writeJsonAtomic(opts.receiptPath, receipt)
  }
  if (pick.length === 0) {
    receipt.status = 'complete'
    receipt.finishedAt = now().toISOString()
    save()
    return receipt
  }
  // A preview with no pick ran only `delete` rows; the run keeps that guard,
  // so a row the re-check now judges `review` drops rather than runs.
  const safeOnly = preview.approval.pick.length === 0
  const planned = planSteps(preview.plan, approval, { ...opts, sweep: undefined }, safeOnly)
  const known = new Set(receipt.dropped.map((d) => `${d.repo}\0${d.row}`))
  for (const d of planned.dropped) {
    if (!known.has(`${d.repo}\0${d.row}`)) receipt.dropped.push(d)
  }
  const plannedSteps = planned.steps
  receipt.steps = plannedSteps.map(([s]) => s)

  save()
  opts.onStart?.(receipt.steps)
  const git = new Git(cwd, { runner: opts.git })
  const probe = opts.probe ?? defaultProcessProbe()
  // Gone worktrees this run prunes with `abandon-unmerged`: their submodule
  // work was approved for deletion, so a prune need not spare it.
  const abandoned = new Set(
    planned.accepted
      .filter((a) => a.row.kind === 'worktree' && a.abandon)
      .map((a) => resolve(a.row.name)),
  )
  // Worktrees whose lock this run cleared. typed-git has no `worktree lock`
  // verb, so a failed remove cannot put the lock back; the receipt says so.
  const unlocked = new Set<string>()
  for (const [i, [step, a]] of plannedSteps.entries()) {
    opts.onStep?.(i, plannedSteps.length, step)
    try {
      step.verification = execute(step, a, git, probe, abandoned)
      step.result = 'ok'
      if (step.action === 'unlock-worktree') unlocked.add(a!.row.name)
    } catch (err) {
      step.result = 'failed'
      step.error = errorText(err)
      if (a !== null && step.action !== 'unlock-worktree' && unlocked.has(a.row.name)) {
        step.error += `; the lock on ${a.row.name} was cleared earlier in this run and is not restored`
      }
      receipt.status = 'failed'
      receipt.finishedAt = now().toISOString()
      // Told before the save, so a receipt that cannot be written still
      // leaves the step's outcome on screen.
      opts.onStepDone?.(i, plannedSteps.length, step)
      save()
      return receipt
    }
    opts.onStepDone?.(i, plannedSteps.length, step)
    save()
  }
  receipt.status = 'complete'
  receipt.finishedAt = now().toISOString()
  save()
  return receipt
}
