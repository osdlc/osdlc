/**
 * What a run worktree's name and records say: whether the run that made it is alive, and which
 * git directory owns it. Shared by pruning, kept trees and worktree removal, so they judge a run
 * and an owner the same way.
 */

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { pidAlive, processStartedAt } from '@osdlc/file-lock'

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
