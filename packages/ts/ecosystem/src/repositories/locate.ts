/**
 * Finding a person's checkouts of a repository: scan the roots, read each
 * checkout's `origin`, and match it.
 *
 * typed-git does the git work: `scanForCheckouts` walks a root,
 * `Git#mainCheckout` finds a worktree's main checkout, and `readRemote` and
 * `sameRepo` read and match a remote. This module is the osdlc policy over
 * them: which roots, and one row per repository.
 */

import { realpathSync } from 'node:fs'
import { dirname } from 'node:path'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import {
  Git,
  readRemote,
  sameRepo,
  scanForCheckouts,
  type RemoteRepo,
  type RepoCoordinate,
} from '@osdlc/typed-git'

import { resolveRoots, type ResolvedRoots, type RootsOptions, type RootsSource } from './roots.ts'

/** A checkout of a repository, found under a root. */
export interface LocatedCheckout {
  /** The main checkout, absolute. A linked worktree under a root counts as its main checkout. */
  path: string
  /** What its `origin` names, with an SSH config alias resolved. */
  origin: RemoteRepo
}

/** Options for {@link CheckoutLocator} and {@link locateCheckout}. */
export interface LocateOptions extends RootsOptions {
  /** Levels below each root to look. Defaults to typed-git's `DEFAULT_MAX_DEPTH`. */
  maxDepth?: number | undefined
}

/**
 * Finds checkouts by their `origin`, scanning the roots once.
 *
 * The roots are resolved when the locator is made, so {@link roots} and
 * {@link file} are there for a caller's messages before any scan. The scan
 * runs on the first {@link locate} and builds one index, which every later
 * call reads: a run with many targets makes one locator and scans once.
 */
export class CheckoutLocator {
  private readonly opts: LocateOptions
  private readonly resolved: ResolvedRoots
  private index: LocatedCheckout[] | undefined
  private limited = 0

  /** Resolves the roots. Throws when `OSDLC_REPOSITORIES` is relative. */
  constructor(opts: LocateOptions = {}) {
    this.opts = opts
    this.resolved = resolveRoots(opts)
  }

  /** The directories searched: existing, absolute, each once. */
  get roots(): readonly string[] {
    return this.resolved.roots
  }

  /** Whether the roots came from `repositories.yaml` or are the defaults. */
  get source(): RootsSource {
    return this.resolved.source
  }

  /** The path of `repositories.yaml`, which may not exist. */
  get file(): string {
    return this.resolved.file
  }

  /**
   * Directories the walk left unopened because `maxDepth` stopped it there,
   * summed over the roots. Scans the roots if no {@link locate} has yet. A
   * count above zero is a reason to tell the person a checkout may sit
   * deeper, and to raise `maxDepth`.
   */
  get depthLimited(): number {
    this.checkouts()
    return this.limited
  }

  /**
   * Every checkout whose `origin` names `target`: owner and name in any
   * letter case, and the host when both name one. Each repository's main
   * checkout appears once, sorted by path. `[]` when none matches.
   *
   * `target` is a {@link RepoCoordinate} or a string `owner/name` or
   * `host/owner/name` (see {@link parseRepoTarget}).
   */
  locate(target: string | RepoCoordinate): LocatedCheckout[] {
    const want = typeof target === 'string' ? parseRepoTarget(target) : target
    return this.checkouts().filter((c) => sameRepo(c.origin, want))
  }

  /** Every checkout under the roots that has a readable `origin`, one per main checkout. */
  checkouts(): readonly LocatedCheckout[] {
    this.index ??= this.scan()
    return this.index
  }

  private scan(): LocatedCheckout[] {
    const { maxDepth, onWarn, resolveAlias } = this.opts
    const runner = withoutRepositoryVars(
      this.opts.runner ?? spawnRunner('git', { absolutePathOnly: true }),
    )
    const index: LocatedCheckout[] = []
    const seen = new Set<string>()
    let depthLimited = 0
    for (const root of this.resolved.roots) {
      const scan = scanForCheckouts(root, {
        ...(maxDepth === undefined ? {} : { maxDepth }),
        ...(onWarn === undefined ? {} : { onWarn }),
      })
      depthLimited += scan.depthLimited
      for (const found of scan.checkouts) {
        // The walk follows symlinks, so work on what the entry points to.
        const dir = realpathOr(found)
        const git = gitAt(dir, runner)
        // Only a directory that is itself the top of a working tree counts.
        // When git cannot use its `.git` (an empty or half-made folder), it
        // searches upward and answers with a repository around the root, such
        // as a dotfiles repository at the home directory. The ceiling stops
        // that search, but git splits it on the path delimiter with no
        // escaping, so a parent named `a:b` defeats it. Asking git whether
        // `dir` is a work tree's top holds either way, and compares no paths,
        // which differ in letter case on a case-insensitive disk.
        if (!isWorkTreeTop(git)) continue
        // A worktree and its main checkout resolve to one row.
        const main = git.try.mainCheckout()
        if (!main.ok || main.value === null) continue
        const path = realpathOr(main.value)
        if (seen.has(path)) continue
        seen.add(path)
        const url = gitAt(path, runner).try.remoteGetUrl('origin')
        if (!url.ok || url.value === null) continue
        const origin = readRemote(url.value, resolveAlias)
        if (origin !== null) index.push({ path, origin })
      }
    }
    this.limited = depthLimited
    return index.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  }
}

/**
 * Whether the directory `git` is bound to is the top of a working tree: git
 * says it is inside one (`--is-inside-work-tree`), and the way up to its top
 * is empty (`--show-cdup`). `--show-cdup` alone is empty in a directory whose
 * `.git` is a bare repository too. revParse trims, so the two lines read as
 * `true` exactly when both hold.
 */
function isWorkTreeTop(git: Git): boolean {
  const out = git.try.revParse('--is-inside-work-tree', '--show-cdup')
  return out.ok && out.value === 'true'
}

/**
 * The variables that tell git which repository to use, whatever the
 * directory. A git hook exports `GIT_DIR`, and with it set every directory
 * the scan finds would answer as the hook's repository. The inherited
 * `GIT_CEILING_DIRECTORIES` goes too; {@link gitAt} sets its own.
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
 * `runner`, with {@link REPOSITORY_VARS} unset in each child: command-seam
 * drops a variable whose value is `undefined`. A value the call sets, such
 * as the ceiling, still wins.
 */
function withoutRepositoryVars(runner: CommandRunner): CommandRunner {
  const unset = Object.fromEntries(REPOSITORY_VARS.map((name) => [name, undefined]))
  return {
    ...(runner.binary === undefined ? {} : { binary: runner.binary }),
    run: (argv, opts) => runner.run(argv, { ...opts, env: { ...unset, ...opts.env } }),
  }
}

/**
 * A client for `dir`, a real path. `GIT_CEILING_DIRECTORIES` is its parent,
 * so git does not search above `dir` for a repository. The scan still checks
 * git's answer, since a parent path holding the path delimiter cannot be
 * written in the variable.
 */
function gitAt(dir: string, runner: CommandRunner): Git {
  return new Git(dir, { env: { GIT_CEILING_DIRECTORIES: dirname(dir) }, runner })
}

/**
 * Every checkout whose `origin` names `target`, scanning the roots once for
 * this call. A caller with more than one target makes one
 * {@link CheckoutLocator} instead.
 */
export function locateCheckout(
  target: string | RepoCoordinate,
  opts: LocateOptions = {},
): LocatedCheckout[] {
  return new CheckoutLocator(opts).locate(target)
}

/**
 * `owner/name` or `host/owner/name` as a {@link RepoCoordinate}. `owner/name`
 * carries no host, so it matches a checkout on any host. Throws on any other
 * shape.
 */
export function parseRepoTarget(text: string): RepoCoordinate {
  const parts = text.trim().split('/')
  if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => p !== '')) {
    const [a, b, c] = parts as [string, string, string | undefined]
    return c === undefined ? { owner: a, repo: b } : { host: a, owner: b, repo: c }
  }
  throw new Error(`'${text}' is not owner/name or host/owner/name`)
}

function realpathOr(path: string): string {
  try {
    // The native call gives the name as stored, the letter case git reports.
    return realpathSync.native(path)
  } catch {
    return path
  }
}
