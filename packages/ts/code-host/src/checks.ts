/**
 * The check rollup both adapters share. Each adapter maps its own raw check
 * state to a verdict; the order (any failure wins, then any pending, else
 * success, or none when there are no checks) and the failing lists live here.
 */

import type { CheckSummary } from './types.ts'

/**
 * One check, already mapped from the code host's raw state. Anything but
 * `failure` or `pending` (`neutral` included) counts as a pass. `url` is null
 * when the check has none.
 */
export interface CheckEntry {
  name: string
  verdict: 'failure' | 'pending' | 'success' | 'neutral'
  url: string | null
}

/** The rollup, with `blocked` left empty for the adapter to fill in. */
export function rollupChecks(entries: readonly CheckEntry[]): CheckSummary {
  const rollup: CheckSummary['rollup'] = entries.some((c) => c.verdict === 'failure')
    ? 'failure'
    : entries.some((c) => c.verdict === 'pending')
      ? 'pending'
      : entries.length === 0
        ? 'none'
        : 'success'
  const failed = entries.filter((c) => c.verdict === 'failure')
  const failing = failed.map((c) => c.name)
  const failingUrls = failed
    .filter((c): c is CheckEntry & { url: string } => c.url !== null)
    .map((c) => ({ name: c.name, url: c.url }))
  return { rollup, failing, failingUrls, blocked: [] }
}
