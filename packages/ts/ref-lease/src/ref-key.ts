/**
 * `refKey`: a safe, readable ref name for any string key.
 */

import { createHash } from 'node:crypto'

import { checkLeaseRef } from './refs.ts'

const MAX_READABLE = 60
const HASH_LENGTH = 10

/** A prefix ending in exactly one `/`. */
function withSlash(prefix: string): string {
  return `${prefix.replace(/\/+$/, '')}/`
}

/**
 * The ref `<prefix><readable>--<hash>` for `key`.
 *
 * Git refuses some names (`..`, `~^:?*[\`, a trailing `.lock`, a leading `.`, control
 * characters), so `readable` is `label` (default `key`) with every character outside
 * `[A-Za-z0-9_-]` replaced by `_`, cut to 60 characters. It has no dot, so none of those cases can
 * arise. `hash` is the first 10 hex digits of a sha256 over the whole `key`, so two keys never
 * share a ref even when their readable parts match or were cut. A `label` only changes the
 * readable part, never the hash.
 *
 * @param prefix A ref path under `refs/`, outside `refs/heads`, `refs/tags` and `refs/remotes`.
 * @throws TypeError for any other prefix, or an empty key.
 */
export function refKey(prefix: string, key: string, label: string = key): string {
  const base = withSlash(prefix)
  checkLeaseRef(base.slice(0, -1), 'refKey: prefix')
  if (key === '') throw new TypeError('refKey: key must not be empty')
  const readable = label.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_READABLE)
  const hash = createHash('sha256').update(key).digest('hex').slice(0, HASH_LENGTH)
  return `${base}${readable}--${hash}`
}
