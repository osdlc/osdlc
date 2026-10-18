import { TieredDirsError } from './errors.ts'

/** A path segment: a letter/digit, then letters/digits and `._-`. */
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i

/**
 * Folders this package puts directly under another home's base on some OS:
 * state under cache and logs under durable on Windows, and runtime (`run`)
 * under durable wherever the platform has none. A tier named after one would
 * land on that home's root, so they are refused, ignoring case.
 */
const RESERVED = new Set(['state', 'logs', 'run'])

/**
 * Whether `key` is a safe single path segment.
 *
 * The regex alone still admits `a..b`, so the separator and `..` rejections
 * stay explicit. `state`, `logs` and `run` are refused in any case: Windows
 * and macOS paths ignore case. The Rust twin's `is_valid_segment` is the same
 * predicate.
 *
 * Stable in 0.x.
 */
export function isValidSegment(key: string): boolean {
  if (key === '') return false
  if (key.includes('/') || key.includes('\\') || key.includes('..')) return false
  if (RESERVED.has(key.toLowerCase())) return false
  return SEGMENT.test(key)
}

/**
 * Throw unless `key` is a safe single path segment. `kind` names the argument
 * in the message (`vendor`, `suite`, `standalone`, `scope kind`, `scope`,
 * `app`), matching the Rust twin's `check_key`.
 */
export function assertSegment(kind: string, key: string): void {
  if (!isValidSegment(key)) {
    throw new TieredDirsError(
      'INVALID_KEY',
      `invalid ${kind} key ${JSON.stringify(key)}: want a leading letter/digit ` +
        'then ._-, no path separator or "..", and not state, logs or run',
    )
  }
}
