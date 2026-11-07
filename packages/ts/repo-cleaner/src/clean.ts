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
 * 4. remote branches.
 *
 * A worktree whose directory is gone goes by its own record. One left without
 * its `.git` takes the repository-wide prune, last, and only while that prune
 * would drop nothing the run does not select.
 *
 * Branch deletes are compare-and-swap on the planned sha. Every step is
 * verified, and the receipt is rewritten after each.
 */

import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import { shellJoin } from '@osdlc/command-seam'
import { nodeGuard } from '@osdlc/path-guard/node'
import { Git, PUSH_REJECTIONS } from '@osdlc/typed-git'

import { localDeleteCommand, remoteDeleteCommand } from './branches.ts'
import type { Annotate } from './hooks.ts'
import { fingerprint, runnable, sameFingerprint, type Plan, type PlanRepo } from './plan.ts'
import { busyHolders, defaultProcessProbe, parseLockOwner, type ProcessProbe } from './processes.ts'
import { ALREADY_GONE, RECEIPT_VERSION, type Dropped, type Receipt, type Step } from './receipt.ts'
import { defaultCacheDir, mirrorProblem } from './remote-mirror.ts'
import { inspectSubmodules, submoduleHazards } from './submodules.ts'
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
  type SweptWith,
  parseRowId,
  sweepNotes,
  type RepoNote,
} from './types.ts'
import { errorText } from './util.ts'
import { removeIsForced, worktreeCommands } from './worktrees.ts'
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
 *            and the run stops if it is gone or moved since the plan. From an
 *            offline plan, one the remote already deleted passes as already
 *            gone, unless its tracking ref was pruned after the plan.
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
  /**
   * Told the run's own re-check's notes, before the first step: what it judged
   * without. The re-check may differ from the preview's, for example when a
   * listing fails only at the run.
   */
  onNotes?: ((notes: RepoNote[]) => void) | undefined
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
  /**
   * `RepoSweep.notes`, with each repository's root: what the re-check judged
   * without. With a sweep passed in (`CheckOptions.sweep`), every repository
   * of that sweep; otherwise each plan repository the re-check swept again.
   */
  notes: RepoNote[]
}

// ── resolving an approval ──────────────────────────────────────────────────

/** A row reference as typed: a kind and a name, or a bare name (`kind: null`). */
export interface RowRef {
  kind: Kind | null
  name: string
}

/**
 * `kind:name`, or a bare name. A word before a colon that is not a kind is an
 * error (a typo such as `wt:x`), but a path is a bare name whatever colons it
 * holds: a prefix with a path separator in it is never a kind.
 */
export function parseRowRef(text: string): RowRef {
  if (text === '') throw new RepoCleanerError('bad-input', 'an empty row')
  const id = parseRowId(text)
  if (id !== null) {
    if (id.name === '')
      throw new RepoCleanerError('bad-input', `bad row ${JSON.stringify(text)}: no name`)
    return id
  }
  const colon = text.indexOf(':')
  if (colon > 1 && !/[\\/]/.test(text.slice(0, colon))) {
    throw new RepoCleanerError(
      'bad-input',
      `bad row ${JSON.stringify(text)}: expected <kind>:<name> with kind one of ${KINDS.join(', ')}, or a bare name`,
    )
  }
  return { kind: null, name: text }
}

/** `<risk>` for every row, or `<risk>=<row>` for one. */
export function parseAllow(text: string): Allow {
  const eq = text.indexOf('=')
  const risk = eq < 0 ? text : text.slice(0, eq)
  checkRisk(risk)
  if (eq < 0) return { risk }
  const row = text.slice(eq + 1)
  if (row === '') throw new RepoCleanerError('bad-input', `--allow ${text} names no row`)
  return { risk, row }
}

function checkRisk(risk: string): asserts risk is Risk {
  if (!(RISKS as readonly string[]).includes(risk)) {
    throw new RepoCleanerError(
      'bad-input',
      `unknown risk ${JSON.stringify(risk)}: expected one of ${RISKS.join(', ')}`,
    )
  }
}

/** A conflict for a reference no sweep with `options` could hold: a kind it left out, or a row outside its `--branch`. */
function checkScope(
  options: Pick<SweptWith, 'only' | 'branch'>,
  ref: RowRef,
  flag: string,
  text: string,
): void {
  const { only, branch } = options
  if (ref.kind !== null && !only.includes(ref.kind)) {
    throw new RepoCleanerError(
      'conflict',
      `${flag} ${text}: the sweep has no ${ref.kind} rows (it sweeps ${only.join(', ')})`,
    )
  }
  const outside =
    branch !== null &&
    ((ref.kind === 'branch' && ref.name !== branch) ||
      (ref.kind === 'remote' && !ref.name.endsWith(`/${branch}`)))
  if (outside) {
    throw new RepoCleanerError('conflict', `${flag} ${text} is not a row of --branch ${branch}`)
  }
}

/**
 * What can be refused of `approval` before anything is swept: a malformed
 * row or risk, a row a sweep with `options` could never hold, and a row
 * picked and spared as written. A row named two ways, and an `allow` for a
 * spared or unpicked row, are found when the approval is resolved against
 * the plan.
 */
export function checkApproval(
  options: Pick<SweptWith, 'only' | 'branch'>,
  approval: Approval,
): void {
  const refs: Array<[string, string]> = [
    ...(approval.pick ?? []).map((t): [string, string] => ['--pick', t]),
    ...(approval.spare ?? []).map((t): [string, string] => ['--spare', t]),
  ]
  for (const a of approval.allow ?? []) {
    const { risk, row } = typeof a === 'string' ? { risk: a, row: undefined } : a
    checkRisk(risk)
    if (row !== undefined) refs.push(['--allow', row])
  }
  for (const [flag, text] of refs) checkScope(options, parseRowRef(text), flag, text)
  const both = (approval.pick ?? []).find((p) => (approval.spare ?? []).includes(p))
  if (both !== undefined)
    throw new RepoCleanerError('conflict', `${both} is both picked and spared`)
}

/** The names a worktree reference may match: as written, against `cwd`, and resolved through symlinks. */
function pathForms(name: string, cwd: string): Set<string> {
  const abs = isAbsolute(name) ? name : resolve(cwd, name)
  const forms = new Set([name, abs])
  try {
    forms.add(realpathSync(abs))
  } catch {
    // A gone worktree has no real path; the plan names it as git did.
  }
  return forms
}

/** The plan row `text` names, its scope checked first so a row the plan could never hold is a conflict, not a miss. */
function resolveRef(plan: Plan, text: string, flag: string, cwd: string): Resolved {
  const ref = parseRowRef(text)
  checkScope(plan.options, ref, flag, text)
  const paths = ref.kind === null || ref.kind === 'worktree' ? pathForms(ref.name, cwd) : null
  const hits: Resolved[] = []
  for (const repo of plan.repos) {
    for (const row of repo.rows) {
      const { kind, name } = parseRowId(row.id)!
      if (ref.kind !== null && ref.kind !== kind) continue
      if (kind === 'worktree' ? paths!.has(name) : ref.name === name) {
        hits.push({ repo: repo.root, id: row.id })
      }
    }
  }
  if (hits.length === 0) {
    throw new RepoCleanerError('not-found', `${flag} ${text}: no such row in the plan`)
  }
  if (hits.length > 1) {
    const where = [...new Set(hits.map((h) => `${h.id} in ${h.repo}`))].join(', ')
    throw new RepoCleanerError(
      'ambiguous',
      `${flag} ${text} matches ${hits.length} rows (${where}); sweep or plan only the repository it is in${ref.kind === null ? ', or name it by its full id' : ''}`,
    )
  }
  return hits[0]!
}

const keyOf = (r: Resolved): string => `${r.repo}\0${r.id}`
const same = (a: Resolved, b: Resolved): boolean => a.repo === b.repo && a.id === b.id
const uniq = (rows: Resolved[]): Resolved[] => [...new Map(rows.map((r) => [keyOf(r), r])).values()]

/**
 * `approval` resolved against `plan`, or a {@link RepoCleanerError} for one
 * that contradicts itself or names rows the plan does not have.
 */
export function resolveApproval(plan: Plan, approval: Approval, cwd: string): ResolvedApproval {
  checkApproval(plan.options, approval)
  const pick = uniq((approval.pick ?? []).map((t) => resolveRef(plan, t, '--pick', cwd)))
  const spare = uniq((approval.spare ?? []).map((t) => resolveRef(plan, t, '--spare', cwd)))
  const picked = new Set(pick.map(keyOf))
  const spared = new Set(spare.map(keyOf))
  const both = pick.find((p) => spared.has(keyOf(p)))
  if (both !== undefined)
    throw new RepoCleanerError('conflict', `${both.id} is both picked and spared`)
  const allow = (approval.allow ?? []).map((a) => {
    const { risk, row } = typeof a === 'string' ? { risk: a, row: undefined } : a
    if (row === undefined) return { risk, row: null }
    const at = resolveRef(plan, row, '--allow', cwd)
    if (spared.has(keyOf(at))) {
      throw new RepoCleanerError('conflict', `--allow ${risk}=${row}: ${at.id} is spared`)
    }
    if (pick.length > 0 && !picked.has(keyOf(at))) {
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
  /** `discard-changes` was allowed: modified and untracked files may go. */
  discard: boolean
  /** `abandon-unmerged` was allowed: work no remote has may go, a submodule's included. */
  abandon: boolean
}

function allowed(allow: ResolvedApproval['allow'], at: Resolved, risk: Risk): boolean {
  return allow.some((a) => a.risk === risk && (a.row === null || same(a.row, at)))
}

/**
 * The plan repository's rows as they stand now, annotated as the sweep
 * annotated them, and the sweep's notes on what it judged without.
 */
function resweep(
  repo: PlanRepo,
  plan: Plan,
  kinds: readonly Kind[],
  opts: CheckOptions,
): { rows: Row[]; notes: string[] } {
  const branchScoped = plan.options.branch !== null
  const given = opts.sweep?.repos.find((r) => r.repo?.root === repo.root)
  if (given !== undefined && given.error === null) {
    return { rows: holdFreedBranches([...given.rows], branchScoped), notes: given.notes }
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
  return { rows: swept.rows, notes: swept.notes }
}

interface Rechecked {
  accepted: Accepted[]
  dropped: Dropped[]
  /** Spared remote branches whose tips the run checks first. */
  verified: Accepted[]
  notes: RepoNote[]
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
  const spared = new Set(approval.spare.map(keyOf))
  // With no pick, every row that could run: a plan also holds the blocked and
  // structural rows, so a pick of one can be skipped with its reason.
  const selected: Resolved[] =
    approval.pick.length === 0
      ? plan.repos.flatMap((r) =>
          r.rows
            .filter(runnable)
            .map((row) => ({ repo: r.root, id: row.id }))
            .filter((s) => !spared.has(keyOf(s))),
        )
      : approval.pick
  const all = [...selected, ...approval.spare]
  const plannedRows = new Map(
    plan.repos.flatMap((r) => r.rows.map((row) => [keyOf({ repo: r.root, id: row.id }), row])),
  )
  const kindsIn = new Map<string, Set<Kind>>()
  for (const s of all) {
    const kinds = kindsIn.get(s.repo) ?? new Set<Kind>()
    kinds.add(parseRowId(s.id)!.kind)
    kindsIn.set(s.repo, kinds)
  }
  const currentRows = new Map<string, Row>()
  const notes: RepoNote[] = []
  for (const [root, wanted] of kindsIn) {
    const repo = plan.repos.find((r) => r.root === root)!
    // Only the kinds the selection is in: a plan of local rows need not
    // compare every remote branch again. A branch brings its worktrees, which
    // decide whether it is free to go or held.
    if (wanted.has('branch') && plan.options.only.includes('worktree')) wanted.add('worktree')
    const now = resweep(
      repo,
      plan,
      KINDS.filter((k) => wanted.has(k)),
      opts,
    )
    for (const row of now.rows) currentRows.set(keyOf({ repo: root, id: row.id }), row)
    for (const note of now.notes) notes.push({ repo: root, note })
  }
  const planned = (s: Resolved) => plannedRows.get(keyOf(s))!
  const current = (s: Resolved): Row | undefined => currentRows.get(keyOf(s))

  // A spared remote branch is checked, not dropped: one that moved refuses the run.
  const verified: Accepted[] = []
  for (const s of approval.spare) {
    if (parseRowId(s.id)!.kind !== 'remote') continue
    const row = current(s)
    const plannedSha = planned(s).fingerprint['sha']
    if (row === undefined || row.kind !== 'remote') {
      // Offline the re-check reads tracking refs, so a missing row means one
      // was pruned since the plan; a plan made now would not list it.
      const fetched = plan.repos.find((r) => r.root === s.repo)?.fetched === true
      throw new RepoCleanerError(
        'spared-changed',
        fetched
          ? `spared ${s.id} is no longer on the remote; refusing to run`
          : `spared ${s.id} is no longer among the remote-tracking refs (pruned since the plan?); refusing to run, plan again`,
      )
    }
    if (typeof plannedSha !== 'string' || row.evidence.sha !== plannedSha) {
      throw new RepoCleanerError(
        'spared-changed',
        `spared ${s.id} moved since the plan (planned ${String(plannedSha)}, now ${row.evidence.sha}); refusing to run`,
      )
    }
    verified.push({ repo: s.repo, row, discard: false, abandon: false })
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
    if (!runnable(row)) {
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
      discard: allowed(approval.allow, s, 'discard-changes'),
      abandon: allowed(approval.allow, s, 'abandon-unmerged'),
    })
  }
  // A branch freed by its worktree's removal goes only with that worktree.
  const leaving = new Set(accepted.filter((a) => a.row.kind === 'worktree').map((a) => a.row.name))
  const kept: Accepted[] = []
  for (const a of accepted) {
    const worktree = a.row.kind === 'branch' ? a.row.evidence.worktree : undefined
    if (worktree === undefined || leaving.has(worktree)) {
      kept.push(a)
      continue
    }
    dropped.push({
      repo: a.repo,
      row: a.row.id,
      reason: 'held',
      detail: `checked out in ${worktree}, which this run does not remove`,
    })
  }
  // A sweep passed in speaks for every repository it read, selected or not: a
  // repository with nothing to run is where a missing listing matters most.
  return {
    accepted: kept,
    dropped,
    verified,
    notes: opts.sweep === undefined ? notes : sweepNotes(opts.sweep),
  }
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
  // One `remote get-url` per repository and remote, not per row.
  const remotes = new Map<string, string | null>()
  const branchKey = (a: Accepted): string | null => {
    if (a.row.kind !== 'remote') return null
    const at = `${a.repo}\0${a.row.evidence.remote}`
    if (!remotes.has(at)) remotes.set(at, remoteKey(git, a.repo, a.row.evidence.remote))
    const remote = remotes.get(at)!
    return remote === null ? null : `${remote}\0${a.row.evidence.branch}`
  }
  const sparedAt = new Map<string, string>()
  for (const a of r.verified) {
    const key = branchKey(a)
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
    const key = branchKey(a)
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
  row: RowId,
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

function stepsFor({ repo, row }: Accepted): Step[] {
  switch (row.kind) {
    case 'worktree': {
      // The row's own commands: a stale lock's unlock, then the remove or prune.
      const commands = worktreeCommands(
        repo,
        row.evidence,
        row.action === 'prune' ? 'prune' : 'remove',
      )
      const last = commands.at(-1)!
      return [
        ...(commands.length > 1 ? [pending(repo, row.id, 'unlock-worktree', commands[0]!)] : []),
        pending(repo, row.id, row.action === 'prune' ? 'prune-worktrees' : 'remove-worktree', last),
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
  /** Worktrees this run removes or prunes, by resolved path. */
  removedHere: Set<string>
  notes: RepoNote[]
}

function planSteps(
  plan: Plan,
  approval: ResolvedApproval,
  opts: CheckOptions,
  safeOnly: boolean,
): Planned {
  const cwd = opts.cwd ?? process.cwd()
  const git = new Git(cwd, { runner: opts.git })
  const rechecked = recheck(plan, approval, opts, safeOnly)
  const unique = onePerRemoteBranch(rechecked, git)
  const dropped = [...unique.dropped]
  // A worktree whose directory is left without its `.git` goes only by the
  // repository-wide `git worktree prune`, which drops every gone worktree.
  // It runs last, and only while every other gone worktree it would drop goes
  // in this run anyway: a prune must not take a row the run did not select.
  const removedHere = new Set(
    unique.accepted.filter((a) => a.row.kind === 'worktree').map((a) => resolve(a.row.name)),
  )
  const accepted = unique.accepted.filter((a) => {
    if (!prunesAll(a.row)) return true
    const others = pruneCollateral(git.at(a.repo), removedHere)
    if (others.length === 0) return true
    dropped.push({
      repo: a.repo,
      row: a.row.id,
      reason: 'blocked',
      detail: `pruning it would also drop ${others.join(', ')}, which this run does not remove`,
    })
    return false
  })
  const ordered = KINDS.flatMap((kind) => {
    const of = accepted.filter((a) => a.row.kind === kind)
    return [...of.filter((a) => !prunesAll(a.row)), ...of.filter((a) => prunesAll(a.row))]
  })
  const steps: Array<[Step, Accepted | null]> = [
    // Spared tips first: one that moved stops the run before anything is deleted.
    ...rechecked.verified.map((a): [Step, Accepted | null] => [verifyStep(a), a]),
    ...ordered.flatMap((a) => stepsFor(a).map((step): [Step, Accepted | null] => [step, a])),
  ]
  return { steps, dropped, accepted: ordered, removedHere, notes: rechecked.notes }
}

/** A worktree row whose deletion takes the repository-wide prune: its directory is left without its `.git`. */
function prunesAll(row: Row): boolean {
  return row.kind === 'worktree' && row.action === 'prune' && row.evidence.directoryLeft === true
}

/**
 * The gone worktrees a `git worktree prune` in `at` would drop besides those
 * in `removed`: every one whose checkout is gone and that is not locked
 * (prune skips a locked one).
 */
function pruneCollateral(at: Git, removed: ReadonlySet<string>): string[] {
  return at
    .worktrees()
    .filter((w) => !w.locked && !existsSync(join(w.path, '.git')) && !removed.has(resolve(w.path)))
    .map((w) => w.path)
}

/** Plan repositories kept in the remote URL cache must still push only where they fetch from. */
function checkMirrors(plan: Plan, cacheDir: string): void {
  for (const repo of plan.repos) {
    if (!nodeGuard.contains(cacheDir, repo.root)) continue
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
  const { steps, dropped, accepted, notes } = planSteps(
    plan,
    resolved,
    opts,
    resolved.pick.length === 0,
  )
  for (const [step] of steps) step.result = 'would-run'
  const unusedAllows = resolved.allow
    .filter(
      (a) =>
        !accepted.some(
          (row) =>
            row.row.risks.includes(a.risk) &&
            (a.row === null || same(a.row, { repo: row.repo, id: row.row.id })),
        ),
    )
    .map((a) => ({ risk: a.risk, row: a.row?.id ?? null }))
  return { plan, approval: resolved, steps: steps.map(([s]) => s), dropped, unusedAllows, notes }
}

// ── the run ────────────────────────────────────────────────────────────────

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
 * Refuse a forced remove that would now lose something not allowed. The force
 * skips git's own check, so this one stands in for it: the worktree's own
 * files must be clean unless `discard-changes` was allowed, and every
 * submodule clean (or `discard-changes`), pushed (or `abandon-unmerged`) and
 * readable, read afresh.
 */
function assertSafeToForce(path: string, git: Git, a: Accepted): void {
  const reasons: string[] = []
  if (!a.discard) {
    const status = git.at(path).statusPorcelain()
    if (status.length > 0) {
      reasons.push(`${path} has ${status.length} modified or untracked file(s) since the sweep`)
    }
  }
  const report = inspectSubmodules(git, path)
  reasons.push(...submoduleHazards(report, { discard: a.discard, abandon: a.abandon }))
  if (reasons.length > 0) throw new Error(`refused: ${reasons.join('; ')}`)
}

/**
 * Run one step, then confirm it took. Throws with the reason on failure.
 *
 * @param liveTips the re-check read this repository's remote tips live, after
 *   a fetch, rather than from tracking refs that can outlive a deleted branch.
 */
function execute(
  step: Step,
  a: Accepted | null,
  git: Git,
  probe: ProcessProbe,
  removedHere: ReadonlySet<string>,
  liveTips: boolean,
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
      if (row?.kind !== 'worktree') throw new Error('prune without a worktree')
      // A worktree whose directory is gone goes on its own.
      if (row.evidence.directoryLeft !== true) {
        at.worktreeRemove(row.name)
        if (registered(row.name)) throw new Error('still registered after remove')
        return 'unregistered'
      }
      // `git worktree prune` drops every gone worktree, not just this row's;
      // asked again, so one that went stale since the check is not taken.
      const others = pruneCollateral(at, removedHere)
      if (others.length > 0) {
        throw new Error(`refused: pruning would also drop ${others.join(', ')}`)
      }
      at.worktreePrune()
      if (registered(row.name)) throw new Error('still registered after prune')
      return 'unregistered'
    }
    case 'remove-worktree': {
      if (row?.kind !== 'worktree') throw new Error('remove without a worktree')
      const path = row.name
      assertNoLiveProcess(path, probe)
      const force = removeIsForced(row.evidence)
      if (force) assertSafeToForce(path, git, a!)
      at.worktreeRemove(path, { force })
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
      // From tracking refs, the tip may name a branch the remote already
      // deleted; read live, after a fetch, its loss is a change since then.
      if (tip === undefined && !liveTips) return `${ALREADY_GONE}${row.evidence.remote}; spared`
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
        // A tracking ref outlives the branch until the next `fetch --prune`,
        // so an offline plan can name a branch the remote already deleted.
        // The lease then refuses; a ref the remote no longer lists is done.
        // Drop the stale tracking ref, as a delete push would have.
        if (!at.lsRemote(remote, ref).some((r) => r.ref === ref)) {
          const tracking = `refs/remotes/${remote}/${row.evidence.branch}`
          if (at.resolveRef(tracking) === step.expectedSha)
            at.deleteRef(tracking, { expected: step.expectedSha! })
          return `${ALREADY_GONE}${remote}`
        }
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
    s.action === 'verify-remote' ? [] : [{ repo: s.repo, id: s.row }],
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
  const finish = (status: 'complete' | 'failed'): Receipt => {
    receipt.status = status
    receipt.finishedAt = now().toISOString()
    save()
    return receipt
  }
  if (pick.length === 0) return finish('complete')
  // A preview with no pick ran only `delete` rows; the run keeps that guard,
  // so a row the re-check now judges `review` drops rather than runs.
  const safeOnly = preview.approval.pick.length === 0
  const planned = planSteps(preview.plan, approval, { ...opts, sweep: undefined }, safeOnly)
  opts.onNotes?.(planned.notes)
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
  const { removedHere } = planned
  // Worktrees whose lock this run cleared. typed-git has no `worktree lock`
  // verb, so a failed remove cannot put the lock back; the receipt says so.
  const unlocked = new Set<string>()
  // Repositories the re-check fetched, so it read their remote tips live.
  const fetched = new Set(preview.plan.repos.filter((r) => r.fetched).map((r) => r.root))
  for (const [i, [step, a]] of plannedSteps.entries()) {
    opts.onStep?.(i, plannedSteps.length, step)
    try {
      step.verification = execute(step, a, git, probe, removedHere, fetched.has(step.repo))
      step.result = 'ok'
      if (step.action === 'unlock-worktree') unlocked.add(a!.row.name)
    } catch (err) {
      step.result = 'failed'
      step.error = errorText(err)
      if (a !== null && step.action !== 'unlock-worktree' && unlocked.has(a.row.name)) {
        step.error += `; the lock on ${a.row.name} was cleared earlier in this run and is not restored`
      }
      // Told before the save, so a receipt that cannot be written still
      // leaves the step's outcome on screen.
      opts.onStepDone?.(i, plannedSteps.length, step)
      return finish('failed')
    }
    opts.onStepDone?.(i, plannedSteps.length, step)
    save()
  }
  return finish('complete')
}
