/**
 * Durations and ages formatted for people, not raw milliseconds.
 *
 * These format the two numbers `cache.ts` measures: how long a probe takes
 * ({@link humanMs}) and how old a stored answer is ({@link humanAge}). Every
 * caller that reports on the cache (both CLIs, the TUI, the web view) prints
 * one or both.
 *
 * They are not in `cache.ts`, for the same reason `match.ts` is not. The web
 * view is bundled for the browser, and `cache.ts` imports `node:fs`,
 * `node:path` and `node:crypto`. This module has its own `./duration` export
 * subpath and must not use the DOM or Node built-ins.
 *
 * Callers do not get the sentence around the number from here. The CLIs say
 * "35s old, refresh usually about 149ms", the TUI says "~149ms", and the page
 * says "never timed here". Each caller words it for where it is read, on
 * purpose. Only the number's format is shared.
 */

/**
 * A duration, at a precision that suits its size: milliseconds under a second,
 * one decimal of a second under ten, then whole seconds and whole minutes. A
 * probe cost is a rough estimate, and `1.4s` is easier to read than `1423ms`.
 */
export function humanMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

/**
 * How old a cached answer is. `undefined` is a miss, which has no age. It
 * returns "of unknown age" rather than "0s old", which would claim a freshness
 * nothing measured.
 *
 * The minimum of one second is deliberate. An answer read from the store
 * moments after it was written is still a stored answer, and "0s old" would
 * suggest it is live.
 */
export function humanAge(ms: number | undefined): string {
  if (ms === undefined) return 'of unknown age'
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s old`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m old`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h old`
  return `${Math.round(ms / 86_400_000)}d old`
}
