/**
 * Machine-scope containment. A plugin that cleans outside any checkout
 * declares `roots`; every candidate it owns must sit strictly below one of
 * them, proven by `@osdlc/path-guard` on real paths, so a `..` or a symlink
 * that leads out is not inside.
 */

import { realpathSync } from 'node:fs'
import { isAbsolute, relative } from 'node:path'

import { nodeGuard } from '@osdlc/path-guard/node'

const real = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** The root of `roots` that `path` is strictly inside by its real path, or null. A root that cannot be resolved holds nothing; a root itself is not inside. */
export function containedIn(roots: readonly string[], path: string): string | null {
  const target = real(path)
  for (const root of roots) {
    let base: string
    try {
      base = realpathSync(root)
    } catch {
      continue
    }
    const rel = relative(base, target)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue
    if (nodeGuard.tryResolve(base, rel) !== null) return root
  }
  return null
}
