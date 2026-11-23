/**
 * Cleaning up pr-update's cache (D-0005, "Pruning clones"): `pr-update mirror prune`, the same
 * pruning at the end of an `update --apply` that touched the cache, and `pr-update mirror list`.
 *
 * Two walks:
 * - `worktrees/` in the cache, which holds the run worktrees of every target other than the
 *   project root, located or cloned. A run worktree whose run is dead is removed, whatever its
 *   age, through the git directory that owns it. Its `.git` file and that record's `commondir`
 *   are read first, so the owner is known before anything is touched. Only that worktree's own
 *   record is taken out of the owner: never a bare `git worktree prune`, which would also drop a
 *   person's worktrees whose folders are missing. A run worktree of a managed clone is removed
 *   only while holding the clone's lock, since a run never changes a clone without it.
 * - the clone directory, which must carry pr-update's marker. A clone past the age is removed
 *   under its lock, after its dead run worktrees. One with a kept worktree stays, unless
 *   `discardKept`; one with any other worktree, one whose lock another run holds, and a folder
 *   without the clone marker are never removed. A clone is first renamed to a `.tmp-*` name
 *   beside it, so a removal that fails part-way leaves a leftover the next prune recognises,
 *   not a broken clone in the way.
 *
 * Every walk skips names that start with `.`, except the two kinds of leftover it removes once
 * they are an hour old: `.tmp-<name>.git-<pid>` clone folders and `.pr-update-probe-*` probes.
 * No walk follows a symbolic link: a link is never descended into, removed through, or counted.
 * Pruning never waits for a lock, and every git call runs with hooks off.
 */

import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  type Stats,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'
import type { MachineConfigFile } from '@osdlc/config-layers'
import { osdlcDirs } from '@osdlc/ecosystem'
import { pidAlive, releaseLock } from '@osdlc/file-lock'
import { homeDir } from '@osdlc/tiered-dirs'
import { Git } from '@osdlc/typed-git'

import { machineFile, prUpdatePaths, type machineConfigSchema } from './machine.ts'
import {
  CLONE_MARKER,
  CLONE_STAMP,
  MIRROR_MARKER,
  checkClone,
  claimCloneLock,
  cloneLockPath,
  mirrorSetting,
  ownedByMe,
  type OwnedCheck,
} from './mirror.ts'
import { noHooksEnv, scratchBranch } from './update/execute.ts'
import { discardKept, listKept, type KeptPlace } from './update/kept.ts'
import { ownedUnder, removeWorktree } from './update/registrations.ts'

/** A leftover `.tmp-*` clone folder or `.pr-update-probe-*` probe younger than this is left alone. */
export const LEFTOVER_AGE_MS = 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

/** A run worktree's folder name: `<pid>.<time>`, as `update` names it. */
const RUN_NAME = /^(\d+)\.\d+$/

/** A clone folder `makeClone` left, or one a prune could not finish removing: `.tmp-<name>.git-<pid>`. */
const TMP_CLONE = /^\.tmp-(.+\.git)-\d+$/

const PROBE = /^\.pr-update-probe-/

/** Options shared by {@link listMirror} and {@link pruneMirror}. */
export interface MirrorWalkOptions {
  /** The environment: the osdlc directories, `PR_UPDATE_MIRROR_DIR` and the home directory. */
  env: Record<string, string | undefined>
  /** `--mirror-dir`, already absolute: the clone directory to walk instead of the run's own. */
  dir?: string | undefined
  /** Runs git. Defaults to typed-git's. */
  git?: CommandRunner | undefined
  /** Notes for the person: a machine file that does not load, say. */
  notice?: ((line: string) => void) | undefined
  /** The machine file. Default {@link machineFile} over `env`. */
  machine?: MachineConfigFile<typeof machineConfigSchema> | undefined
  /** Whether a file is the person's own. Default {@link ownedByMe}. */
  owned?: OwnedCheck | undefined
  /** The time now, in ms. A test moves it. */
  now?: (() => number) | undefined
}

/** The places a walk reads, and the machine file's age. */
interface Where {
  mirrorDir: string
  worktrees: string
  kept: string
  maxAgeDays: number
}

function where(opts: MirrorWalkOptions): Where {
  const file = opts.machine ?? machineFile({ env: opts.env })
  const { value, issues } = file.loadWithIssues()
  for (const issue of issues) {
    const key = issue.path.length === 0 ? '' : `${issue.path.join('.')}: `
    const message = (issue.message.split('\n')[0] ?? '').replace(/:\s*$/, '')
    opts.notice?.(`${file.path()}: ${key}${message}; it is ignored`)
  }
  const home = homeDir({ env: opts.env })
  const setting = mirrorSetting({ flag: opts.dir, env: opts.env, machine: value, home })
  const paths = prUpdatePaths(osdlcDirs({ env: opts.env, home }))
  return {
    mirrorDir: setting.dir,
    worktrees: paths.worktrees,
    kept: paths.kept,
    maxAgeDays: value.mirror_max_age_days,
  }
}

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path)
  } catch {
    return null
  }
}

/** The entries of `dir` that are real directories, not links, with names not starting with `.`. */
function subdirs(dir: string): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((n) => !n.startsWith('.') && lstatOrNull(join(dir, n))?.isDirectory() === true)
    .sort()
}

/** Every `<root>/<a>/<b>/<c>` folder, three levels down, through real directories only. */
function threeDown(root: string): { path: string; parts: [string, string, string] }[] {
  const out: { path: string; parts: [string, string, string] }[] = []
  for (const a of subdirs(root)) {
    for (const b of subdirs(join(root, a))) {
      for (const c of subdirs(join(root, a, b))) {
        out.push({ path: join(root, a, b, c), parts: [a, b, c] })
      }
    }
  }
  return out
}

/** The bytes the files under `path` take, by `lstat`: a link counts as itself, never its target. */
export function sizeOf(path: string): number {
  const st = lstatOrNull(path)
  if (st === null) return 0
  if (!st.isDirectory()) return st.size
  let total = 0
  let names: string[]
  try {
    names = readdirSync(path)
  } catch {
    return total
  }
  for (const n of names) total += sizeOf(join(path, n))
  return total
}

/** `bytes` for a person: `12.3 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let n = bytes / 1024
  let unit = 0
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024
    unit += 1
  }
  return `${n.toFixed(1)} ${units[unit]}`
}

/** When the clone at `clone` was last used: its stamp, else the clone marker's mtime. */
function lastUsed(clone: string): number {
  try {
    const at = Date.parse(readFileSync(join(clone, CLONE_STAMP), 'utf8').trim())
    if (Number.isFinite(at)) return at
  } catch {
    // No stamp: the marker was written with it, when the clone was made.
  }
  return lstatOrNull(join(clone, CLONE_MARKER))?.mtimeMs ?? 0
}

/** The git directory that owns a run worktree, read from its `.git` file and the record's `commondir`. */
interface Owner {
  /** The owning git directory (the clone, or a checkout's `.git`). */
  common: string
}

/**
 * Who owns the worktree at `tree`, or null when its records do not say so plainly. Its `.git` file
 * names the record `<common>/worktrees/<id>`, whose `commondir` gives the owner, and whose
 * `gitdir` must name this tree's `.git` back: a record that names another tree is not this one's.
 */
export function worktreeOwner(tree: string): Owner | null {
  try {
    const dotGit = join(tree, '.git')
    if (lstatSync(dotGit).isFile() !== true) return null
    const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))
    if (match === null) return null
    const record = resolve(tree, match[1]!.trim())
    const common = resolve(record, readFileSync(join(record, 'commondir'), 'utf8').trim())
    const back = resolve(record, readFileSync(join(record, 'gitdir'), 'utf8').trim())
    if (realpathSync(back) !== realpathSync(dotGit)) return null
    return { common }
  } catch {
    return null
  }
}

/** Whether the git directory at `path` is a managed clone: a real directory holding the clone marker. */
function isManagedClone(path: string): boolean {
  return (
    lstatOrNull(path)?.isDirectory() === true &&
    lstatOrNull(join(path, CLONE_MARKER))?.isFile() === true
  )
}

/** The git client pruning uses in an owner: hooks off, as for every target other than the root. */
function gitAt(path: string, runner: CommandRunner | undefined): Git {
  return new Git(path, { ...(runner === undefined ? {} : { runner }), env: noHooksEnv() })
}

/** One run worktree under `worktrees/`. */
export interface ListedWorktree {
  /** The worktree's folder. */
  path: string
  /** `host/owner/name`, from its place under `worktrees/`. */
  repo: string
  /** True while the run that made it is alive. */
  running: boolean
  /** The git directory that owns it, or null when its records do not say. */
  owner: string | null
}

/** One managed clone. */
export interface ListedClone {
  /** `host/owner/name`. */
  repo: string
  path: string
  /** The bytes its files take. */
  bytes: number
  /** When a run last used it, as an ISO time: the stamp. */
  lastUsed: string
  /** Its kept worktrees (`--keep-failed`), by path. */
  kept: string[]
}

/** What `mirror list` shows. */
export interface MirrorListing {
  /** The clone directory walked. */
  mirrorDir: string
  clones: ListedClone[]
  /** The cache's `worktrees/` directory walked. */
  worktreesDir: string
  worktrees: ListedWorktree[]
}

/** Every run worktree folder under `worktrees/`, with whether its run is alive. */
function runWorktrees(root: string): { path: string; repo: string; running: boolean }[] {
  const out: { path: string; repo: string; running: boolean }[] = []
  for (const { path: repoDir, parts } of threeDown(root)) {
    for (const name of subdirs(repoDir)) {
      const run = RUN_NAME.exec(name)
      if (run === null) continue
      out.push({ path: join(repoDir, name), repo: parts.join('/'), running: pidAlive(Number(run[1])) })
    }
  }
  return out
}

/** The kept place of `repo` (`host/owner/name`) in pr-update's state directory, as served from `clone`. */
function keptPlaceOf(kept: string, worktrees: string, repo: string, clone: string): KeptPlace {
  let gitDir: string | undefined
  try {
    gitDir = realpathSync(clone)
  } catch {
    gitDir = undefined
  }
  return {
    dir: join(kept, ...repo.split('/')),
    naming: 'repository',
    gitDir,
    records: ownedUnder([worktrees, kept]),
  }
}

/** The managed clones under a marked `mirrorDir`: `<host>/<owner>/<name>.git`. */
function clonesIn(
  mirrorDir: string,
  owned: OwnedCheck,
): { path: string; repo: string; state: ReturnType<typeof checkClone> }[] {
  const marker = lstatOrNull(join(mirrorDir, MIRROR_MARKER))
  if (marker === null || !marker.isFile() || !owned(marker)) return []
  const out: { path: string; repo: string; state: ReturnType<typeof checkClone> }[] = []
  for (const host of subdirs(mirrorDir)) {
    for (const owner of subdirs(join(mirrorDir, host))) {
      const dir = join(mirrorDir, host, owner)
      let names: string[]
      try {
        names = readdirSync(dir).sort()
      } catch {
        continue
      }
      for (const n of names) {
        if (n.startsWith('.') || !n.endsWith('.git')) continue
        const path = join(dir, n)
        out.push({
          path,
          repo: `${host}/${owner}/${n.slice(0, -'.git'.length)}`,
          state: checkClone(mirrorDir, path, owned),
        })
      }
    }
  }
  return out
}

/**
 * What `pr-update mirror list` shows: each managed clone, with its size, last use and kept
 * worktrees, and every run worktree under `worktrees/`. It takes no lock and changes nothing.
 */
export function listMirror(opts: MirrorWalkOptions): MirrorListing {
  const at = where(opts)
  const owned = opts.owned ?? ownedByMe
  const clones = clonesIn(at.mirrorDir, owned).flatMap(({ path, repo, state }) => {
    if (state !== 'clone') return []
    const place = keptPlaceOf(at.kept, at.worktrees, repo, path)
    const kept = listKept(place)
      .filter((r) => r.gitDir !== undefined && r.gitDir === place.gitDir)
      .map((r) => r.path)
    return [
      {
        repo,
        path,
        bytes: sizeOf(path),
        lastUsed: new Date(lastUsed(path)).toISOString(),
        kept,
      },
    ]
  })
  const worktrees = runWorktrees(at.worktrees).map((w) => ({
    ...w,
    owner: worktreeOwner(w.path)?.common ?? null,
  }))
  return { mirrorDir: at.mirrorDir, clones, worktreesDir: at.worktrees, worktrees }
}

/** `mirror list` as text. */
export function renderListText(l: MirrorListing): string {
  const lines: string[] = []
  if (l.clones.length === 0) lines.push(`no managed clones in ${l.mirrorDir}`)
  else {
    lines.push(`managed clones in ${l.mirrorDir}:`)
    for (const c of l.clones) {
      lines.push(`  ${c.repo}  ${formatBytes(c.bytes)}  last used ${c.lastUsed}  ${c.path}`)
      for (const k of c.kept) lines.push(`    kept worktree ${k}`)
    }
  }
  if (l.worktrees.length > 0) {
    lines.push(`run worktrees in ${l.worktreesDir}:`)
    for (const w of l.worktrees) {
      const state = w.running ? 'its run is still going' : 'left by a run that is gone'
      const owner = w.owner === null ? 'no owner on record' : `a worktree of ${w.owner}`
      lines.push(`  ${w.repo}  ${w.path}  (${state}; ${owner})`)
    }
  }
  return `${lines.join('\n')}\n`
}

/** Options for {@link pruneMirror}. */
export interface PruneOptions extends MirrorWalkOptions {
  /** Remove clones unused for more than this many days, instead of `mirror_max_age_days`. */
  olderThanDays?: number | undefined
  /** Remove every clone, whatever its age. */
  all?: boolean | undefined
  /** Only report what would be removed: take no lock, change nothing. */
  dryRun?: boolean | undefined
  /** Remove a clone's kept worktrees, so the clone can go too. */
  discardKept?: boolean | undefined
  /** Takes a lock, never waiting. Default {@link claimCloneLock}; a test records the calls. */
  claim?: ((path: string, waitMs: number) => string | null) | undefined
  /** Removes a folder and everything in it. Default `rmSync`; a test passes one that fails part-way. */
  remove?: ((path: string) => void) | undefined
}

/** One thing a prune removed, would remove, or left. */
export interface PruneEntry {
  /** `worktree` (a dead run's), `kept` (a kept worktree, with `discardKept`), `clone`, or `leftover`. */
  kind: 'worktree' | 'kept' | 'clone' | 'leftover'
  path: string
  /** `host/owner/name`, when known. */
  repo?: string | undefined
  /** The bytes it took (or takes, in a dry run). */
  bytes: number
  /** Why it was left, or the error that stopped its removal. */
  reason?: string | undefined
}

/** What a prune did. */
export interface PruneReport {
  dryRun: boolean
  /** The clone directory walked. */
  mirrorDir: string
  /** Every clone was eligible, whatever its age (`--all`). */
  all: boolean
  /**
   * The age in days a clone had to pass to be removed, or null when no age applied: with `all`,
   * or at `mirror_max_age_days: 0` with no `olderThanDays`, when no clone is removed.
   */
  olderThanDays: number | null
  /** What was removed, or would be in a dry run. */
  removed: PruneEntry[]
  /** What was left alone, with why. */
  skipped: PruneEntry[]
  /** What could not be removed, with the error. */
  failed: PruneEntry[]
  /** The bytes {@link removed} took. */
  freedBytes: number
}

/**
 * Prune pr-update's cache: dead run worktrees under `worktrees/` at any age, leftover `.tmp-*`
 * clone folders and probes older than an hour, and managed clones past the age. The age is
 * `olderThanDays`, else `mirror_max_age_days`; at `0` no clone is removed unless `olderThanDays`
 * or `all` is given. No lock is waited for.
 */
export function pruneMirror(opts: PruneOptions): PruneReport {
  const at = where(opts)
  const owned = opts.owned ?? ownedByMe
  const now = (opts.now ?? Date.now)()
  const claim = opts.claim ?? claimCloneLock
  const remove = opts.remove ?? ((path: string) => rmSync(path, { recursive: true, force: true }))
  const dryRun = opts.dryRun === true
  const report: PruneReport = {
    dryRun,
    mirrorDir: at.mirrorDir,
    all: opts.all === true,
    olderThanDays: null,
    removed: [],
    skipped: [],
    failed: [],
    freedBytes: 0,
  }
  const done = (e: PruneEntry): void => {
    report.removed.push(e)
    report.freedBytes += e.bytes
  }
  const fail = (e: PruneEntry, err: unknown): void => {
    report.failed.push({ ...e, reason: (err as Error).message.split('\n')[0] })
  }
  const records = ownedUnder([at.worktrees, at.kept])
  const busy = (lock: string): string => `mirror busy: another pr-update run holds ${lock}`

  /** Remove a dead run's worktree `tree` through `owner`, whose lock (if a clone's) is held. */
  const dropRunWorktree = (tree: string, owner: Owner | null, entry: PruneEntry): void => {
    try {
      if (owner !== null && existsSync(owner.common)) {
        const git = gitAt(owner.common, opts.git)
        removeWorktree(git, tree, records)
        git.try.deleteBranch(scratchBranch(tree), { force: true })
      }
      // Its owner is gone, or its records name no owner: only the folder is pr-update's to remove.
      if (lstatOrNull(tree) !== null) remove(tree)
      done(entry)
    } catch (e) {
      fail(entry, e)
    }
  }

  // Dead run worktrees, at any age.
  for (const w of runWorktrees(at.worktrees)) {
    if (w.running) continue
    const entry: PruneEntry = { kind: 'worktree', path: w.path, repo: w.repo, bytes: sizeOf(w.path) }
    const owner = worktreeOwner(w.path)
    if (dryRun) {
      done(entry)
      continue
    }
    if (owner === null || !isManagedClone(owner.common)) {
      dropRunWorktree(w.path, owner, entry)
      continue
    }
    // A clone is changed only under its lock.
    const lock = cloneLockPath(owner.common)
    const token = claim(lock, 0)
    if (token === null) {
      report.skipped.push({ ...entry, reason: busy(lock) })
      continue
    }
    try {
      dropRunWorktree(w.path, owner, entry)
    } finally {
      releaseLock(lock, token)
    }
  }

  // Probes a hard kill left, in `worktrees/` and `kept/`.
  for (const root of [at.worktrees, at.kept]) {
    for (const { path: dir } of threeDown(root)) {
      for (const name of namesIn(dir)) {
        if (!PROBE.test(name)) continue
        const path = join(dir, name)
        const st = lstatOrNull(path)
        if (st === null || !st.isDirectory() || now - st.mtimeMs < LEFTOVER_AGE_MS) continue
        const entry: PruneEntry = { kind: 'leftover', path, bytes: sizeOf(path) }
        if (dryRun) done(entry)
        else {
          try {
            remove(path)
            done(entry)
          } catch (e) {
            fail(entry, e)
          }
        }
      }
    }
  }

  // Leftover `.tmp-*` clone folders, under the lock of the clone they were for.
  const marked = (() => {
    const m = lstatOrNull(join(at.mirrorDir, MIRROR_MARKER))
    return m !== null && m.isFile() && owned(m)
  })()
  if (marked) {
    for (const host of subdirs(at.mirrorDir)) {
      for (const owner of subdirs(join(at.mirrorDir, host))) {
        const dir = join(at.mirrorDir, host, owner)
        for (const name of namesIn(dir)) {
          const tmp = TMP_CLONE.exec(name)
          if (tmp === null) continue
          const path = join(dir, name)
          const st = lstatOrNull(path)
          if (st === null || !st.isDirectory() || now - st.mtimeMs < LEFTOVER_AGE_MS) continue
          const entry: PruneEntry = {
            kind: 'leftover',
            path,
            repo: `${host}/${owner}/${tmp[1]!.slice(0, -'.git'.length)}`,
            bytes: sizeOf(path),
          }
          if (dryRun) {
            done(entry)
            continue
          }
          const lock = cloneLockPath(join(dir, tmp[1]!))
          const token = claim(lock, 0)
          if (token === null) {
            report.skipped.push({ ...entry, reason: busy(lock) })
            continue
          }
          try {
            remove(path)
            done(entry)
          } catch (e) {
            fail(entry, e)
          } finally {
            releaseLock(lock, token)
          }
        }
      }
    }
  }

  // Whole clones past the age.
  const days =
    opts.all === true
      ? null
      : (opts.olderThanDays ?? (at.maxAgeDays === 0 ? undefined : at.maxAgeDays))
  report.olderThanDays = days ?? null
  if (opts.all !== true && days === undefined) return report
  const old = (clone: string): boolean => days === null || now - lastUsed(clone) > days * DAY_MS
  for (const { path, repo, state } of clonesIn(at.mirrorDir, owned)) {
    const entry: PruneEntry = { kind: 'clone', path, repo, bytes: 0 }
    if (state !== 'clone') {
      report.skipped.push({ ...entry, reason: state === 'missing' ? 'gone' : state.foreign })
      continue
    }
    if (!old(path)) continue
    const lock = cloneLockPath(path)
    const token = dryRun ? null : claim(lock, 0)
    if (!dryRun && token === null) {
      report.skipped.push({ ...entry, bytes: sizeOf(path), reason: busy(lock) })
      continue
    }
    try {
      // Under the lock, again: a run may have used it since the walk began.
      if (checkClone(at.mirrorDir, path, owned) !== 'clone' || !old(path)) continue
      pruneClone(path, repo, entry)
    } finally {
      // The lock file goes last.
      if (token !== null) releaseLock(lock, token)
    }
  }
  return report

  /** Remove the clone at `path`, whose lock is held (or, in a dry run, say whether it would be). */
  function pruneClone(path: string, repo: string, entry: PruneEntry): void {
    const git = gitAt(path, opts.git)
    const place = keptPlaceOf(at.kept, at.worktrees, repo, path)
    const kept: { path: string; branch: string | null }[] = []
    const inUse: string[] = []
    for (const w of git.worktrees()) {
      if (w.bare) continue
      const run = RUN_NAME.exec(basename(w.path))
      if (ownedUnder([at.worktrees]).owns(w.path) && run !== null) {
        if (pidAlive(Number(run[1]))) inUse.push(w.path)
        // A dead run's worktree the walk above did not reach: its folder is gone, say.
        else if (!dryRun) {
          removeWorktree(git, w.path, records)
          git.try.deleteBranch(scratchBranch(w.path), { force: true })
        }
      } else if (ownedUnder([place.dir]).owns(w.path)) kept.push({ path: w.path, branch: w.branch })
      else inUse.push(w.path)
    }
    const bytes = sizeOf(path)
    if (inUse.length > 0) {
      report.skipped.push({ ...entry, bytes, reason: `in use by the worktree ${inUse.join(', ')}` })
      return
    }
    if (kept.length > 0 && opts.discardKept !== true) {
      report.skipped.push({
        ...entry,
        bytes,
        reason: `has kept worktrees (${kept.map((k) => k.path).join(', ')}); pass --discard-kept to remove them and the clone`,
      })
      return
    }
    if (dryRun) {
      for (const k of kept) done({ kind: 'kept', path: k.path, repo, bytes: sizeOf(k.path) })
      done({ ...entry, bytes })
      return
    }
    const recordsOf = new Map(listKept(place).map((r) => [canonicalOr(r.path), r]))
    for (const k of kept) {
      const keptEntry: PruneEntry = { kind: 'kept', path: k.path, repo, bytes: sizeOf(k.path) }
      try {
        const record = recordsOf.get(canonicalOr(k.path))
        if (record !== undefined) discardKept(git, place, record)
        else {
          // A kept tree with no record (a run stopped between making it and writing one).
          removeWorktree(git, k.path, records)
          if (k.branch?.startsWith('pr-update/failed-') === true) {
            git.try.deleteBranch(k.branch, { force: true })
          }
        }
        done(keptEntry)
      } catch (e) {
        fail(keptEntry, e)
        report.skipped.push({ ...entry, bytes, reason: `its kept worktree ${k.path} stays` })
        return
      }
    }
    // Renamed aside first: a removal that stops part-way leaves a `.tmp-*` leftover, which a later
    // prune removes, rather than a clone with files missing at the clone path.
    const aside = join(dirname(path), `.tmp-${basename(path)}-${process.pid}`)
    try {
      if (lstatOrNull(aside) !== null) remove(aside)
      renameSync(path, aside)
    } catch (e) {
      fail({ ...entry, bytes }, e)
      return
    }
    try {
      remove(aside)
      done({ ...entry, bytes })
    } catch (e) {
      report.failed.push({
        ...entry,
        bytes,
        reason: `${(e as Error).message.split('\n')[0]}; what is left, ${aside}, is removed by a later prune`,
      })
    }
  }
}

/** The names in `dir`, or none when it cannot be read. */
function namesIn(dir: string): string[] {
  try {
    return readdirSync(dir).sort()
  } catch {
    return []
  }
}

function canonicalOr(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** A prune as text: each thing removed (or that would be), each left with why, and the space. */
export function renderPruneText(r: PruneReport): string {
  const lines: string[] = []
  const verb = r.dryRun ? 'would remove' : 'removed'
  const label = (e: PruneEntry): string =>
    `${e.kind === 'clone' ? 'clone' : e.kind === 'kept' ? 'kept worktree' : e.kind === 'worktree' ? 'run worktree' : 'leftover'} ${e.path}`
  for (const e of r.removed) lines.push(`${verb} ${label(e)} (${formatBytes(e.bytes)})`)
  for (const e of r.skipped) lines.push(`left ${label(e)}: ${e.reason ?? ''}`)
  for (const e of r.failed) lines.push(`! could not remove ${label(e)}: ${e.reason ?? ''}`)
  if (r.removed.length === 0 && r.skipped.length === 0 && r.failed.length === 0) {
    lines.push('nothing to prune')
  } else lines.push(`${r.dryRun ? 'would free' : 'freed'} ${formatBytes(r.freedBytes)}`)
  return `${lines.join('\n')}\n`
}
