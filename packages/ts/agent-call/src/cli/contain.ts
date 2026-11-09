import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { UsageError } from './errors.js'

/**
 * Resolve a spec-relative path against `root` and refuse anything outside it:
 * absolute paths, `..` escapes and symlinks that resolve outside it.
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
  let real: string
  let realRoot: string
  try {
    real = realpathSync(absolute)
    realRoot = realpathSync(root)
  } catch {
    return absolute
  }
  const realRel = relative(realRoot, real)
  if (realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) {
    throw new UsageError(`path "${path}" escapes --root`)
  }
  return absolute
}
