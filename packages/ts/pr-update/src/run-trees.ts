/**
 * What a run worktree's name and records say: whether the run that made it is alive, and which
 * git directory owns it. Shared by pruning, kept trees and worktree removal, so they judge a run
 * and an owner the same way.
 */

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { pidAlive, processStartedAt } from '@osdlc/file-lock'

import { realOr } from './real-path.ts'

/** A run worktree's folder name: `<pid>.<time>`, as `update` names it, the time in ms. */
export const RUN_NAME = /^(\d+)\.(\d+)$/

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
export function isRunning(run: RegExpExecArray, alive: RunAlive): boolean {
  return alive(Number(run[1]), Number(run[2]))
}

/** The run worktrees this process's runs are working in now, by real path. */
const held = new Set<string>()

/** Note that a run of this process works in the run worktree at `path` now. */
export function holdRunTree(path: string): void {
  held.add(realOr(path))
}

/** Note that no run of this process works in the run worktree at `path` any more. */
export function letGoRunTree(path: string): void {
  held.delete(realOr(path))
  held.delete(path)
}

/**
 * Whether the run worktree at `path` is one a run is working in now. A tree named for another
 * process is judged by its name ({@link isRunning} by `alive`). One named for this process is
 * judged by what this process holds ({@link holdRunTree}): a host that runs `update` more than
 * once in one process (a library host) would otherwise read every tree an earlier run of it kept
 * as a live run's.
 */
export function runTreeLive(path: string, alive: RunAlive = runAlive): boolean {
  const run = RUN_NAME.exec(basename(path))
  if (run === null) return false
  if (Number(run[1]) === process.pid) return held.has(realOr(path)) || held.has(path)
  return isRunning(run, alive)
}

export interface Owner {
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
 * The git directory the `.git` at `tree` names, or null when there is none. A `.git` folder names
 * itself: the tree is a repository's own checkout. A `.git` file names a record
 * `<common>/worktrees/<id>`, and the common directory is read from the record's `commondir`, or,
 * when the record is gone, taken as the folder two above it.
 *
 * @throws when `.git` or the record cannot be read for any reason but that it is not there.
 */
export function namedGitDir(tree: string): string | null {
  const dotGit = join(tree, '.git')
  let text: string
  try {
    if (lstatSync(dotGit).isDirectory()) return dotGit
    text = readFileSync(dotGit, 'utf8')
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw e
  }
  const match = /^gitdir:\s*(.+)$/m.exec(text)
  if (match === null) throw new Error(`${dotGit} does not name a git directory`)
  const record = resolve(tree, match[1]!.trim())
  try {
    return resolve(record, readFileSync(join(record, 'commondir'), 'utf8').trim())
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return dirname(dirname(record))
    throw e
  }
}

/** Why a folder may not be removed as a plain folder: see {@link rawRemovalProblem}. */
export interface RawRemovalProblem {
  /** `live`: a live run's worktree; `foreign`: a worktree of another git directory. */
  kind: 'live' | 'foreign'
  why: string
}

/**
 * Why the folder at `path`, which a kept record names, may not be removed as a plain folder (not
 * through git), or null. `gitDir` is the git directory the removal is for: the clone being pruned,
 * or the record's own git directory when that is gone. Refused are a live run's worktree, by
 * `live` (default {@link runTreeLive}), and a tree whose `.git` names another git directory, which
 * owns it. A record is JSON on disk, so its path alone never makes a folder removable.
 *
 * @throws when the tree's `.git` cannot be read: a folder that cannot be read stays.
 */
export function rawRemovalProblem(
  path: string,
  gitDir: string,
  live: (path: string) => boolean = runTreeLive,
): RawRemovalProblem | null {
  if (live(path)) {
    return { kind: 'live', why: `${path} is the worktree of a run that is still going` }
  }
  const named = namedGitDir(path)
  if (named !== null && realOr(named) !== realOr(gitDir)) {
    return { kind: 'foreign', why: `${path} is a worktree of ${realOr(named)}` }
  }
  return null
}
