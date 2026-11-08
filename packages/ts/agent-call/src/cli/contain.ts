import { isAbsolute, relative, resolve, sep } from 'node:path'

import { UsageError } from './errors.js'

/**
 * Resolve a spec-relative path against `root` and refuse anything outside it:
 * absolute paths and `..` escapes. Lexical only; symlinks are not followed.
 */
export function containedPath(root: string, path: string): string {
  if (path === '') throw new UsageError('empty path in spec')
  if (isAbsolute(path)) {
    throw new UsageError(`path "${path}" is absolute; spec paths must be relative to --root`)
  }
  const absolute = resolve(root, path)
  const rel = relative(root, absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new UsageError(`path "${path}" escapes --root`)
  }
  return absolute
}
