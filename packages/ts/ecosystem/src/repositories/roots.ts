/**
 * The roots to scan for checkouts: the ones `repositories.yaml` lists, or,
 * when it lists none, the default roots worked out from the caller's own
 * checkout.
 */

import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { homeDir } from '@osdlc/tiered-dirs'
import { Git, readRemote, type SshAliasResolver } from '@osdlc/typed-git'

import { expandRoot, repositoriesFile, type RepositoriesFileOptions } from './file.ts'

/** Options shared by {@link resolveRoots}, {@link defaultRoots} and the locator. */
export interface RootsOptions extends RepositoriesFileOptions {
  /**
   * A path inside the caller's own checkout, such as a project root. The
   * default roots are worked out from it. Without it there are none.
   */
  caller?: string | undefined
  /**
   * Looks up the host an SSH config alias stands for, when an `origin` uses
   * one. Defaults to typed-git's, which runs `ssh -G`. Tests pass a fake.
   */
  resolveAlias?: SshAliasResolver | undefined
  /**
   * Runs git. Defaults to typed-git's, which spawns the `git` on an absolute
   * `PATH` entry. Either way, every call unsets the inherited variables that
   * pick a repository, such as the `GIT_DIR` a git hook exports.
   */
  runner?: CommandRunner | undefined
  /**
   * Called with each warning: a relative root, or a part of the file the
   * loader dropped. Each names the file. Defaults to a line on stderr.
   */
  onWarn?: ((message: string) => void) | undefined
}

/** Where the roots came from. */
export type RootsSource = 'file' | 'default'

/** The roots to scan, and where they came from. */
export interface ResolvedRoots {
  /** Existing directories to scan, absolute, in the order listed, each once. */
  roots: string[]
  /** `file` when `repositories.yaml` sets `roots`, `default` otherwise. */
  source: RootsSource
  /** The path of `repositories.yaml`, which may not exist. */
  file: string
}

/**
 * The roots to scan for checkouts.
 *
 * | `repositories.yaml`                | Roots                                     |
 * | ---------------------------------- | ----------------------------------------- |
 * | An absolute path, or one with `~/` | That directory. `~` is expanded           |
 * | A relative path                    | Dropped, with a warning naming the file   |
 * | A directory that does not exist    | Skipped silently: it may be another machine's |
 * | `roots: []`                        | None                                      |
 * | No file, or no `roots`             | {@link defaultRoots} of `caller`          |
 *
 * Throws when `OSDLC_REPOSITORIES` is relative.
 */
export function resolveRoots(opts: RootsOptions = {}): ResolvedRoots {
  const warn = opts.onWarn ?? defaultWarn
  const loaded = repositoriesFile(opts).load()
  for (const issue of loaded.issues) {
    const at = issue.path.length === 0 ? '' : `${issue.path.join('.')}: `
    warn(`${loaded.path}: ${at}${issue.message}`)
  }
  const listed = loaded.value.roots
  if (listed === undefined) {
    return { roots: defaultRoots(opts), source: 'default', file: loaded.path }
  }
  const home = homeOf(opts)
  const roots: string[] = []
  for (const entry of listed) {
    const root = expandRoot(entry, home)
    if (root === null) {
      warn(`${loaded.path}: root '${entry}' is not an absolute path; ignored`)
      continue
    }
    if (isDirectory(root) && !roots.includes(root)) roots.push(root)
  }
  return { roots, source: 'file', file: loaded.path }
}

/**
 * The roots to scan when `repositories.yaml` names none: the directory that
 * holds the caller's main checkout, or the one above it when that directory
 * is named after the owner in the caller's own `origin` (in any letter case),
 * so an `<owner>/<name>` layout resolves to the directory above every owner.
 *
 * It never steps to or above the home directory. A checkout directly in the
 * home directory keeps the home directory, an owner directory directly in it
 * keeps the owner directory, and a checkout that is the home directory (or
 * holds it) gives none. No `caller`, or a `caller` outside any checkout,
 * gives none.
 */
export function defaultRoots(opts: RootsOptions = {}): string[] {
  if (opts.caller === undefined || !existsSync(opts.caller)) return []
  // No ceiling here: the caller may be a subdirectory of its checkout.
  const git = new Git(resolve(opts.caller), { runner: withoutRepositoryVars(opts.runner) })
  const found = git.mainCheckout()
  if (found === null) return []
  // Compare real paths: git reports them, and a home under a symlink would never match.
  const main = realpathOr(found)
  const home = realpathOr(homeOf(opts))
  // The checkout is the home directory, or holds it.
  if (within(home, main)) return []
  const holder = dirname(main)
  // The holder is above the home directory, as `/` is for a checkout at `/widgets`.
  if (holder !== home && within(home, holder)) return []
  const above = dirname(holder)
  if (within(home, above)) return [holder]
  const owner = originOwner(git.at(main), opts.resolveAlias)
  const named = owner !== null && basename(holder).toLowerCase() === owner.toLowerCase()
  return [named ? above : holder]
}

/**
 * The variables that tell git which repository to use, whatever the
 * directory. A git hook exports `GIT_DIR`, and with it set the caller's
 * checkout, and every directory the scan finds, would answer as the hook's
 * repository. The inherited `GIT_CEILING_DIRECTORIES` goes too; the scan sets
 * its own.
 */
const REPOSITORY_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
] as const

/**
 * `runner`, or the default git runner, with {@link REPOSITORY_VARS} unset in
 * each child: command-seam
 * drops a variable whose value is `undefined`. A value the call sets, such
 * as the ceiling, still wins.
 */
export function withoutRepositoryVars(
  runner: CommandRunner = spawnRunner('git', { absolutePathOnly: true }),
): CommandRunner {
  const unset = Object.fromEntries(REPOSITORY_VARS.map((name) => [name, undefined]))
  return {
    ...(runner.binary === undefined ? {} : { binary: runner.binary }),
    run: (argv, opts) => runner.run(argv, { ...opts, env: { ...unset, ...opts.env } }),
  }
}

/** The owner the `origin` of the checkout `git` is bound to names, or null. */
function originOwner(git: Git, resolveAlias: SshAliasResolver | undefined): string | null {
  const url = git.remoteGetUrl('origin')
  if (url === null) return null
  return readRemote(url, resolveAlias)?.owner ?? null
}

/** The home directory: `home`, else `HOME` (`USERPROFILE` on Windows) in `env`. */
function homeOf(opts: RootsOptions): string {
  return opts.home ?? homeDir(opts.env === undefined ? {} : { env: opts.env })
}

/** Whether `path` is `dir` or inside it. */
function within(path: string, dir: string): boolean {
  const rel = relative(dir, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function realpathOr(path: string): string {
  try {
    // The native call gives the name as stored, the letter case git reports.
    return realpathSync.native(path)
  } catch {
    return resolve(path)
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// stderr directly, as typed-git's checkout walk does: a library's warning must
// not land in a host's structured stdout.
function defaultWarn(message: string): void {
  process.stderr.write(`${message}\n`)
}
