/**
 * Ref names for the git-ref attempt store and the per-branch lease.
 *
 * A branch name may hold characters a ref name cannot (`..`, `~^:?*[\`, a trailing `.lock`, spaces,
 * non-ASCII). So the readable part is the name with every character outside `[A-Za-z0-9_-]`
 * replaced by `_`, cut to 60 characters, and a 10-hex-digit hash of the exact input follows it
 * (`<readable>--<hash>`). The hash keeps two names that sanitize alike apart. The result has no
 * dot, so it can never contain `..`, start with `.` or end in `.lock`.
 */

import { createHash } from 'node:crypto'

/** The default prefix under which everything this package writes to a remote lives. */
export const DEFAULT_REF_PREFIX = 'refs/pr-update/'

/** Compare-and-swap tries before a write or lease gives up. */
export const MAX_CAS_ATTEMPTS = 5

function encode(readable: string, hashed: string): string {
  const safe = readable.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)
  const hash = createHash('sha256').update(hashed).digest('hex').slice(0, 10)
  return `${safe}--${hash}`
}

/** A prefix ending in exactly one `/`. */
export function normalizePrefix(prefix: string): string {
  return `${prefix.replace(/\/+$/, '')}/`
}

/** The namespace of attempt records under `refPrefix`. */
export function attemptsPrefix(refPrefix: string): string {
  return `${normalizePrefix(refPrefix)}attempts/`
}

/** The ref holding the failed-attempt record of one PR target, under an attempts prefix. */
export function attemptRef(prefix: string, repo: string, head: string, base: string): string {
  return `${normalizePrefix(prefix)}${encode(`${repo}__${head}`, `${repo}\0${head}\0${base}`)}`
}

/** The ref holding the update lease of one head branch. */
export function lockRef(refPrefix: string, head: string): string {
  return `${normalizePrefix(refPrefix)}lock/${encode(head, head)}`
}
