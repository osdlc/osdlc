/**
 * Cleaning up pr-update's cache (D-0005, "Pruning clones"): `pr-update mirror prune`, the same
 * pruning at the end of an `update --apply` that touched the cache, and `pr-update mirror list`.
 *
 * Two walks:
 * - `worktrees/` in the cache, which holds the run worktrees of every target other than the
 *   project root, located or cloned. A run worktree whose run is dead ({@link runAliveWith}: by
 *   pid and start time) is removed, whatever its age, through the git directory that owns it. Its `.git` file and that record's `commondir`
 *   are read first, so the owner is known before anything is touched. Only that worktree's own
 *   record is taken out of the owner: never a bare `git worktree prune`, which would also drop a
 *   person's worktrees whose folders are missing. A run worktree of a managed clone is removed
 *   only while holding the clone's lock, since a run never changes a clone without it.
 * - the clone directory, which must carry pr-update's marker. A clone past the age is removed
 *   under its lock, after its dead run worktrees. One with a kept worktree stays, unless
 *   `discardKept`, and even then when a kept tree with no record is not on a
 *   `pr-update/failed-*` branch; one with any other worktree, one whose lock another run holds, and a folder
 *   without the clone marker are never removed. A clone is first renamed to a `.tmp-*` name
 *   beside it, so a removal that fails part-way leaves a leftover the next prune recognises,
 *   not a broken clone in the way.
 *
 * Every walk skips names that start with `.`, except the two kinds of leftover it removes once
 * they are an hour old: `.tmp-<name>.git-<pid>[-<random>]` folders (a clone's staging folder, or a clone a
 * removal stopped in) and `.pr-update-probe-*` probes.
 * No walk follows a symbolic link: a link is never descended into, removed through, or counted.
 * Nothing is removed from a folder someone else could write to (`folderProblem` in
 * `./folders.ts`); under `worktrees/` and `kept/` the fix named is `chmod -R go-w` on that
 * directory.
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
import { pidAlive, processStartedAt, releaseLock } from '@osdlc/file-lock'
import { homeDir } from '@osdlc/tiered-dirs'
import { Git } from '@osdlc/typed-git'

import {
  lstatOrNull,
  ownedByMe,
  placeProblem,
  type FolderCheckOptions,
  type GroupOptions,
  type OwnedCheck,
} from './folders.ts'
import { machineFile, prUpdatePaths, type machineConfigSchema } from './machine.ts'
import {
  CLONE_MARKER,
  CLONE_STAMP,
  MIRROR_MARKER,
  checkClone,
  claimCloneLock,
  cloneFolders,
  cloneLockPath,
  loadMirrorSetting,
} from './mirror.ts'
import { realOr } from './real-path.ts'
import { scratchBranch, targetGitOptions } from './update/execute.ts'
import { discardKept, keptTreeCheck, listKept, type KeptPlace } from './update/kept.ts'
import { ownedUnder, removeWorktree } from './update/registrations.ts'

/** A leftover `.tmp-*` clone folder or `.pr-update-probe-*` probe younger than this is left alone. */
export const LEFTOVER_AGE_MS = 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

/** A run worktree's folder name: `<pid>.<time>`, as `update` names it, the time in ms. */
const RUN_NAME = /^(\d+)\.(\d+)$/

/**
 * Whether the run with `pid`, which started its run at `startedAt` (ms), is still going. Default
 * {@link runAlive}; a test ends a run this way.
 */
export type RunAlive = (pid: number, startedAt: number) => boolean

/**
 * How long after the time in a run folder's name the process with its pid may have started and
 * still be read as that run. A run names its folder with the time it began, after its process
 * started, so its own process always started earlier. But the start time is read against the
 * wall clock, which a clock step (NTP, a suspended laptop, a person setting the time) can move
 * by more than the 2 s `sameProcess` allows, and a run misread as dead has its worktree
 * force-removed. So the margin is wide: 10 minutes. The cost is small: an unrelated process
 * that reuses a dead run's pid within 10 minutes of that run's start keeps its worktree until
 * the pid is free again.
 */
export const RUN_START_MARGIN_MS = 10 * 60 * 1000

/** The probes {@link runAliveWith} uses. Defaults: `pidAlive` and `processStartedAt` from `@osdlc/file-lock`. */
export interface RunProbes {
  /** Whether a process with the pid exists. */
  alive?: ((pid: number) => boolean) | undefined
  /** When the process with the pid started, in ms, or null when that cannot be read. */
  startedAt?: ((pid: number) => number | null) | undefined
}

/**
 * The run check over `probes`: a run is dead only when no process has its pid, or when the
 * process with that pid started more than {@link RUN_START_MARGIN_MS} after the time the folder
 * name records, so it is another, later process. A start time that cannot be read counts as
 * alive: the run is not ruled out. Pids name processes of one machine, so the cache must not be
 * shared between machines.
 */
export function runAliveWith(probes: RunProbes = {}): RunAlive {
  const alive = probes.alive ?? pidAlive
  const startedAt = probes.startedAt ?? ((pid: number) => processStartedAt(pid))
  return (pid, recorded) => {
    if (!alive(pid)) return false
    const start = startedAt(pid)
    return start === null || start - recorded <= RUN_START_MARGIN_MS
  }
}

/** The default run check: {@link runAliveWith} over this machine's processes. */
export const runAlive: RunAlive = runAliveWith()

/** Whether the run a folder name matched by {@link RUN_NAME} names is alive, by `alive`. */
function isRunning(run: RegExpExecArray, alive: RunAlive): boolean {
  return alive(Number(run[1]), Number(run[2]))
}

/**
 * A staging folder `makeClone` left (`.tmp-<name>.git-<pid>-<random>`), or a clone a prune could
 * not finish removing (`.tmp-<name>.git-<pid>`).
 */
const TMP_CLONE = /^\.tmp-(.+\.git)-\d+(?:-[A-Za-z0-9]{6})?$/

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
  /** Whose private group a group-writable folder may have. Default this process's; a test injects another. */
  group?: GroupOptions | undefined
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
  const home = homeDir({ env: opts.env })
  const { setting, machine } = loadMirrorSetting(file, {
    flag: opts.dir,
    env: opts.env,
    home,
    notice: opts.notice,
  })
  const paths = prUpdatePaths(osdlcDirs({ env: opts.env, home }))
  return {
    mirrorDir: setting.dir,
    worktrees: paths.worktrees,
    kept: paths.kept,
    maxAgeDays: machine.mirror_max_age_days,
  }
}

/**
 * Told of a path a walk could not read, with the error: a folder it could not list, or an entry
 * it could not `lstat` (one under a folder that cannot be searched, say). The walk goes on with
 * the rest, so one such path never stops a prune; {@link pruneMirror} reports it under `failed`.
 */
type Unreadable = (path: string, err: unknown) => void

/** Ignores what could not be read. */
const IGNORE: Unreadable = () => {}

/** The names in `dir`, sorted, or none when it is not there or cannot be read (told to `unreadable`). */
function namesIn(dir: string, unreadable: Unreadable = IGNORE): string[] {
  try {
    return readdirSync(dir).sort()
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') unreadable(dir, e)
    return []
  }
}

/** `lstat` of `path` as {@link lstatOrNull} gives it, or null after telling `unreadable` why not. */
function lstatOr(path: string, unreadable: Unreadable): Stats | null {
  try {
    return lstatOrNull(path)
  } catch (e) {
    unreadable(path, e)
    return null
  }
}

/** The entries of `dir` that are real directories, not links, with names not starting with `.`. */
function subdirs(dir: string, unreadable: Unreadable = IGNORE): string[] {
  return namesIn(dir, unreadable).filter(
    (n) => !n.startsWith('.') && lstatOr(join(dir, n), unreadable)?.isDirectory() === true,
  )
}

/** Every `<root>/<a>/<b>/<c>` folder, three levels down, through real directories only. */
function threeDown(
  root: string,
  unreadable: Unreadable = IGNORE,
): { path: string; parts: [string, string, string] }[] {
  const out: { path: string; parts: [string, string, string] }[] = []
  for (const a of subdirs(root, unreadable)) {
    for (const b of subdirs(join(root, a), unreadable)) {
      for (const c of subdirs(join(root, a, b), unreadable)) {
        out.push({ path: join(root, a, b, c), parts: [a, b, c] })
      }
    }
  }
  return out
}

/**
 * The bytes the files under `path` take, by `lstat`: a link counts as itself, never its target.
 * The size is only shown, so what cannot be read (a folder that cannot be searched, say) counts
 * as 0 rather than throwing: the removal it is shown for reports its own error, per entry.
 */
export function sizeOf(path: string): number {
  let st: Stats | null
  try {
    st = lstatOrNull(path)
  } catch {
    return 0
  }
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
 *
 * @throws when permission is denied to read them: an owner that cannot be read is not one that is
 *   gone, and its tree, if it is a clone's, is removed only under the clone's lock.
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
    if (realpathSync.native(back) !== realpathSync.native(dotGit)) return null
    return { common }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') throw e
    return null
  }
}

/**
 * Whether the git directory at `path` says it is a managed clone: it holds the clone marker. Such
 * an owner is changed only under its lock, and only when `checkClone` accepts it.
 */
function claimsToBeClone(path: string): boolean {
  return lstatOrNull(join(path, CLONE_MARKER)) !== null
}

/** The clone directory of the clone at `clone`: `<root>/<host>/<owner>/<name>.git`. */
const rootOf = (clone: string): string => dirname(dirname(dirname(clone)))

/** The git client pruning uses in an owner, as for every target other than the root (`targetGitOptions`). */
function gitAt(path: string, runner: CommandRunner | undefined): Git {
  return new Git(path, targetGitOptions(runner))
}

/** One run worktree under `worktrees/`. */
export interface ListedWorktree {
  /** The worktree's folder. */
  path: string
  /** `host/owner/name`, from its place under `worktrees/`. */
  repo: string
  /** True while the run that made it is alive. */
  running: boolean
  /** The git directory that owns it, or null when its records do not say or cannot be read. */
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

/** Every run worktree folder under `worktrees/`, with whether its run is `alive`. */
function runWorktrees(
  root: string,
  alive: RunAlive = runAlive,
  unreadable: Unreadable = IGNORE,
): { path: string; repo: string; running: boolean }[] {
  const out: { path: string; repo: string; running: boolean }[] = []
  for (const { path: repoDir, parts } of threeDown(root, unreadable)) {
    for (const name of subdirs(repoDir, unreadable)) {
      const run = RUN_NAME.exec(name)
      if (run === null) continue
      out.push({
        path: join(repoDir, name),
        repo: parts.join('/'),
        running: isRunning(run, alive),
      })
    }
  }
  return out
}

/** The kept place of `repo` (`host/owner/name`) in pr-update's state directory, as served from `clone`. */
function keptPlaceOf(
  kept: string,
  worktrees: string,
  repo: string,
  clone: string,
  rootCheck?: KeptPlace['rootCheck'],
): KeptPlace {
  let gitDir: string | undefined
  try {
    gitDir = realpathSync.native(clone)
  } catch {
    gitDir = undefined
  }
  return {
    dir: join(kept, ...repo.split('/')),
    naming: 'repository',
    gitDir,
    records: ownedUnder([worktrees, kept]),
    root: kept,
    rootCheck,
  }
}

/** The managed clones under a marked `mirrorDir`: `<host>/<owner>/<name>.git`. */
function clonesIn(
  mirrorDir: string,
  owned: OwnedCheck,
  group: GroupOptions = {},
  unreadable: Unreadable = IGNORE,
): { path: string; repo: string; state: ReturnType<typeof checkClone> }[] {
  const marker = lstatOr(join(mirrorDir, MIRROR_MARKER), unreadable)
  if (marker === null || !marker.isFile() || !owned(marker)) return []
  const out: { path: string; repo: string; state: ReturnType<typeof checkClone> }[] = []
  for (const host of subdirs(mirrorDir, unreadable)) {
    for (const owner of subdirs(join(mirrorDir, host), unreadable)) {
      const dir = join(mirrorDir, host, owner)
      for (const n of namesIn(dir, unreadable)) {
        if (n.startsWith('.') || !n.endsWith('.git')) continue
        const path = join(dir, n)
        let state: ReturnType<typeof checkClone>
        try {
          state = checkClone(mirrorDir, path, owned, group)
        } catch (e) {
          unreadable(path, e)
          continue
        }
        out.push({ path, repo: `${host}/${owner}/${n.slice(0, -'.git'.length)}`, state })
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
  // A listing changes nothing, so what it cannot read is a note, not a failure.
  const unreadable: Unreadable = (path, e) =>
    opts.notice?.(`${path} could not be read: ${(e as Error).message.split('\n')[0]}`)
  const clones = clonesIn(at.mirrorDir, owned, {}, unreadable).flatMap(({ path, repo, state }) => {
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
  const ownerOf = (tree: string): string | null => {
    try {
      return worktreeOwner(tree)?.common ?? null
    } catch (e) {
      unreadable(tree, e)
      return null
    }
  }
  const worktrees = runWorktrees(at.worktrees, runAlive, unreadable).map((w) => ({
    ...w,
    owner: ownerOf(w.path),
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
  /** Remove every clone, whatever its age (`--all-clones`). */
  allClones?: boolean | undefined
  /** Only report what would be removed: take no lock, change nothing. */
  dryRun?: boolean | undefined
  /** Remove a clone's kept worktrees, so the clone can go too. */
  discardKept?: boolean | undefined
  /** Takes a lock, never waiting. Default {@link claimCloneLock}; a test records the calls. */
  claim?: ((path: string, waitMs: number) => string | null) | undefined
  /** Removes a folder and everything in it. Default `rmSync`; a test passes one that fails part-way. */
  remove?: ((path: string) => void) | undefined
  /** Whether a run is still going. Default {@link runAlive}; a test ends a run this way. */
  alive?: RunAlive | undefined
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
  /**
   * For one left alone, what kind of reason: `folder`, a folder on its way someone else could
   * write to or owns; `foreign`, not a clone pr-update may change; `busy`, another run holds its
   * lock; `in-use`, a clone with a worktree in use; `kept`, a clone with kept worktrees.
   */
  skip?: PruneSkip | undefined
}

/** What kind of reason a thing was left for: {@link PruneEntry.skip}. */
export type PruneSkip = 'folder' | 'foreign' | 'busy' | 'in-use' | 'kept'

/** What a prune did. */
export interface PruneReport {
  dryRun: boolean
  /** The clone directory walked. */
  mirrorDir: string
  /** Every clone was eligible, whatever its age (`--all-clones`). */
  allClones: boolean
  /**
   * The age in days a clone had to pass to be removed, or null when no age applied: with `allClones`,
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
 * or `allClones` is given. No lock is waited for.
 */
export function pruneMirror(opts: PruneOptions): PruneReport {
  const at = where(opts)
  const owned = opts.owned ?? ownedByMe
  const now = (opts.now ?? Date.now)()
  const claim = opts.claim ?? claimCloneLock
  const remove = opts.remove ?? ((path: string) => rmSync(path, { recursive: true, force: true }))
  const dryRun = opts.dryRun === true
  const alive = opts.alive ?? runAlive
  const group = opts.group ?? {}
  /** The check of a folder under `worktrees/` or `kept/`, whose fix covers every folder below. */
  const ownFolders = (root: string): FolderCheckOptions => ({
    ...group,
    fix: () => `run \`chmod -R go-w ${root}\``,
  })
  const report: PruneReport = {
    dryRun,
    mirrorDir: at.mirrorDir,
    allClones: opts.allClones === true,
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
  /** Paths the walks could not read, each reported once under `failed`, as the walk's `kind`. */
  const unread = new Set<string>()
  const unreadable =
    (kind: PruneEntry['kind']): Unreadable =>
    (path, err) => {
      if (unread.has(path)) return
      unread.add(path)
      report.failed.push({
        kind,
        path,
        bytes: 0,
        reason: `could not be read: ${(err as Error).message.split('\n')[0]}`,
      })
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

  /** Prune the dead run's worktree `w`, reported as `entry`. */
  const pruneRunWorktree = (w: { path: string }, entry: PruneEntry): void => {
    const place = placeProblem(at.worktrees, w.path, owned, ownFolders(at.worktrees))
    if (place !== null) {
      report.skipped.push({ ...entry, skip: 'folder', reason: place })
      return
    }
    const owner = worktreeOwner(w.path)
    const clone = owner !== null && claimsToBeClone(owner.common)
    if (clone) {
      const state = checkClone(rootOf(owner.common), owner.common, owned, group)
      if (state !== 'clone') {
        const why = state === 'missing' ? 'it is gone' : state.foreign
        report.skipped.push({
          ...entry,
          skip: 'foreign',
          reason: `its owner ${owner.common} is not a clone pr-update may change: ${why}`,
        })
        return
      }
    }
    if (dryRun) {
      done(entry)
      return
    }
    if (!clone) {
      dropRunWorktree(w.path, owner, entry)
      return
    }
    // A clone is changed only under its lock.
    const lock = cloneLockPath(owner.common)
    const token = claim(lock, 0)
    if (token === null) {
      report.skipped.push({ ...entry, skip: 'busy', reason: busy(lock) })
      return
    }
    try {
      dropRunWorktree(w.path, owner, entry)
    } finally {
      releaseLock(lock, token)
    }
  }

  // Dead run worktrees, at any age. A check that throws (its owner cannot be read, say) fails that
  // worktree alone.
  for (const w of runWorktrees(at.worktrees, alive, unreadable('worktree'))) {
    if (w.running) continue
    const entry: PruneEntry = {
      kind: 'worktree',
      path: w.path,
      repo: w.repo,
      bytes: sizeOf(w.path),
    }
    try {
      pruneRunWorktree(w, entry)
    } catch (e) {
      fail(entry, e)
    }
  }

  // What the walk did with each run worktree, so the clones' own lists below neither report one
  // twice (a dry run) nor remove one it left (a folder someone else could write to, say).
  const reported = new Set(
    report.removed.filter((e) => e.kind === 'worktree').map((e) => realOr(e.path)),
  )
  const left = new Set(
    [...report.skipped, ...report.failed]
      .filter((e) => e.kind === 'worktree')
      .map((e) => realOr(e.path)),
  )

  // Probes a hard kill left, in `worktrees/` and `kept/`.
  for (const root of [at.worktrees, at.kept]) {
    const cannotRead = unreadable(root === at.kept ? 'kept' : 'worktree')
    for (const { path: dir } of threeDown(root, cannotRead)) {
      for (const name of namesIn(dir, cannotRead)) {
        if (!PROBE.test(name)) continue
        const path = join(dir, name)
        const st = lstatOr(path, unreadable('leftover'))
        if (st === null || !st.isDirectory() || now - st.mtimeMs < LEFTOVER_AGE_MS) continue
        const entry: PruneEntry = { kind: 'leftover', path, bytes: sizeOf(path) }
        try {
          const place = placeProblem(root, path, owned, ownFolders(root))
          if (place !== null) report.skipped.push({ ...entry, skip: 'folder', reason: place })
          else if (dryRun) done(entry)
          else {
            remove(path)
            done(entry)
          }
        } catch (e) {
          fail(entry, e)
        }
      }
    }
  }

  // Leftover `.tmp-*` clone folders, under the lock of the clone they were for.
  const cloneUnreadable = unreadable('clone')
  const marked = (() => {
    const m = lstatOr(join(at.mirrorDir, MIRROR_MARKER), cloneUnreadable)
    return m !== null && m.isFile() && owned(m)
  })()
  if (marked) {
    for (const host of subdirs(at.mirrorDir, cloneUnreadable)) {
      for (const owner of subdirs(join(at.mirrorDir, host), cloneUnreadable)) {
        const dir = join(at.mirrorDir, host, owner)
        for (const name of namesIn(dir, cloneUnreadable)) {
          const tmp = TMP_CLONE.exec(name)
          if (tmp === null) continue
          const path = join(dir, name)
          const st = lstatOr(path, unreadable('leftover'))
          if (st === null || !st.isDirectory() || now - st.mtimeMs < LEFTOVER_AGE_MS) continue
          const entry: PruneEntry = {
            kind: 'leftover',
            path,
            repo: `${host}/${owner}/${tmp[1]!.slice(0, -'.git'.length)}`,
            bytes: sizeOf(path),
          }
          let place: string | null
          try {
            place = placeProblem(at.mirrorDir, path, owned, { ...group, ...cloneFolders })
          } catch (e) {
            fail(entry, e)
            continue
          }
          if (place !== null) {
            report.skipped.push({ ...entry, skip: 'folder', reason: place })
            continue
          }
          if (dryRun) {
            done(entry)
            continue
          }
          const lock = cloneLockPath(join(dir, tmp[1]!))
          const token = claim(lock, 0)
          if (token === null) {
            report.skipped.push({ ...entry, skip: 'busy', reason: busy(lock) })
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

  // Whole clones past the age. At age 0 none, unless `olderThanDays` or `allClones` says otherwise.
  const days = opts.olderThanDays ?? (at.maxAgeDays === 0 ? null : at.maxAgeDays)
  report.olderThanDays = opts.allClones === true ? null : days
  if (opts.allClones !== true && days === null) return report
  const old = (clone: string): boolean =>
    opts.allClones === true || days === null || now - lastUsed(clone) > days * DAY_MS
  for (const { path, repo, state } of clonesIn(at.mirrorDir, owned, group, cloneUnreadable)) {
    const entry: PruneEntry = { kind: 'clone', path, repo, bytes: 0 }
    if (state !== 'clone') {
      report.skipped.push({
        ...entry,
        skip: 'foreign',
        reason: state === 'missing' ? 'gone' : state.foreign,
      })
      continue
    }
    if (!old(path)) continue
    const lock = cloneLockPath(path)
    const token = dryRun ? null : claim(lock, 0)
    if (!dryRun && token === null) {
      report.skipped.push({ ...entry, bytes: sizeOf(path), skip: 'busy', reason: busy(lock) })
      continue
    }
    try {
      // Under the lock, again: a run may have used it since the walk began.
      if (checkClone(at.mirrorDir, path, owned, group) !== 'clone' || !old(path)) continue
      pruneClone(path, repo, entry)
    } catch (e) {
      // git could not read the clone, say: it stays, and the other clones are still pruned.
      fail({ ...entry, bytes: sizeOf(path) }, e)
    } finally {
      // The lock file goes last.
      if (token !== null) releaseLock(lock, token)
    }
  }
  return report

  /** Remove the clone at `path`, whose lock is held (or, in a dry run, say whether it would be). */
  function pruneClone(path: string, repo: string, entry: PruneEntry): void {
    const git = gitAt(path, opts.git)
    const place = keptPlaceOf(at.kept, at.worktrees, repo, path, {
      owned,
      folders: ownFolders(at.kept),
    })
    const kept: { path: string; branch: string | null }[] = []
    const inUse: string[] = []
    /** Dead runs' worktrees the walk above left, with why: the clone stays with them. */
    const stays: string[] = []
    for (const w of git.worktrees()) {
      if (w.bare) continue
      const run = RUN_NAME.exec(basename(w.path))
      if (ownedUnder([at.worktrees]).owns(w.path) && run !== null) {
        const key = realOr(w.path)
        if (reported.has(key)) continue
        if (isRunning(run, alive)) inUse.push(w.path)
        else if (left.has(key)) stays.push(w.path)
        else {
          // A dead run's worktree the walk above did not reach: its folder is gone, say.
          const dead: PruneEntry = { kind: 'worktree', path: w.path, repo, bytes: sizeOf(w.path) }
          if (!dryRun) {
            removeWorktree(git, w.path, records)
            git.try.deleteBranch(scratchBranch(w.path), { force: true })
          }
          done(dead)
        }
      } else if (ownedUnder([place.dir]).owns(w.path)) kept.push({ path: w.path, branch: w.branch })
      else inUse.push(w.path)
    }
    const bytes = sizeOf(path)
    if (stays.length > 0) {
      report.skipped.push({
        ...entry,
        bytes,
        skip: 'in-use',
        reason: `its run worktree ${stays.join(', ')} was left, so the clone stays with it`,
      })
      return
    }
    if (inUse.length > 0) {
      report.skipped.push({
        ...entry,
        bytes,
        skip: 'in-use',
        reason: `in use by the worktree ${inUse.join(', ')}`,
      })
      return
    }
    if (kept.length > 0 && opts.discardKept !== true) {
      report.skipped.push({
        ...entry,
        bytes,
        skip: 'kept',
        reason: `has kept worktrees (${kept.map((k) => k.path).join(', ')}); pass --discard-kept to remove them and the clone`,
      })
      return
    }
    // Nothing is removed from a folder someone else could write to, so the clone stays with it.
    for (const k of kept) {
      const why = placeProblem(at.kept, k.path, owned, ownFolders(at.kept))
      if (why !== null) {
        report.skipped.push({ ...entry, bytes, skip: 'folder', reason: why })
        return
      }
    }
    // `listKept` gives no records for a folder it cannot list, which would pass each tree here for
    // one with no record. Listed first, so that throws and the clone fails with its kept trees.
    if (kept.length > 0 && lstatOrNull(place.dir) !== null) readdirSync(place.dir)
    const recordsOf = new Map(listKept(place).map((r) => [realOr(r.path), r]))
    // A kept tree with no record, or one whose record was refused, is removed only while the
    // clone lists it on a `pr-update/failed-*` branch: a run stopped between making it and
    // writing its record. On any other branch, or detached, a person has taken it over.
    const unrecorded = kept.filter(
      (k) => !recordsOf.has(realOr(k.path)) && k.branch?.startsWith('pr-update/failed-') !== true,
    )
    if (unrecorded.length > 0) {
      report.skipped.push({
        ...entry,
        bytes,
        skip: 'kept',
        reason: `its kept worktree ${unrecorded.map((k) => k.path).join(', ')} has no record and is not on a pr-update/failed-* branch, so a person may have taken it over; it stays, and so does the clone`,
      })
      return
    }
    // A kept tree with a record is removed only while its checkout lists it on the record's branch
    // (`keptTreeCheck`, which `discardKept` checks again). Checked here so a dry run says the same.
    for (const k of kept) {
      const record = recordsOf.get(realOr(k.path))
      if (record === undefined) continue
      const tree = keptTreeCheck(git, place, record)
      if (tree.kind === 'kept') continue
      report.skipped.push({
        ...entry,
        bytes,
        skip: 'kept',
        reason:
          tree.kind === 'moved'
            ? `its kept worktree ${tree.why}, so a person may have taken it over; it stays, and so does the clone`
            : `the record of its kept worktree ${k.path} is refused: ${tree.why}; the tree stays, and so does the clone`,
      })
      return
    }
    if (dryRun) {
      for (const k of kept) done({ kind: 'kept', path: k.path, repo, bytes: sizeOf(k.path) })
      done({ ...entry, bytes })
      return
    }
    for (const k of kept) {
      const keptEntry: PruneEntry = { kind: 'kept', path: k.path, repo, bytes: sizeOf(k.path) }
      try {
        const record = recordsOf.get(realOr(k.path))
        if (record !== undefined) discardKept(git, place, record)
        else {
          // On a `pr-update/failed-*` branch (checked above), with no record.
          removeWorktree(git, k.path, records)
          git.try.deleteBranch(k.branch!, { force: true })
        }
        done(keptEntry)
      } catch (e) {
        fail(keptEntry, e)
        report.skipped.push({
          ...entry,
          bytes,
          skip: 'kept',
          reason: `its kept worktree ${k.path} stays`,
        })
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
