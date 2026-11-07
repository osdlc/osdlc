/**
 * The JSONL writer with the redactor in front of it: what a writer of free
 * text (a prompt, a tool's output, an error message) calls in place of
 * `appendJsonl`.
 */

import { LogEnvelopeSchema } from './envelope.ts'
import type { Redactions, Redactor } from './redactor.ts'
import { appendJsonl, type AppendOptions } from './writer.ts'

/**
 * The top-level keys of the log envelope (`v`, `ts`, `kind`, `writer`,
 * `source`, `session`, `run`, `subject`). They hold ids and structure, which
 * {@link appendRedactedJsonl} writes as they are.
 */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set(Object.keys(LogEnvelopeSchema.shape))

/** An object literal or `Object.create(null)`: not an array, `Map`, `Error`, `Date` or class instance. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto: unknown = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * Redact `line` with `redactor`, then append it to `path` as one JSON line,
 * as `appendJsonl` does. The envelope's own top-level keys are written as
 * they are when they hold a string, number, boolean or null, since they are
 * ids and structure; every other key and its value pass
 * {@link Redactor.redactJson}. If that pass fails, the line keeps the
 * envelope keys alone and the result counts `redactor-error`. A `line` that is
 * not a plain object (an array, a `Map`, an `Error`, a class instance) is
 * redacted whole, as {@link Redactor.redactJson} converts it. Returns what was replaced, by rule, so the caller can count
 * or report it; the matched text is never returned.
 *
 * @throws The file system's error when the directory or file cannot be created
 * or written. The redactor itself never throws.
 */
export async function appendRedactedJsonl(
  path: string,
  line: unknown,
  redactor: Redactor,
  options: AppendOptions = {},
): Promise<Redactions> {
  if (!isPlainObject(line)) {
    const { value, redactions } = await redactor.redactJson(line)
    appendJsonl(path, value, options)
    return redactions
  }
  // The envelope's keys first, then the redacted rest, in the line's own order within each.
  const envelope: [string, unknown][] = []
  const rest: [string, unknown][] = []
  for (const entry of Object.entries(line)) {
    const [key, value] = entry
    const kept =
      ENVELOPE_KEYS.has(key) &&
      (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    ;(kept ? envelope : rest).push(entry)
  }
  const { value, redactions } = await redactor.redactJson(Object.fromEntries(rest))
  // A failed pass returns the fail-closed string, not an object: the line then keeps the envelope alone.
  const fields = value !== null && typeof value === 'object' ? value : {}
  appendJsonl(path, { ...Object.fromEntries(envelope), ...fields }, options)
  return redactions
}
