/**
 * Machine-scope containment. A plugin that cleans outside any checkout
 * declares `roots`; every candidate it owns must sit strictly below one of
 * them, proven by `@osdlc/path-guard` on real paths, so a `..` or a symlink
 * that leads out is not inside. A candidate that is itself a link is judged by
 * its target: a link inside a root that points out of it is not inside.
 */

import { realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import { nodeGuard } from '@osdlc/path-guard/node'

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
