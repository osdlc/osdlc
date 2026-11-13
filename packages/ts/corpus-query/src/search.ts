/**
 * Full-text search: each record's title, string fields and body, lowercased the first time a
 * search reads the record. A record matches when it holds every term. There is no index beyond
 * that text: a scan of a few megabytes takes a few milliseconds.
 */
import type { CorpusRecord } from '@osdlc/corpus-schema'

interface Text {
  /** The title and the id. */
  title: string
  /** Every string in the record's data, one per line. */
  fields: string
  body: string
}

const TEXTS = new WeakMap<CorpusRecord, Text>()

function strings(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) strings(v, out)
  else if (typeof value === 'object' && value !== null)
    for (const v of Object.values(value)) strings(v, out)
}

function textOf(record: CorpusRecord): Text {
  let text = TEXTS.get(record)
  if (text === undefined) {
    const fields: string[] = []
    strings(record.data, fields)
    text = {
      title: `${record.title}\n${record.id}`.toLowerCase(),
      fields: fields.join('\n').toLowerCase(),
      body: (record.body ?? '').toLowerCase(),
    }
    TEXTS.set(record, text)
  }
  return text
}

/** The terms of a search: words, and phrases in double quotes, lowercased. */
export function searchTerms(search: string): string[] {
  const terms: string[] = []
  for (const m of search.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = (m[1] ?? m[2] ?? '').trim()
    if (term !== '' && term !== '"') terms.push(term)
  }
  return terms
}

/** How often `term` is in `text`, counted up to five. */
function count(text: string, term: string): number {
  let n = 0
  for (let at = text.indexOf(term); at !== -1 && n < 5; at = text.indexOf(term, at + term.length))
    n++
  return n
}

/**
 * The score of `record` for `terms`, or 0 when it lacks one of them. For each term: 20 when the
 * title or the id holds it, 6 when a field does and 2 when the body does, plus 1 for each further
 * time a field or the body holds it, up to 4 each.
 */
export function score(record: CorpusRecord, terms: readonly string[]): number {
  const text = textOf(record)
  let total = 0
  for (const term of terms) {
    const fields = count(text.fields, term)
    const body = count(text.body, term)
    const title = text.title.includes(term)
    if (!title && fields === 0 && body === 0) return 0
    total += (title ? 20 : 0) + (fields > 0 ? 5 + fields : 0) + (body > 0 ? 1 + body : 0)
  }
  return total
}

const WIDTH = 160
const LINK = /^!?\[[^\]]*\]\([^)]*\)$|^\[\[[^\]]*\]\]$/

/** `text` around `at`, on one line, with an ellipsis at each end that was cut. */
function around(text: string, at: number, length: number): string {
  const start = Math.max(0, at - Math.floor((WIDTH - length) / 2))
  const cut = text
    .slice(start, start + WIDTH)
    .replace(/\s+/g, ' ')
    .trim()
  return `${start > 0 ? '…' : ''}${cut}${start + WIDTH < text.length ? '…' : ''}`
}

/**
 * The text around the first term the body holds, else around a term in a string field, on one
 * line. A field that is only a link is used when no other field holds a term. `''` for none.
 */
export function snippet(record: CorpusRecord, terms: readonly string[]): string {
  // Lowercasing changes the length of a few characters; then the place is close, not exact.
  const body = textOf(record).body
  for (const term of terms) {
    const at = body.indexOf(term)
    if (at !== -1) return around(record.body ?? '', at, term.length)
  }
  const fields: string[] = []
  strings(record.data, fields)
  let link = ''
  for (const field of fields) {
    const lower = field.toLowerCase()
    for (const term of terms) {
      const at = lower.indexOf(term)
      if (at === -1) continue
      if (!LINK.test(field)) return around(field, at, term.length)
      link ||= around(field, at, term.length)
    }
  }
  return link
}
