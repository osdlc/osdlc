/**
 * Durations and ages a person reads, not numbers of milliseconds.
 *
 * These format the two numbers `cache.ts` measures — how long a probe takes
 * ({@link humanMs}) and how old a stored answer is ({@link humanAge}) — and
 * every surface that reports on the cache (both CLIs, the TUI, the web view)
 * prints one or both of them.
 *
 * They are NOT in `cache.ts`, for the same reason `match.ts` is not: the web
 * view is bundled for the browser, and `cache.ts` reaches for `node:fs`,
 * `node:crypto` and `node:os`. This module has its own `./duration` export
 * subpath and must stay free of DOM and of node builtins.
 *
 * What a surface does NOT get from here is the sentence around the number. The
 * CLIs say "35s old, refresh usually about 149ms", the TUI says "~149ms", the
 * page says "never timed here" — four voices, deliberately, each written for
 * where it is read. Only the number's spelling is shared.
 */

/**
 * A duration, at a precision that suits its size: milliseconds under a second,
 * one decimal of a second under ten, then whole seconds and whole minutes. A
 * probe cost is a rough expectation, and `1.4s` reads where `1423ms` does not.
 */
export function humanMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

/**
 * How old a cached answer is. `undefined` is a miss, which has no age at all —
 * and says so rather than reading as "0s old", which would claim a freshness
 * nothing measured.
 *
 * The floor of one second is deliberate: an answer read out of the store
 * moments after it was written is still an answer from the store, and "0s old"
 * invites the reader to think it is live.
 */
export function humanAge(ms: number | undefined): string {
  if (ms === undefined) return 'of unknown age'
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s old`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m old`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h old`
  return `${Math.round(ms / 86_400_000)}d old`
}
