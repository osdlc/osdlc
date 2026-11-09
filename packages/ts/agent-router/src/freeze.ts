/**
 * Freeze `value` and every object and array it holds, and return it. The
 * shared built-ins (the snapshot, the built-in profiles and rules, the code
 * lists) go through it, so no caller can change them for every other caller.
 * An object frozen already is still walked: its contents may not be.
 */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value
  seen.add(value)
  Object.freeze(value)
  for (const inner of Object.values(value)) deepFreeze(inner, seen)
  return value
}
