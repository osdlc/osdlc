/**
 * The JSONL writer with the redactor in front of it: what a writer of free
 * text (a prompt, a tool's output, an error message) calls in place of
 * `appendJsonl`.
 */

import { LogEnvelopeSchema } from './envelope.ts'
import { mergeRedactions, type Redactions, type Redactor } from './redactor.ts'
import { appendJsonl, type AppendOptions } from './writer.ts'

/**
 * The top-level keys of the log envelope (`v`, `ts`, `kind`, `writer`,
 * `source`, `session`, `run`, `subject`). They hold ids and structure, which
 * {@link appendRedactedJsonl} writes as they are.
 */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set(Object.keys(LogEnvelopeSchema.shape))

/** The value types an envelope key keeps its key for; anything else goes through `redactJson`. */
const KEPT_TYPES: ReadonlySet<string> = new Set(['string', 'number', 'boolean'])

/** An object literal or `Object.create(null)`: not an array, `Map`, `Error`, `Date` or class instance. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto: unknown = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * Redact `line` with `redactor`, then append it to `path` as one JSON line,
 * as `appendJsonl` does. The envelope's own top-level keys (ids and
 * structure) keep their place when they hold a string, number, boolean or
 * null: a string passes {@link Redactor.redact}, which leaves an id as it is,
 * so the `session` id is not blanked as a secret-named key would be. Every
 * other key and its value pass {@link Redactor.redactJson}. If that pass fails, the line keeps the
 * envelope keys alone and the result counts `redactor-error`. A `line` that is
 * not a plain object (an array, a `Map`, an `Error`, a class instance) is
 * redacted whole, as {@link Redactor.redactJson} converts it. Returns what
 * was replaced, by rule, so the caller can count or report it; the matched
 * text is never returned.
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
    const kept = ENVELOPE_KEYS.has(key) && (value === null || KEPT_TYPES.has(typeof value))
    ;(kept ? envelope : rest).push(entry)
  }
  const redactions: Redactions = {}
  // Free text put in an envelope field (`subject`, `kind`) still passes the text filter.
  for (const entry of envelope) {
    if (typeof entry[1] !== 'string') continue
    const r = await redactor.redact(entry[1])
    mergeRedactions(redactions, r.redactions)
    entry[1] = r.text
  }
  const { value, redactions: restRedactions } = await redactor.redactJson(Object.fromEntries(rest))
  mergeRedactions(redactions, restRedactions)
  // A failed pass returns the fail-closed string, not an object: the line then keeps the envelope alone.
  const fields = value !== null && typeof value === 'object' ? value : {}
  appendJsonl(path, { ...Object.fromEntries(envelope), ...fields }, options)
  return redactions
}
