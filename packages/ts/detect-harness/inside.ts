/**
 * Text containment with this platform's path rules.
 *
 * Runtime-agnostic: `node:path` only.
 */

import { isAbsolute, relative, sep } from 'node:path'

/**
 * `path` is `root` or lies under it once both are normalized by `node:path`.
 * Text only: touches no filesystem and follows no symlink, so a caller that
 * must not follow a link out of `root` compares real paths too. A relative
 * input is resolved against the working directory.
 */
export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}
