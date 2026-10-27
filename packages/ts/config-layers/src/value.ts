/**
 * Read a setting from a parsed config by dotted key, and decide whether the
 * value counts as set.
 */

/** A plain mapping: an object, not null and not an array. Internal, not in the package index. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read a dotted path out of a plain value: each segment is an own key of a
 * plain mapping. A list is not walked into and an inherited name
 * (`constructor`) is not a key, as in the Rust crate's `value_at`. The one
 * dotted walk over a value; {@link valueAt} is built on it.
 *
 * @experimental
 */
export function getIn(value: unknown, path: readonly string[]): { found: boolean; value: unknown } {
  let cur: unknown = value
  for (const seg of path) {
    if (!isPlainObject(cur) || !Object.hasOwn(cur, seg)) return { found: false, value: undefined }
    cur = cur[seg]
  }
  return { found: true, value: cur }
}

/**
 * The value at `key` (`upload.endpoint`, `paths.dev`) in `obj`, or undefined.
 * Walks as {@link getIn} does.
 *
 * @experimental
 */
export function valueAt(obj: unknown, key: string): unknown {
  return getIn(obj, key.split('.')).value
}

/**
 * Whether a value counts as set: not undefined, null, an empty string, an
 * empty list or an empty map. A schema default that is empty (`repos: []`,
 * `paths: {}`) is therefore "unset", which is what a need means by it.
 * @experimental
 */
export function valueIsSet(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return true
}
