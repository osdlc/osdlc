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
   * sure git no longer lists `path`. Returns why `path` was left in place when what decides
   * whether it may go could not be read; undefined otherwise.
   */
  forget(git: Git, path: string, removed: boolean): string | undefined
}

/** The project root's way: every worktree is the run's to clean, and `git worktree prune` forgets. */
export const PRUNE_ALL: WorktreeRecords = {
  owns: () => true,
  forget: (git) => {
    git.try.worktreePrune()
    return undefined
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
 * Whether a person locked a worktree with `git worktree lock`, from its list entry. The lock git
 * itself takes while `git worktree add` runs, `initializing`, is not one: a killed add leaves it
 * behind.
 */
export function lockedByPerson(w: { locked: boolean; lockReason: string | null }): boolean {
  return w.locked && w.lockReason !== 'initializing'
}

/**
 * The way for a checkout that is not the run's own: only worktrees under `roots` are the run's.
 * When removing one failed, its folder is deleted and its record, `<common>/worktrees/<id>/`, is
 * deleted too, but only the record whose `gitdir` names that worktree. Nothing else is pruned. A
 * worktree a person locked (`git worktree remove` fails on it) is left as it is, folder and record.
 * So is one whose record or lock cannot be read, as a prune leaves what it cannot read: git
 * refuses the removal then too, and the folder may hold uncommitted work.
 */
export function ownedUnder(roots: readonly string[]): WorktreeRecords {
  const owns = (path: string): boolean => roots.some((root) => isUnder(path, root))
  return {
    owns,
    forget(git, path, removed) {
      if (removed || !owns(path)) return undefined
      const found = recordOf(git, path)
      if (found !== null && typeof found === 'object') return `${path} stays: ${found.unread}`
      if (found !== null) {
        const lock = readLock(found)
        if ('unread' in lock) return `${path} stays: ${lock.unread}`
        if (lockedByPerson(lock)) return undefined
      }
      rmSync(path, { recursive: true, force: true })
      if (found !== null && owns(path) && !existsSync(path)) {
        rmSync(found, { recursive: true, force: true })
      }
      return undefined
    },
  }
}

/** Why a read failed, in a line, or null when the file or folder is not there. */
function unreadOf(what: string, e: unknown): string | null {
  const code = (e as NodeJS.ErrnoException).code
  if (code === 'ENOENT' || code === 'ENOTDIR') return null
  return `cannot read ${what}: ${code ?? (e as Error).message}`
}

/**
 * The record, `<common>/worktrees/<id>/`, whose `gitdir` names the worktree at `path`; null when
 * no record does. When a record that might be it cannot be read (no `gitdir`, an empty one, or
 * one that cannot be read), or the records cannot be listed, it says why: the caller cannot tell
 * whether the worktree is still registered, or locked.
 */
function recordOf(git: Git, path: string): string | null | { unread: string } {
  let common: string | null
  try {
    common = git.gitCommonDir()
  } catch (e) {
    return { unread: `cannot find its git directory: ${(e as Error).message.split('\n')[0]}` }
  }
  if (common === null) return { unread: 'cannot find its git directory' }
  const records = join(resolve(git.cwd, common), 'worktrees')
  let ids: string[]
  try {
    ids = readdirSync(records)
  } catch (e) {
    const why = unreadOf(records, e)
    return why === null ? null : { unread: why }
  }
  const wanted = canonical(path)
  let unread: string | null = null
  for (const id of ids) {
    const file = join(records, id, 'gitdir')
    let gitdir: string
    try {
      gitdir = readFileSync(file, 'utf8').trim()
    } catch (e) {
      // ENOTDIR: a stray file in `worktrees/`, not a record.
      if ((e as NodeJS.ErrnoException).code !== 'ENOTDIR') {
        unread ??= unreadOf(file, e) ?? `${file} is missing`
      }
      continue
    }
    if (gitdir === '') {
      unread ??= `${file} is empty`
      continue
    }
    // `gitdir` names the worktree's `.git` file.
    if (canonical(dirname(resolve(records, id, gitdir))) === wanted) return join(records, id)
  }
  return unread === null ? null : { unread }
}

/**
 * A record's lock, as `git worktree list` reads it: its `locked` file, whose text is the reason.
 * Only a `locked` file that is not there means no lock; one that cannot be read says why.
 */
function readLock(
  record: string,
): { locked: boolean; lockReason: string | null } | { unread: string } {
  const file = join(record, 'locked')
  try {
    const reason = readFileSync(file, 'utf8').trim()
    return { locked: true, lockReason: reason === '' ? null : reason }
  } catch (e) {
    const why = unreadOf(file, e)
    return why === null ? { locked: false, lockReason: null } : { unread: why }
  }
}

/**
 * `git worktree remove --force <path>`, then `records.forget`. Returns why `path` was left in
 * place when `forget` could not read what decides it (see {@link WorktreeRecords.forget}).
 */
export function removeWorktree(
  git: Git,
  path: string,
  records: WorktreeRecords,
): string | undefined {
  const removed = git.try.worktreeRemove(path, { force: true }).ok
  return records.forget(git, path, removed)
}
