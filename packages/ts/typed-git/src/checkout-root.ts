/**
 * Locate the git checkout containing a path, and find the checkouts inside a
 * directory, by reading the filesystem only, with no git process. Every other
 * query in this package runs git (see `Git#topLevel()`, `git rev-parse
 * --show-toplevel`). These exist for callers that must not depend on a git
 * binary being present, or that run before it would be safe to spawn one.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** True iff `p` exists and is a directory. Never throws. */
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/**
 * The git checkout containing `path` — the nearest ancestor (`path` itself
 * included) carrying a `.git` entry, or null when none does.
 *
 * `.git` is a directory in a main checkout and a file (`gitdir: <path>`) in a
 * linked worktree. `existsSync` matches either without telling them apart,
 * which is what callers want.
 *
 * `path` may be a file or a directory. A file, or anything that cannot be
 * stat'ed (for example, it does not exist yet), starts the walk from its parent.
 * Returns null on a miss rather than throwing: "no checkout here" is an
 * answer, not a failure, matching this package's query contract.
 */
export function checkoutRoot(path: string): string | null {
  let dir = resolve(path)
  if (!isDir(dir)) dir = dirname(dir)
  for (;;) {
    if (existsSync(resolve(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** How far below the search root {@link discoverCheckouts} looks by default. */
export const DEFAULT_MAX_DEPTH = 3

/** Directories read before the walk warns that the tree is very large. */
export const DEFAULT_WARN_AFTER = 10_000

export interface DiscoverCheckoutsOptions {
  /**
   * Levels below the search root to look. 1 is its direct children.
   * Defaults to {@link DEFAULT_MAX_DEPTH}.
   */
  maxDepth?: number | undefined
  /**
   * Directories read before {@link DiscoverCheckoutsOptions.onWarn} fires,
   * once. Defaults to {@link DEFAULT_WARN_AFTER}; `Infinity` silences it.
   */
  warnAfter?: number | undefined
  /**
   * Called once, during the walk, when the search root turns out to be very
   * large. Defaults to a line on stderr: a slow walk should say why while it
   * is still running, not in a summary afterwards. A host with its own output
   * passes its own function. `() => {}` silences it.
   */
  onWarn?: ((message: string) => void) | undefined
}

export interface CheckoutScan {
  /** The checkouts found, sorted, as absolute paths. */
  checkouts: string[]
  /** Directories read, the search root included. */
  directoriesScanned: number
  /**
   * Directories left unopened because `maxDepth` stopped the walk there. A
   * non-zero count is the reason to suspect a missing repository.
   */
  depthLimited: number
}

/**
 * The checkouts under `dir`, with counts of what the walk read.
 *
 * The walk descends through directories that are not checkouts and stops at
 * the ones that are, because people group repositories: `~/Developer` holds
 * an owner directory per GitHub org, or a folder per client, and the
 * checkouts sit a level or two inside. Stopping at a checkout keeps this
 * fast: a repository's own `node_modules`, `vendor` and nested worktrees are
 * below it, so they are never entered.
 *
 * Two limits keep a bad search root from turning into a walk of the whole
 * disk: children whose names start with a dot are skipped, and nothing
 * deeper than `maxDepth` is entered. The depth limit matters most, since a
 * directory of ordinary files, such as a documents folder or a media
 * library, has no checkout to stop the walk. `warnAfter` is a third check,
 * and the only one a person sees: past that many directories the walk warns
 * and keeps going, because the usual cause is a search root pointed at the
 * wrong place.
 *
 * Like {@link checkoutRoot}, it reads the filesystem only. No git process
 * runs, so the cost is a `readdir` per directory entered and a `stat` per
 * child. A linked worktree answers as a checkout here, since both carry a
 * `.git` entry. A caller that wants one row per repository resolves each
 * result through `Git#mainCheckout()` and de-duplicates.
 *
 * An unreadable directory contributes nothing rather than throwing, matching
 * this module's contract that absence is an answer.
 */
export function scanForCheckouts(dir: string, opts: DiscoverCheckoutsOptions = {}): CheckoutScan {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const warnAfter = opts.warnAfter ?? DEFAULT_WARN_AFTER
  // stderr directly rather than `console`: a library's diagnostic must not
  // land in a host's structured stdout, and must survive a host that has
  // replaced `console`.
  const onWarn = opts.onWarn ?? ((message: string) => void process.stderr.write(`${message}\n`))
  const root = resolve(dir)

  const checkouts: string[] = []
  let directoriesScanned = 0
  let depthLimited = 0
  let warned = false

  const visit = (at: string, depth: number): void => {
    if (depth > maxDepth) {
      depthLimited += 1
      return
    }
    let entries: string[]
    try {
      entries = readdirSync(at)
    } catch {
      return
    }
    directoriesScanned += 1
    if (!warned && directoriesScanned > warnAfter) {
      warned = true
      onWarn(
        `scanning a very large tree under ${root} — ${directoriesScanned} directories so far, and still going`,
      )
    }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const candidate = resolve(at, entry)
      if (!isDir(candidate)) continue
      if (existsSync(resolve(candidate, '.git'))) {
        checkouts.push(candidate)
        continue
      }
      visit(candidate, depth + 1)
    }
  }

  visit(root, 1)
  return { checkouts: checkouts.sort(), directoriesScanned, depthLimited }
}

/**
 * The checkouts under `dir`, sorted, as absolute paths. {@link
 * scanForCheckouts} without the counts.
 */
export function discoverCheckouts(dir: string, opts: DiscoverCheckoutsOptions = {}): string[] {
  return scanForCheckouts(dir, opts).checkouts
}
