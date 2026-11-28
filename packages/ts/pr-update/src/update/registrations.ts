/**
 * How a run takes the worktrees it made out of git's records.
 *
 * A worktree is removed with one `git worktree remove --force`, never two: git refuses a locked
 * worktree then, and the refusal is a failure, reported to the caller. pr-update writes no lock
 * checks of its own, and never removes a worktree's folder or record by hand.
 *
 * In the project root's checkout the run then runs `git worktree prune`, as it always has. In
 * anyone else's checkout (a located `--repo` target) a bare prune would also drop the person's
 * own worktrees whose folders are missing, for instance on a drive that is not mounted, so the
 * run prunes nothing there, and only worktrees under pr-update's own directories are its own.
 */

import { realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'

import type { Git } from '@osdlc/typed-git'

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
 * `git worktree remove --force <path>`, once, then `records.forget`. Returns why `path` stays
 * when git would not remove it (a locked worktree, say), or undefined.
 */
export function removeWorktree(
  git: Git,
  path: string,
  records: WorktreeRecords,
): string | undefined {
  const removed = git.try.worktreeRemove(path, { force: true })
  if (!removed.ok) {
    const why = (removed.error.detail ?? removed.error.message).trim().split('\n')[0]
    return `${path} stays: git would not remove it: ${why}`
  }
  records.forget(git)
  return undefined
}
