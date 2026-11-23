/**
 * The folders pr-update keeps its clones and worktrees in: the mode it makes them with, and the
 * check every walk applies before it uses or removes anything in one (D-0005, "Clone step 1").
 * A leaf module, so the code that makes folders (`update/execute.ts`, `update/kept.ts`) and the
 * code that checks them (`mirror.ts`, `prune.ts`) share one rule without importing each other.
 */

import { lstatSync, statSync, type Stats } from 'node:fs'

/**
 * Whether a file belongs to the person running pr-update. The default, {@link ownedByMe},
 * compares the owner's uid on POSIX; a test injects its own, since it cannot change an owner.
 */
export type OwnedCheck = (st: Stats) => boolean

/** The owner's uid is this process's. On Windows, which has no uid, every file passes. */
export const ownedByMe: OwnedCheck = (st) =>
  typeof process.getuid !== 'function' || st.uid === process.getuid()

/**
 * The mode pr-update makes its folders with: never writable by group or others, whatever the
 * umask (a umask can only take bits away). Every folder pr-update makes in its own directories
 * is made with it, so its own check never refuses one.
 */
export const FOLDER_MODE = 0o755

/** Whether mode bits mean anything here: not on Windows. */
const POSIX = process.platform !== 'win32'

/** This process's primary group, or undefined where there are no groups (Windows). */
export function primaryGid(): number | undefined {
  return POSIX && typeof process.getgid === 'function' ? process.getgid() : undefined
}

/** What is wrong with a folder, and how to put it right. */
export interface FolderProblem {
  problem: string
  fix?: string
}

/** How a folder is checked, beyond its owner. */
export interface FolderCheckOptions {
  /** The group a group-writable folder may have. Default {@link primaryGid}; a test injects another. */
  gid?: number | undefined
  /** The fix to name for a folder others can write to. Default: `chmod go-w <dir>`. */
  fix?: ((dir: string) => string) | undefined
}

/**
 * What is wrong with `dir`, whose stat is `st`, and how to fix it; null when nothing is. It must
 * belong to the person running pr-update, and on POSIX no one else may be able to write to it,
 * since they could otherwise put a folder of their own where a clone or worktree goes:
 * - writable by all (`o+w`) is refused, unless the sticky bit is set, under which no one can
 *   rename or remove another's entries;
 * - writable by its group (`g+w`) is refused, unless the group is the process's primary group:
 *   under a umask of 002 with a group of one's own (the default on Ubuntu, Debian and Fedora),
 *   every folder a person makes is like that.
 *
 * A filesystem with no Unix permissions (exFAT, FAT, an SMB share) shows every folder as
 * writable by all, so it is refused too.
 */
export function folderProblem(
  dir: string,
  st: Stats,
  owned: OwnedCheck,
  opts: FolderCheckOptions = {},
): FolderProblem | null {
  if (!owned(st)) return { problem: `${dir} belongs to another user` }
  if (!POSIX) return null
  const fix = (opts.fix ?? ((d: string) => `run \`chmod go-w ${d}\``))(dir)
  if ((st.mode & 0o002) !== 0 && (st.mode & 0o1000) === 0) {
    return { problem: `${dir} can be written by anyone`, fix }
  }
  const gid = opts.gid ?? primaryGid()
  if ((st.mode & 0o020) !== 0 && st.gid !== gid) {
    return { problem: `${dir} can be written by its group, which is not your primary group`, fix }
  }
  return null
}

/**
 * What is wrong with `root` (followed if it is a symbolic link) or the folders `between` it and
 * something under it, as far as they exist ({@link folderProblem}; a folder between may not be a
 * symbolic link), and how to fix it; null when nothing is.
 */
export function foldersProblem(
  root: string,
  between: readonly string[],
  owned: OwnedCheck = ownedByMe,
  opts: FolderCheckOptions = {},
): FolderProblem | null {
  for (const [dir, st] of [
    [root, statOrNull(root)],
    ...between.map((d) => [d, lstatOrNull(d)] as const),
  ] as const) {
    if (st === null) break
    if (st.isSymbolicLink()) return { problem: `${dir} is a symbolic link` }
    const why = folderProblem(dir, st, owned, opts)
    if (why !== null) return why
  }
  return null
}

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

function statOrNull(path: string): Stats | null {
  try {
    return statSync(path)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}
