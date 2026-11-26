/**
 * Cleaning up pr-update's cache (D-0005, "Pruning clones"): `pr-update mirror prune`, the same
 * pruning at the end of an `update --apply` that touched the cache, and `pr-update mirror list`.
 *
 * Two walks:
 * - `worktrees/` in the cache, which holds the run worktrees of every target other than the
 *   project root, located or cloned. A run worktree whose run is dead ({@link runAliveWith}: by
 *   pid and start time) is removed, whatever its age, through the git directory that owns it, when
 *   that lists it. Its `.git` file and that record's `commondir` are read first, so the owner is
 *   known before anything is touched. Only that worktree's own record is taken out of the owner:
 *   never a bare `git worktree prune`, which would also drop a person's worktrees whose folders
 *   are missing. A run worktree of a managed clone is removed only while holding the clone's
 *   lock, since a run never changes a clone without it.
 * - the clone directory, which must carry pr-update's marker. A clone past the age is removed
 *   under its lock, after its dead run worktrees. One with a kept worktree stays, unless
 *   `discardKept`, and even then when the clone does not list the tree on its record's branch (on
 *   a `pr-update/failed-*` branch, with no record); one with any other worktree, one whose lock
 *   another run holds, and a folder without the clone marker are never removed. A clone is first
 *   renamed to a `.tmp-*` name beside it, so a removal that fails part-way leaves a leftover the
 *   next prune recognises, not a broken clone in the way.
 *
 * Every removal passes one check first (`mayRemove` in {@link pruneMirror}, with the owner's
 * `git worktree list` and lock), and a dry run passes it too, so both decide the same way. What
 * cannot be read stays, and is reported under `failed`; only `ENOENT` and `ENOTDIR` say that
 * something is gone.
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
  accessSync,
  constants,
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
import { Git, type Worktree } from '@osdlc/typed-git'

import {
  isGone,
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
  cloneLockHeld,
  cloneLockPath,
  loadMirrorSetting,
} from './mirror.ts'
import { realOr } from './real-path.ts'
import { scratchBranch, targetGitOptions } from './update/execute.ts'
import {
  discardKept,
  keptOwnerElsewhere,
  keptTreeCheck,
  listKept,
  type KeptPlace,
  type KeptRecord,
} from './update/kept.ts'
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
  /** Why the machine file could not be read, when it could not: `maxAgeDays` is then the default. */
  machineUnread: Error | null
}

/** Why the machine file cannot be read, or null when it can or is not there. */
function unreadMachine(file: MachineConfigFile<typeof machineConfigSchema>): Error | null {
  try {
    file.read()
    return null
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR' ? null : (e as Error)
  }
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
    machineUnread: unreadMachine(file),
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

/** Throws the error of what could not be read. */
const THROW: Unreadable = (_, err) => {
  throw err
}

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
 * What cannot be read (a folder that cannot be searched, say) counts as 0, after `unreadable` is
 * told. With `emptying`, it is also told of a folder whose entries could not be removed.
 */
export function sizeOf(
  path: string,
  unreadable: Unreadable = IGNORE,
  emptying: boolean = false,
): number {
  const st = lstatOr(path, unreadable)
  if (st === null) return 0
  if (!st.isDirectory()) return st.size
  const names = namesIn(path, unreadable)
  if (emptying && names.length > 0) {
    try {
      accessSync(path, constants.W_OK | constants.X_OK)
    } catch (e) {
      unreadable(path, e)
    }
  }
  let total = 0
  for (const n of names) total += sizeOf(join(path, n), unreadable, emptying)
  return total
}

/** Something a prune may remove: what it takes, and the first error that says it would stop part-way. */
interface Measured {
  path: string
  bytes: number
  /** Set when something in it could not be read or removed, so all of it stays. */
  stuck?: unknown
}

function measure(path: string): Measured {
  const m: Measured = { path, bytes: 0 }
  const stuck: Unreadable = (_, err) => {
    m.stuck ??= err
  }
  m.bytes = sizeOf(path, stuck, true)
  return m
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

/** The text of `path`, or null when it is not there or cannot be read (told to `unreadable`). */
function textOr(path: string, unreadable: Unreadable): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') unreadable(path, e)
    return null
  }
}

/**
 * When the clone at `clone` was last used: its stamp, else the clone marker's mtime. A stamp that
 * cannot be read is told to `unreadable`, which throws in a prune: the marker's time is when the
 * clone was made.
 */
function lastUsed(clone: string, unreadable: Unreadable): number {
  const at = Date.parse(textOr(join(clone, CLONE_STAMP), unreadable)?.trim() ?? '')
  if (Number.isFinite(at)) return at
  // No stamp: the marker was written with it, when the clone was made.
  return lstatOrNull(join(clone, CLONE_MARKER))?.mtimeMs ?? 0
}

/**
 * Throws unless `listed`, the clone's `git worktree list`, has every worktree record the clone at
 * `clone` holds. git leaves out a record it cannot read, or whose `gitdir` is missing or empty,
 * with no error, so the clone would look as if nothing used it, while the tree may hold commits
 * only the clone has.
 */
function checkRecords(clone: string, listed: readonly Worktree[]): void {
  const records = join(clone, 'worktrees')
  for (const id of namesIn(records, THROW)) {
    const record = join(records, id)
    // git reads `<id>/gitdir`, so a plain file here is no record.
    const st = lstatOr(record, THROW)
    if (st === null || st.isFile()) continue
    textOr(join(record, 'HEAD'), THROW)
    const gitdir = join(record, 'gitdir')
    const named = textOr(gitdir, THROW)?.trim() ?? ''
    if (named === '') {
      throw new Error(
        `git does not list the worktree record ${record}: ${gitdir} is missing or empty`,
      )
    }
    // git lists a worktree by its `gitdir` without the `/.git` at its end.
    const at = resolve(record, named)
    const tree = basename(at) === '.git' ? dirname(at) : at
    if (!lists(listed, tree)) {
      throw new Error(`git does not list the worktree ${tree} that ${gitdir} names`)
    }
  }
}

/** The entry of `worktrees`, a git directory's list, for the one at `path`, if it has one. */
function entryOf(worktrees: readonly Worktree[], path: string): Worktree | undefined {
  const real = realOr(path)
  return worktrees.find((w) => w.path === path || realOr(w.path) === real)
}

/** Whether `worktrees`, a git directory's list, has the one at `path`. */
function lists(worktrees: readonly Worktree[], path: string): boolean {
  return entryOf(worktrees, path) !== undefined
}

/**
 * Why `w`, the listed worktree at `path`, stays for a `git worktree lock`, or null. The lock git
 * itself takes while `git worktree add` runs, `initializing`, is no reason: a killed add leaves
 * it behind. git writes that word in the language the add ran in, so a translated one is taken
 * for a person's lock.
 */
function lockedReason(w: Worktree, path: string): string | null {
  if (!w.locked || w.lockReason === 'initializing') return null
  const why = w.lockReason === null ? '' : ` (${w.lockReason})`
  return `${path} is locked${why}; \`git worktree unlock ${path}\` frees it`
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
 * @throws when they cannot be read for any reason but that they are not there: an owner that
 *   cannot be read is not one that is gone, and its tree, if it is a clone's, is removed only
 *   under the clone's lock.
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
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw e
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
    const kept = listKept(place, undefined, unreadable)
      .filter((r) => r.gitDir !== undefined && r.gitDir === place.gitDir)
      .map((r) => r.path)
    return [
      {
        repo,
        path,
        bytes: sizeOf(path),
        lastUsed: new Date(lastUsed(path, unreadable)).toISOString(),
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

/** Why a thing was left alone, as {@link PruneEntry} holds it. */
interface Left {
  skip: PruneSkip
  reason: string
}

/** What a prune did. */
export interface PruneReport {
  dryRun: boolean
  /** The clone directory walked. */
  mirrorDir: string
  /** Every clone was eligible, whatever its age (`--all-clones`). */
  allClones: boolean
  /**
   * The age in days a clone had to pass to be removed, or null when no age applied: with `allClones`,
   * or at `mirror_max_age_days: 0`, or with a machine file that cannot be read, and no
   * `olderThanDays`, when no clone is removed.
   */
  olderThanDays: number | null
  /** What was removed, or would be in a dry run. */
  removed: PruneEntry[]
  /** What was left alone, with why. */
  skipped: PruneEntry[]
  /** What could not be removed or read, with the error. */
  failed: PruneEntry[]
  /** The bytes {@link removed} took. */
  freedBytes: number
}

/**
 * Prune pr-update's cache: dead run worktrees under `worktrees/` at any age, leftover `.tmp-*`
 * clone folders and probes older than an hour, and managed clones past the age. The age is
 * `olderThanDays`, else `mirror_max_age_days`; at `0` no clone is removed unless `olderThanDays`
 * or `allClones` is given. What cannot be read stays (see the top of this file). No lock is waited
 * for.
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
  const skip = (e: PruneEntry, left: Left): void => {
    report.skipped.push({ ...e, ...left })
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
  const busy = (lock: string): Left => ({
    skip: 'busy',
    reason: `mirror busy: another pr-update run holds ${lock}`,
  })

  /**
   * The check every removal passes first, a dry run's too: why what was measured under `root` may
   * not be removed, or null. The folder rule must allow it (`placeProblem`), and it and the folders
   * from `root` down to it must be readable, those that lose an entry writable too. `root` gone is
   * no reason: nothing is there.
   *
   * @throws when one of them is not, with the error: it stays whole, and is reported under `failed`.
   */
  const mayRemove = (m: Measured, root: string, folders: FolderCheckOptions): Left | null => {
    if (isGone(root)) return null
    const place = placeProblem(root, m.path, owned, folders)
    if (place !== null) return { skip: 'folder', reason: place }
    const st = lstatOrNull(m.path)
    if (st?.isSymbolicLink() === true) {
      return { skip: 'folder', reason: `${m.path} is a symbolic link` }
    }
    const top = realOr(root)
    let need = constants.R_OK | constants.X_OK
    if (st !== null) need |= constants.W_OK
    for (let dir = dirname(m.path); ; dir = dirname(dir)) {
      if (!isGone(dir)) accessSync(dir, need)
      need = constants.R_OK | constants.X_OK
      if (dir === root || realOr(dir) === top || dir === dirname(dir)) break
    }
    if (m.stuck !== undefined) throw m.stuck
    return null
  }

  /**
   * Run `removal` holding `lock`, when there is one, and say whether it ran: false when another
   * run holds it. A dry run only looks at the lock.
   */
  const underLock = (lock: string | null, removal: () => void): boolean => {
    if (lock !== null && dryRun && cloneLockHeld(lock)) return false
    if (lock === null || dryRun) {
      removal()
      return true
    }
    const token = claim(lock, 0)
    if (token === null) return false
    try {
      removal()
    } finally {
      // The lock file goes last.
      releaseLock(lock, token)
    }
    return true
  }

  /** Remove a dead run's worktree `tree` through `owner`, whose lock (if a clone's) is held. */
  const dropRunWorktree = (tree: string, owner: Owner | null, entry: PruneEntry): void => {
    try {
      if (owner !== null) {
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

  /**
   * Whether the dead run's worktree that was measured may be removed, in a dry run or a real one:
   * why not (`left`), or the owner to remove it through, null when that is gone or its records
   * name none, and the owner's lock when it is a clone.
   *
   * @throws when it, its owner or its owner's list cannot be read.
   */
  const checkRunWorktree = (
    m: Measured,
  ): { left: Left } | { left: null; owner: Owner | null; lock: string | null } => {
    const place = mayRemove(m, at.worktrees, ownFolders(at.worktrees))
    if (place !== null) return { left: place }
    const owner = worktreeOwner(m.path)
    if (owner === null || isGone(owner.common)) return { left: null, owner: null, lock: null }
    const clone = claimsToBeClone(owner.common)
    const foreign = (reason: string): { left: Left } => ({ left: { skip: 'foreign', reason } })
    if (clone) {
      const state = checkClone(rootOf(owner.common), owner.common, owned, group)
      if (state !== 'clone') {
        const why = state === 'missing' ? 'it is gone' : state.foreign
        return foreign(`its owner ${owner.common} is not a clone pr-update may change: ${why}`)
      }
    }
    const entry = entryOf(gitAt(owner.common, opts.git).worktrees(), m.path)
    if (entry === undefined) {
      return foreign(`its owner ${owner.common} does not list it as a worktree`)
    }
    // `git worktree remove` refuses a locked one, and removing it by hand would ignore the lock.
    const locked = lockedReason(entry, m.path)
    if (locked !== null) return { left: { skip: 'in-use', reason: locked } }
    return { left: null, owner, lock: clone ? cloneLockPath(owner.common) : null }
  }

  // Dead run worktrees, at any age. A check that throws (its owner cannot be read, say) fails that
  // worktree alone.
  for (const w of runWorktrees(at.worktrees, alive, unreadable('worktree'))) {
    if (w.running) continue
    const m = measure(w.path)
    const entry: PruneEntry = { kind: 'worktree', path: w.path, repo: w.repo, bytes: m.bytes }
    try {
      const check = checkRunWorktree(m)
      if (check.left !== null) {
        skip(entry, check.left)
        continue
      }
      const { owner, lock } = check
      // A clone is changed only under its lock.
      const ran = underLock(lock, () => {
        if (dryRun) done(entry)
        else dropRunWorktree(w.path, owner, entry)
      })
      if (!ran) skip(entry, busy(lock!))
    } catch (e) {
      fail(entry, e)
    }
  }

  // The run worktrees a dry run reported, so a clone's own list below does not report one twice.
  const reported = new Set(
    report.removed.filter((e) => e.kind === 'worktree').map((e) => realOr(e.path)),
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
        const m = measure(path)
        const entry: PruneEntry = { kind: 'leftover', path, bytes: m.bytes }
        try {
          const left = mayRemove(m, root, ownFolders(root))
          if (left !== null) {
            skip(entry, left)
            continue
          }
          if (!dryRun) remove(path)
          done(entry)
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
          const m = measure(path)
          const entry: PruneEntry = {
            kind: 'leftover',
            path,
            repo: `${host}/${owner}/${tmp[1]!.slice(0, -'.git'.length)}`,
            bytes: m.bytes,
          }
          try {
            const left = mayRemove(m, at.mirrorDir, { ...group, ...cloneFolders })
            if (left !== null) {
              skip(entry, left)
              continue
            }
            const lock = cloneLockPath(join(dir, tmp[1]!))
            const ran = underLock(lock, () => {
              if (!dryRun) remove(path)
              done(entry)
            })
            if (!ran) skip(entry, busy(lock))
          } catch (e) {
            fail(entry, e)
          }
        }
      }
    }
  }

  // Whole clones past the age. At age 0 none, unless `olderThanDays` or `allClones` says otherwise.
  let days = opts.olderThanDays ?? (at.maxAgeDays === 0 ? null : at.maxAgeDays)
  if (opts.allClones !== true && opts.olderThanDays === undefined && at.machineUnread !== null) {
    // The age in it may be longer than the default, or 0, so no clone is taken for an old one.
    days = null
    if (marked) {
      const why = at.machineUnread.message.split('\n')[0]
      const reason = `the age of its clones, mirror_max_age_days could not be read: ${why}`
      report.failed.push({ kind: 'clone', path: at.mirrorDir, bytes: 0, reason })
    }
  }
  report.olderThanDays = opts.allClones === true ? null : days
  if (opts.allClones !== true && days === null) return report
  const old = (clone: string): boolean =>
    opts.allClones === true || days === null || now - lastUsed(clone, THROW) > days * DAY_MS
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
    try {
      if (!old(path)) continue
      const lock = cloneLockPath(path)
      const ran = underLock(lock, () => {
        // Under the lock, again: a run may have used it since the walk began.
        if (checkClone(at.mirrorDir, path, owned, group) !== 'clone' || !old(path)) return
        pruneClone(path, repo, entry)
      })
      if (!ran) skip({ ...entry, bytes: sizeOf(path) }, busy(lock))
    } catch (e) {
      // Its lock cannot be taken, or git could not read it, say: it stays, and the other clones
      // are still pruned.
      fail({ ...entry, bytes: sizeOf(path) }, e)
    }
  }
  return report

  /** Remove the clone at `path`, whose lock is held (or, in a dry run, say whether it would be). */
  function pruneClone(path: string, repo: string, entry: PruneEntry): void {
    const m = measure(path)
    const { bytes } = m
    const leave = (left: Left): void => skip({ ...entry, bytes }, left)
    const ofClones = { ...group, ...cloneFolders }
    // Renamed to this name before it is removed. What an earlier prune left there goes first.
    const aside = join(dirname(path), `.tmp-${basename(path)}-${process.pid}`)
    const place =
      mayRemove(m, at.mirrorDir, ofClones) ?? mayRemove(measure(aside), at.mirrorDir, ofClones)
    if (place !== null) {
      leave(place)
      return
    }
    const git = gitAt(path, opts.git)
    const worktrees = git.worktrees()
    // git in a clone it cannot read answers for a repository the clone is inside, if there is one.
    const bare = worktrees.filter((w) => w.bare)
    if (!lists(bare, path)) throw new Error(`git does not read ${path} as a clone of its own`)
    checkRecords(path, worktrees)
    const keptPlace = keptPlaceOf(at.kept, at.worktrees, repo, path, {
      owned,
      folders: ownFolders(at.kept),
    })
    const kept: { path: string; branch: string | null }[] = []
    /** Why kept trees stay for a `git worktree lock`. */
    const keptLocks: string[] = []
    const inUse: string[] = []
    /** Dead runs' worktrees that stay: the clone stays with them. */
    const stays: string[] = []
    const dead: Measured[] = []
    for (const w of worktrees) {
      if (w.bare) continue
      const run = RUN_NAME.exec(basename(w.path))
      if (ownedUnder([at.worktrees]).owns(w.path) && run !== null) {
        if (isRunning(run, alive)) {
          inUse.push(w.path)
          continue
        }
        // The walk above removed it, or its folder was gone already. One that is still there
        // stays, but for a dry run, where the walk removed nothing.
        const tree = measure(w.path)
        const check = checkRunWorktree(tree)
        const gone = lstatOrNull(w.path) === null
        const busyOwner =
          check.left === null && check.lock !== null && dryRun && cloneLockHeld(check.lock)
        if (check.left !== null || busyOwner || (!gone && !dryRun)) stays.push(w.path)
        else dead.push(tree)
      } else if (ownedUnder([keptPlace.dir]).owns(w.path)) {
        kept.push({ path: w.path, branch: w.branch })
        const locked = lockedReason(w, w.path)
        if (locked !== null) keptLocks.push(locked)
      } else inUse.push(w.path)
    }
    for (const d of dead) {
      if (dryRun && reported.has(realOr(d.path))) continue
      if (!dryRun) {
        removeWorktree(git, d.path, records)
        git.try.deleteBranch(scratchBranch(d.path), { force: true })
      }
      done({ kind: 'worktree', path: d.path, repo, bytes: d.bytes })
    }
    if (stays.length > 0) {
      leave({
        skip: 'in-use',
        reason: `its run worktree ${stays.join(', ')} was left, so the clone stays with it`,
      })
      return
    }
    if (inUse.length > 0) {
      leave({ skip: 'in-use', reason: `in use by the worktree ${inUse.join(', ')}` })
      return
    }
    if (kept.length > 0 && opts.discardKept !== true) {
      leave({
        skip: 'kept',
        reason: `has kept worktrees (${kept.map((k) => k.path).join(', ')}); pass --discard-kept to remove them and the clone`,
      })
      return
    }
    if (keptLocks.length > 0) {
      leave({
        skip: 'kept',
        reason: `its kept worktree ${keptLocks.join('; ')}; it stays, and so does the clone`,
      })
      return
    }
    // Nothing is removed from a folder someone else could write to, so the clone stays with it.
    for (const k of kept) {
      const left = mayRemove(measure(k.path), at.kept, ownFolders(at.kept))
      if (left !== null) {
        leave(left)
        return
      }
    }
    // A record that cannot be read is not one that is missing, so the clone fails with its trees.
    const recordsOf = new Map(listKept(keptPlace, undefined, THROW).map((r) => [realOr(r.path), r]))
    // A kept tree still on disk whose record names this clone, but which the clone does not list:
    // its record in the clone is gone (a `git worktree prune` while `kept/` was not mounted, say),
    // and its commits may be in this clone only.
    const real = realOr(path)
    const orphans = [...recordsOf.values()].filter(
      (r) =>
        r.gitDir !== undefined &&
        realOr(r.gitDir) === real &&
        !kept.some((k) => realOr(k.path) === realOr(r.path)),
    )
    if (orphans.length > 0) {
      leave({
        skip: 'kept',
        reason: `its kept worktree ${orphans.map((r) => r.path).join(', ')} is not in the clone's list of worktrees, though its record names this clone; it may hold commits only the clone has, so the clone stays`,
      })
      return
    }
    // A kept tree with no record, or one whose record was refused, is removed only while the
    // clone lists it on a `pr-update/failed-*` branch: a run stopped between making it and
    // writing its record. On any other branch, or detached, a person has taken it over.
    const unrecorded = kept.filter(
      (k) => !recordsOf.has(realOr(k.path)) && k.branch?.startsWith('pr-update/failed-') !== true,
    )
    if (unrecorded.length > 0) {
      leave({
        skip: 'kept',
        reason: `its kept worktree ${unrecorded.map((k) => k.path).join(', ')} has no record and is not on a pr-update/failed-* branch, so a person may have taken it over; it stays, and so does the clone`,
      })
      return
    }
    for (const k of kept) {
      const left = keptLeft(git, path, keptPlace, k, recordsOf.get(realOr(k.path)))
      if (left === null) continue
      leave({ skip: 'kept', reason: left })
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
        if (record !== undefined) discardKept(git, keptPlace, record)
        else {
          // On a `pr-update/failed-*` branch (checked above), with no record.
          removeWorktree(git, k.path, records)
          git.try.deleteBranch(k.branch!, { force: true })
        }
        done(keptEntry)
      } catch (e) {
        fail(keptEntry, e)
        leave({ skip: 'kept', reason: `its kept worktree ${k.path} stays` })
        return
      }
    }
    // Renamed aside first: a removal that stops part-way leaves a `.tmp-*` leftover, which a later
    // prune removes, rather than a clone with files missing at the clone path.
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

  /**
   * Why the kept tree `k`, which the clone at `clone` lists, stays with the clone under
   * `discardKept`, or null. The clone must list it on the branch of its `record`, if it has one
   * (with none, its caller checked the branch), the tree's own `.git` file must name this clone,
   * and the git directory the record names must list it too (`keptTreeCheck`, which `discardKept`
   * checks again) and be this clone: `discardKept` changes that directory, and only this clone's
   * lock is held. A copy of a clone, or a moved one, lists the tree whatever it is on by now.
   *
   * @throws when that git directory's list cannot be read.
   */
  function keptLeft(
    git: Git,
    clone: string,
    place: KeptPlace,
    k: { path: string; branch: string | null },
    record: KeptRecord | undefined,
  ): string | null {
    const stay = 'so a person may have taken it over; it stays, and so does the clone'
    if (record !== undefined && k.branch !== record.branch) {
      return `its kept worktree ${record.path} is on ${k.branch ?? 'a detached HEAD'}, not ${record.branch}, ${stay}`
    }
    const owner = worktreeOwner(k.path)
    const named = owner !== null && realOr(owner.common) === realOr(clone)
    if (!named && lstatOrNull(k.path) !== null) {
      return `its kept worktree ${k.path} does not name this clone in its .git file; it stays, and so does the clone (if the clone was moved, run \`git -C ${clone} worktree repair ${k.path}\`)`
    }
    if (record === undefined) return null
    const tree = keptTreeCheck(git, place, record)
    if (tree.kind === 'kept') {
      const elsewhere = keptOwnerElsewhere(place, record)
      if (elsewhere === null) return null
      return `the record of its kept worktree ${k.path} names another git directory, ${elsewhere}, which is changed only under its own lock; the tree stays, and so does the clone`
    }
    if (tree.kind === 'moved') return `its kept worktree ${tree.why}, ${stay}`
    if (tree.unlisted === true) throw new Error(`its kept worktree ${k.path}: ${tree.why}`)
    return `the record of its kept worktree ${k.path} is refused: ${tree.why}; the tree stays, and so does the clone`
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
