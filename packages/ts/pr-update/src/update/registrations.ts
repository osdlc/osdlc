/**
 * How a run takes the worktrees it made out of git's records.
 *
 * A worktree is removed with one `git worktree remove --force`, never two: git refuses a locked
 * worktree then, and the refusal is a failure, reported to the caller. pr-update writes no lock
 * checks of its own, and never removes a worktree's folder or record by hand. One lock is git's
 * own, not a person's: a `git worktree add` that was killed leaves its record locked with the
 * reason `initializing`. A run worktree locked so, whose run is over by its name, is unlocked
 * and removed ({@link removeWorktree}).
 *
 * In the project root's checkout the run then runs `git worktree prune`, as it always has. In
 * anyone else's checkout (a located `--repo` target) a bare prune would also drop the person's
 * own worktrees whose folders are missing, for instance on a drive that is not mounted, so the
 * run prunes nothing there, and only worktrees under pr-update's own directories are its own.
 */

import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import type { Git } from '@osdlc/typed-git'

import { realOr } from '../real-path.ts'
import { RUN_NAME, runTreeLive } from '../run-trees.ts'

/** Which worktrees a run may clean up, and how it tidies git's records after a removal. */
export interface WorktreeRecords {
  /** Whether `path` is a worktree this run may remove. */
  owns(path: string): boolean
  /** Tidy git's records after the run removed a worktree. */
  forget(git: Git): void
}

/** The project root's way: every worktree is the run's to clean, and `git worktree prune` tidies. */
export const PRUNE_ALL: WorktreeRecords = {
  owns: () => true,
  forget: (git) => {
    git.try.worktreePrune()
  },
}

/** `path` with every part that exists resolved through symlinks and Windows short names. */
function canonical(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(canonical(parent), basename(path))
  }
}

function isUnder(path: string, root: string): boolean {
  const rel = relative(canonical(root), canonical(path))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * The way for a checkout that is not the run's own: only worktrees under `roots` are the run's,
 * and nothing is pruned.
 */
export function ownedUnder(roots: readonly string[]): WorktreeRecords {
  return {
    owns: (path) => roots.some((root) => isUnder(path, root)),
    forget: () => {},
  }
}

/**
 * The `locked` file of git's record of the worktree at `path`, found in `git`'s common
 * directory by the record's `gitdir`, which names the tree's `.git`; or null when no record
 * names it, or the records cannot be read.
 */
function lockFileOf(git: Git, path: string): string | null {
  try {
    const found = git.try.gitCommonDir()
    if (!found.ok || found.value === null) return null
    const records = join(resolve(git.cwd, found.value), 'worktrees')
    const tree = realOr(path)
    for (const id of readdirSync(records)) {
      const record = join(records, id)
      let named: string
      try {
        named = readFileSync(join(record, 'gitdir'), 'utf8').trim()
      } catch {
        continue
      }
      const dotGit = resolve(record, named)
      if (realOr(dirname(dotGit)) === tree || dirname(dotGit) === path)
        return join(record, 'locked')
    }
  } catch {
    // Records that cannot be read: no lock is git's own.
  }
  return null
}

/**
 * Whether the worktree at `path` holds git's own lock from a `git worktree add` that was killed:
 * a run worktree, by its name, whose run is over (`runTreeLive`), locked with exactly
 * `initializing` (and one newline, as git writes it). A live run's tree may be mid-add.
 */
function addLeftLock(git: Git, path: string): boolean {
  if (RUN_NAME.exec(basename(path)) === null || runTreeLive(path)) return false
  const lock = lockFileOf(git, path)
  if (lock === null) return false
  try {
    const text = readFileSync(lock, 'utf8')
    return text === 'initializing' || text === 'initializing\n'
  } catch {
    return false
  }
}

/**
 * `git worktree remove --force <path>`, once, then `records.forget`. Returns why `path` stays
 * when git would not remove it (a locked worktree, say), or undefined. A dead run's worktree
 * that a killed `git worktree add` left locked ({@link addLeftLock}) is unlocked and removed;
 * any other lock is a person's, and stays.
 */
export function removeWorktree(
  git: Git,
  path: string,
  records: WorktreeRecords,
): string | undefined {
  let removed = git.try.worktreeRemove(path, { force: true })
  if (!removed.ok && addLeftLock(git, path) && git.try.worktreeUnlock(path).ok) {
    removed = git.try.worktreeRemove(path, { force: true })
  }
  if (!removed.ok) {
    const why = (removed.error.detail ?? removed.error.message).trim().split('\n')[0]
    return `${path} stays: git would not remove it: ${why}`
  }
  records.forget(git)
  return undefined
}
