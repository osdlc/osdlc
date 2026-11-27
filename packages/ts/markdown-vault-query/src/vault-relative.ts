import { isAbsolute, relative, resolve, sep } from 'node:path'

import { nodeGuard } from '@osdlc/path-guard/node'

/**
 * `file` as a `/`-separated path relative to `vault`, or `undefined` when it
 * lies outside: under the vault both as written and once symlinks are
 * resolved, so the answer never starts with `..`.
 */
export function vaultRelativePath(vault: string, file: string): string | undefined {
  const root = resolve(vault)
  const abs = resolve(file)
  const rel = relative(root, abs)
  if (leaves(rel) || leaves(relative(nodeGuard.realPath(root), nodeGuard.realPath(abs)))) {
    return undefined
  }
  return rel.split(sep).join('/')
}

function leaves(rel: string): boolean {
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}
