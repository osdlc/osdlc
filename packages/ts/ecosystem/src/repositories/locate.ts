/**
 * Finding a person's checkouts of a repository: scan the roots, read each
 * checkout's `origin`, and match it.
 *
 * typed-git does the git work: `discoverCheckouts` walks a root,
 * `Git#mainCheckout` finds a worktree's main checkout, and `readRemote` and
 * `sameRepo` read and match a remote. This module is the osdlc policy over
 * them: which roots, and one row per repository.
 */

import { realpathSync } from 'node:fs'

import {
  discoverCheckouts,
  Git,
  readRemote,
  sameRepo,
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
    const { maxDepth, onWarn, runner, resolveAlias } = this.opts
    const gitOpts = runner === undefined ? {} : { runner }
    const index: LocatedCheckout[] = []
    const seen = new Set<string>()
    for (const root of this.resolved.roots) {
      const found = discoverCheckouts(root, {
        ...(maxDepth === undefined ? {} : { maxDepth }),
        ...(onWarn === undefined ? {} : { onWarn }),
      })
      for (const checkout of found) {
        // A worktree and its main checkout resolve to one row. Something that
        // looks like a checkout but that git cannot read is not one.
        const main = new Git(checkout, gitOpts).try.mainCheckout()
        if (!main.ok || main.value === null) continue
        const path = realpathOr(main.value)
        if (seen.has(path)) continue
        seen.add(path)
        const url = new Git(path, gitOpts).try.remoteGetUrl('origin')
        if (!url.ok || url.value === null) continue
        const origin = readRemote(url.value, resolveAlias)
        if (origin !== null) index.push({ path, origin })
      }
    }
    return index.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  }
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
    return realpathSync(path)
  } catch {
    return path
  }
}
