/**
 * How a run takes the worktrees it made out of git's records.
 *
 * In the project root's checkout the run removes a worktree and then runs `git worktree prune`,
 * as it always has. In anyone else's checkout (a located `--repo` target) a bare prune would also
 * drop the person's own worktrees whose folders are missing, for instance on a drive that is not
 * mounted. There the run touches only the records of worktrees under pr-update's own
 * directories, and only when `git worktree remove` could not.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import type { Git } from '@osdlc/typed-git'

/** Which worktrees a run may clean up, and how it forgets one. */
export interface WorktreeRecords {
  /** Whether `path` is a worktree this run may remove. */
  owns(path: string): boolean
  /**
   * After `git worktree remove --force <path>` was tried (`removed` says whether it worked), make
   * sure git no longer lists `path`.
   */
  forget(git: Git, path: string, removed: boolean): void
}

/** The project root's way: every worktree is the run's to clean, and `git worktree prune` forgets. */
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
 * The way for a checkout that is not the run's own: only worktrees under `roots` are the run's.
 * When removing one failed, its folder is deleted and its record, `<common>/worktrees/<id>/`, is
 * deleted too, but only the record whose `gitdir` names that worktree. Nothing else is pruned.
 */
export function ownedUnder(roots: readonly string[]): WorktreeRecords {
  const owns = (path: string): boolean => roots.some((root) => isUnder(path, root))
  return {
    owns,
    forget(git, path, removed) {
      if (removed || !owns(path)) return
      rmSync(path, { recursive: true, force: true })
      let common: string | null
      try {
        common = git.gitCommonDir()
      } catch {
        return
      }
      if (common === null) return
      const records = join(resolve(git.cwd, common), 'worktrees')
      let ids: string[]
      try {
        ids = readdirSync(records)
      } catch {
        return
      }
      const wanted = canonical(path)
      for (const id of ids) {
        let gitdir: string
        try {
          gitdir = readFileSync(join(records, id, 'gitdir'), 'utf8').trim()
        } catch {
          continue
        }
        // `gitdir` names the worktree's `.git` file.
        const tree = dirname(resolve(records, id, gitdir))
        if (canonical(tree) === wanted && owns(tree) && !existsSync(tree)) {
          rmSync(join(records, id), { recursive: true, force: true })
        }
      }
    },
  }
}

/** `git worktree remove --force <path>`, then `records.forget`. */
export function removeWorktree(git: Git, path: string, records: WorktreeRecords): void {
  const removed = git.try.worktreeRemove(path, { force: true }).ok
  records.forget(git, path, removed)
}
