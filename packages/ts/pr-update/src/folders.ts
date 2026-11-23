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

/** What is wrong with a folder, and how to put it right. */
export interface FolderProblem {
  problem: string
  fix?: string
}

/**
 * Who the check is run for. Each defaults to this process's; a test injects others, since it
 * cannot change its platform, uid or primary group.
 */
export interface GroupOptions {
  /**
   * Default `process.platform`. On `win32` no ownership or mode check is made: NTFS ACLs are not
   * read, mode bits mean nothing there, and {@link ownedByMe} passes every file (no uid).
   */
  platform?: NodeJS.Platform | undefined
  /** Default `process.getuid()`. */
  uid?: number | undefined
  /** The primary group. Default `process.getgid()`. */
  gid?: number | undefined
}

/** How a folder is checked, beyond its owner. */
export interface FolderCheckOptions extends GroupOptions {
  /** The fix to name for a folder others can write to. Default: `chmod go-w <dir>`. */
  fix?: ((dir: string) => string) | undefined
}

/**
 * Whether a folder whose group is `folderGid` belongs to a group of the person's alone: a user
 * private group, the setup where each user's primary group has the user's own id and no other
 * member (the default on Ubuntu, Debian and Fedora, where the umask is 002). Never on macOS,
 * where every user's primary group is the shared `staff`.
 */
function privateGroup(folderGid: number, opts: GroupOptions): boolean {
  const platform = opts.platform ?? process.platform
  const uid = opts.uid ?? process.getuid?.()
  const gid = opts.gid ?? process.getgid?.()
  return platform !== 'darwin' && uid !== undefined && gid === uid && folderGid === gid
}

/**
 * What is wrong with `dir`, whose stat is `st`, and how to fix it; null when nothing is. It must
 * belong to the person running pr-update, and on POSIX no one else may be able to write to it,
 * since they could otherwise put a folder of their own where a clone or worktree goes:
 * - writable by all (`o+w`) is refused, sticky bit or not;
 * - writable by its group (`g+w`) is refused, unless the group is the person's private group
 *   (`privateGroup`: not macOS, and the folder's group, the primary group and the uid are one
 *   number). Under a umask of 002 with user private groups, every folder a person makes is
 *   like that.
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
  if ((opts.platform ?? process.platform) === 'win32') return null
  const fix = (opts.fix ?? ((d: string) => `run \`chmod go-w ${d}\``))(dir)
  if ((st.mode & 0o002) !== 0) return { problem: `${dir} can be written by anyone`, fix }
  if ((st.mode & 0o020) !== 0 && !privateGroup(st.gid, opts)) {
    return {
      problem: `${dir} can be written by its group, which is not a private group of yours`,
      fix,
    }
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
