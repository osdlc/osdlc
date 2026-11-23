/**
 * Containment of path candidates. Every one must sit strictly below one of
 * its owner's `roots` or a target, proven by `@osdlc/path-guard` on real
 * paths, so a `..` or a symlink that leads out is not inside. A candidate that
 * is itself a link is judged by its target: a link inside a root that points
 * out of it is not inside. The linked worktrees of the repositories among
 * the targets count as targets too, and one may itself be a candidate.
 */

import { realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import { nodeGuard } from '@osdlc/path-guard/node'
import { Git } from '@osdlc/typed-git'

/** `path` with only its parent resolved, so a leaf that does not exist yet still compares against a real root; `path` as given when the parent does not resolve. The guard then follows a leaf that is a link. */
const realLeaf = (path: string): string => {
  const dir = dirname(path)
  try {
    return join(realpathSync(dir), basename(path))
  } catch {
    return path
  }
}

const hasDotDot = (path: string): boolean => path.split(/[\\/]/).includes('..')

/** The root of `roots` that `path` is strictly inside by its real path, or null. A root that cannot be resolved holds nothing; a root itself is not inside; a relative path or one with a `..` segment is never inside. */
export function containedIn(roots: readonly string[], path: string): string | null {
  if (!isAbsolute(path) || hasDotDot(path)) return null
  const target = realLeaf(path)
  for (const root of roots) {
    let base: string
    try {
      base = realpathSync(root)
    } catch {
      continue
    }
    const rel = relative(base, target)
    if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) continue
    if (nodeGuard.tryResolve(base, rel) !== null) return root
  }
  return null
}

/**
 * The linked worktrees of each repository that a target is in, as `git
 * worktree list` gives them, a gone one included. A target that is not in a
 * repository adds none. The primary checkout is left out: a target inside a
 * repository holds only what is inside the target.
 */
export function linkedCheckouts(targets: readonly string[]): string[] {
  const linked = new Set<string>()
  for (const target of targets) {
    let trees
    try {
      trees = new Git(target).worktrees()
    } catch {
      continue
    }
    for (const [i, tree] of trees.entries()) if (i > 0 && !tree.bare) linked.add(tree.path)
  }
  return [...linked]
}

/** Where a plugin's path candidates may sit. */
export interface Bounds {
  /** The plugin's own `roots`; none when it declares none. */
  roots: readonly string[]
  targets: readonly string[]
  /** The linked worktrees of the repositories among the targets. */
  linked: readonly string[]
}

const realOr = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * What in `bounds` holds `path`, or null: a root, a target or a linked
 * worktree it is strictly inside, or the linked worktree it is, unless that
 * is a target. Judged on real paths, as {@link containedIn} does.
 */
export function boundBy(bounds: Bounds, path: string): string | null {
  const inside = containedIn([...bounds.roots, ...bounds.targets, ...bounds.linked], path)
  if (inside !== null || !isAbsolute(path) || hasDotDot(path)) return inside
  const leaf = realLeaf(path)
  if (bounds.targets.some((t) => t === path || realOr(t) === leaf)) return null
  return bounds.linked.find((c) => c === path || realOr(c) === leaf) ?? null
}
