/** Searching `data/search.json` in the browser: a scan of every record's text. */
import type { SearchData } from './data-types.ts'
import { queryWords } from './filter.ts'

/** A search index ready to query: the rows, with their text lower-cased once. */
export interface SearchIndex {
  data: SearchData
  lower: { title: string; summary: string; fields: string; body: string }[]
}

/** Prepare a fetched `data/search.json` for `search`. */
export function prepareSearch(data: SearchData): SearchIndex {
  return {
    data,
    lower: data.docs.map((d) => ({
      title: d[1].toLowerCase(),
      summary: (d[5] ?? '').toLowerCase(),
      fields: d[3].toLowerCase(),
      body: d[4].toLowerCase(),
    })),
  }
}

/** One search result. */
export interface SearchHit {
  url: string
  title: string
  /** The type's label. */
  type: string
  /** The record's summary line, or `''`. */
  summary: string
  /** The ranges of `summary` that match a word. */
  summaryMarks: [number, number][]
  /**
   * Text around the first match in the fields or the body. `''` when the title and the summary
   * already show every word that matched.
   */
  snippet: string
  /** The ranges of `snippet` that match a word, as `[start, end]`. */
  marks: [number, number][]
  score: number
}

/** How many results `search` returns unless asked for more. */
export const SEARCH_LIMIT = 50

const SNIPPET = 160

function snippetOf(text: string, lower: string, words: string[]): string {
  let at = -1
  for (const word of words) {
    const found = lower.indexOf(word)
    if (found !== -1 && (at === -1 || found < at)) at = found
  }
  if (at === -1) return text.slice(0, SNIPPET)
  let start = Math.max(0, at - 50)
  if (start > 0) {
    const space = text.indexOf(' ', start)
    if (space !== -1 && space < at) start = space + 1
  }
  const piece = text.slice(start, start + SNIPPET)
  return `${start > 0 ? '… ' : ''}${piece}${start + SNIPPET < text.length ? ' …' : ''}`
}

function marksOf(snippet: string, words: string[]): [number, number][] {
  const lower = snippet.toLowerCase()
  const marks: [number, number][] = []
  for (const word of words)
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + word.length))
      marks.push([at, at + word.length])
  marks.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const mark of marks) {
    const last = merged[merged.length - 1]
    if (last !== undefined && mark[0] <= last[1]) last[1] = Math.max(last[1], mark[1])
    else merged.push(mark)
  }
  return merged
}

/** Words a question is made of and a record is not found by. */
const STOP = new Set(
  'a about all an and any are as at be by can do does each for from get go has have how i in into is it its me my of on or our should that the their them there they this to was we were what when where which who why will with would you your'.split(
    ' ',
  ),
)

/**
 * The words a query is matched by: lower-cased, without the small words of a question unless
 * it has no others, and without a plural or tense ending, so `skills` finds `skill` and
 * `called` finds `call`.
 */
export function searchWords(query: string): string[] {
  // Punctuation at the ends of a word is not part of it: `harness?` is `harness`.
  const all = queryWords(query)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
  const kept = all.filter((word) => !STOP.has(word))
  return [...new Set((kept.length > 0 ? kept : all).map(stem))]
}

const stem = (word: string): string =>
  word.length < 5
    ? word
    : word.replace(/(ing|ed|(?<=[sxz]|ch|sh)es|s)$/, (end) =>
        word.length - end.length < 3 ? end : '',
      )

/** Each word with the words of its synonym groups: any of them finds a record for the word. */
function alternatives(words: string[], synonyms: string[][] | undefined): string[][] {
  const groups = (synonyms ?? []).map((group) => group.map(stem))
  return words.map((word) => [
    ...new Set([word, ...groups.filter((group) => group.includes(word)).flat()]),
  ])
}

/** How much a word counts by where it is found. */
const WEIGHT = { titleStart: 12, title: 8, summary: 5, fields: 3, body: 1 }

/**
 * The records that hold the words of `query`, best first. A word in the title counts most (more
 * at its start or as the whole title), then one in the summary, then one in the key fields, then
 * one in the body, all times the weight of the record's type. A query of one or two words finds
 * the records that hold all of them. A longer one finds those that hold more than half, and a
 * record's score is scaled by the share it holds. A word of a synonym group is found by any
 * word of the group.
 * `type` keeps the records of one type, by name.
 */
export function search(
  index: SearchIndex,
  query: string,
  { limit = SEARCH_LIMIT, type }: { limit?: number; type?: string } = {},
): { total: number; hits: SearchHit[] } {
  const words = searchWords(query)
  if (words.length === 0) return { total: 0, hits: [] }
  const typeIndex = type === undefined ? -1 : index.data.types.indexOf(type)
  const phrase = queryWords(query).join(' ')
  const wanted = alternatives(words, index.data.synonyms)
  const marks = wanted.flat()
  const has = (text: string, any: string[]): boolean => any.some((word) => text.includes(word))
  const needed = wanted.length
  const scored: { i: number; score: number; held: number }[] = []
  for (let i = 0; i < index.lower.length; i++) {
    const row = index.data.docs[i] as SearchData['docs'][number]
    if (typeIndex !== -1 && row[2] !== typeIndex) continue
    const doc = index.lower[i] as SearchIndex['lower'][number]
    let score = 0
    let held = 0
    for (const any of wanted) {
      if (has(doc.title, any))
        score += any.some((word) => doc.title.startsWith(word)) ? WEIGHT.titleStart : WEIGHT.title
      else if (has(doc.summary, any)) score += WEIGHT.summary
      else if (has(doc.fields, any)) score += WEIGHT.fields
      else if (has(doc.body, any)) score += WEIGHT.body
      else continue
      held++
    }
    if (held === 0) continue
    if (doc.title === phrase) score += 20
    else if (doc.title.includes(phrase)) score += 6
    else if (doc.summary.includes(phrase)) score += 4
    scored.push({ i, score: score * (index.data.weights?.[row[2]] ?? 1), held })
  }
  // A question of three words or more seldom has all of them in the record that answers it.
  const kept = scored.filter((s) => (needed >= 3 ? s.held * 2 > needed : s.held === needed))
  for (const s of kept) s.score *= s.held / needed
  kept.sort((a, b) => b.score - a.score || a.i - b.i)
  const hits = kept.slice(0, limit).map(({ i, score }): SearchHit => {
    const doc = index.data.docs[i] as SearchData['docs'][number]
    const lower = index.lower[i] as SearchIndex['lower'][number]
    const summary = doc[5] ?? ''
    // The snippet is for a word the title and the summary do not show.
    const hidden = wanted.filter((any) => !has(lower.title, any) && !has(lower.summary, any)).flat()
    const inBody = hidden.some((w) => lower.body.includes(w))
    const snippet =
      hidden.length === 0 && summary !== ''
        ? ''
        : inBody || !hidden.some((w) => lower.fields.includes(w))
          ? snippetOf(
              doc[4] || (summary === '' ? doc[3] : ''),
              lower.body,
              hidden.length > 0 ? hidden : marks,
            )
          : snippetOf(doc[3], lower.fields, hidden)
    return {
      url: doc[0],
      title: doc[1],
      type: index.data.types[doc[2]] ?? '',
      summary,
      summaryMarks: marksOf(summary, marks),
      snippet,
      marks: marksOf(snippet, marks),
      score,
    }
  })
  return { total: kept.length, hits }
}
