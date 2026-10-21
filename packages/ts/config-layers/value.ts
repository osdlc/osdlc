/**
 * Read a setting out of a hydrated config by dotted key, and decide whether
 * what is there counts as set.
 */

/**
 * The value at `key` (`upload.endpoint`, `paths.dev`) in `obj`, or undefined.
 *
 * @experimental
 */
export function valueAt(obj: unknown, key: string): unknown {
  let cur: unknown = obj
  for (const seg of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
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
