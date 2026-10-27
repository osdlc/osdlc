/**
 * Turning what a person wrote down into a list of repositories to sweep.
 *
 * An entry is a path, and what it names is decided by looking at the disk
 * rather than by syntax. A path that is itself a checkout names one
 * repository. A path that is not is searched for the checkouts under it,
 * descending through directories that are not checkouts, so `~/Developer`
 * covers everything under it — including a per-owner or per-client
 * directory — without listing any of them.
 *
 * Nothing here fans out on its own. A caller that passes no entries gets no
 * repositories, and the CLI's bare invocation sweeps the checkout it is
 * standing in.
 */

import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'

import { checkoutRoot, scanForCheckouts, type Git } from '@osdlc/typed-git'

import { emptyScan, type ScanStats, type UnresolvedEntry } from './types.ts'

export interface ResolveOptions {
  /** Base for a relative entry. Defaults to the process's cwd. */
  baseDir?: string
  git: Git
  /**
   * Told, mid-walk, that a container is enormous — usually an entry pointing
   * somewhere it should not. Defaults to typed-git's line on stderr.
   */
  onWarn?: ((message: string) => void) | undefined
}

export interface Resolution {
  /** Main-checkout roots, de-duplicated and sorted. */
  repos: string[]
  /** Entries that named no repository, in the order they were given. */
  unresolved: UnresolvedEntry[]
  /** What searching the container entries cost. */
  scan: ScanStats
}

/** `~` and `~/x` against this user's home. Any other path is returned as-is. */
export function expandTilde(path: string, home: string = homedir()): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return join(home, path.slice(2))
  return path
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** True iff `dir` is itself the root of a checkout — main or linked worktree. */
export function isCheckoutRoot(dir: string): boolean {
  return checkoutRoot(dir) === resolvePath(dir)
}

/**
 * Resolve `entries` to the repositories they name.
 *
 * An entry that resolves to nothing is reported rather than dropped. A
 * worklist that silently sweeps four of the five repositories it was given is
 * worse than one that says which it could not find.
 */
export function resolveEntries(entries: readonly string[], opts: ResolveOptions): Resolution {
  const base = opts.baseDir ?? process.cwd()
  const unresolved: UnresolvedEntry[] = []
  const byMainCheckout = new Set<string>()
  const scan = emptyScan()

  // Every candidate is resolved to the repository it belongs to, so a
  // container holding a checkout and its worktrees yields one row, not four.
  const record = (candidate: string): boolean => {
    const main = opts.git.at(candidate).mainCheckout()
    if (main === null) return false
    byMainCheckout.add(main)
    return true
  }

  for (const raw of entries) {
    const entry = raw.trim()
    if (entry === '') continue
    const expanded = expandTilde(entry)
    const path = isAbsolute(expanded) ? expanded : resolvePath(base, expanded)

    if (!isDir(path)) {
      unresolved.push({ entry, reason: 'not a directory' })
      continue
    }

    if (isCheckoutRoot(path)) {
      if (!record(path)) unresolved.push({ entry, reason: 'not a readable git checkout' })
      continue
    }

    const search = scanForCheckouts(path, opts.onWarn === undefined ? {} : { onWarn: opts.onWarn })
    scan.containers += 1
    scan.directoriesScanned += search.directoriesScanned
    scan.depthLimited += search.depthLimited
    scan.checkoutsFound += search.checkouts.length

    let found = 0
    for (const candidate of search.checkouts) {
      if (record(candidate)) found += 1
    }
    if (found === 0) unresolved.push({ entry, reason: 'no git checkouts under it' })
  }

  return { repos: [...byMainCheckout].sort(), unresolved, scan }
}
