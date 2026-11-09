import { loadKnowledge } from './data.js'
import { lookup, type LookupQuery } from './lookup.js'

/**
 * The value of `subject` for `harness` when the file states it with at least
 * moderate strength and the statement is not disputed, else undefined. This is
 * the question a consumer asks before replacing a hard-coded fact with the
 * file's. Weak and disputed values are never returned.
 */
export function fact(
  harness: string,
  subject: string,
  query: Omit<LookupQuery, 'accept'> = {},
): Record<string, unknown> | undefined {
  const found = lookup(loadKnowledge(), harness, subject, {
    ...query,
    accept: { weak: false, disputed: false },
  })
  if (found === undefined || found.disputed) return undefined
  const value = found.value
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
