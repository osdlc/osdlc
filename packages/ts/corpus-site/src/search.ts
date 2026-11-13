/** Searching `data/search.json` in the browser: a scan of every record's text. */
import type { SearchData } from './data-types.ts'
import { queryWords } from './filter.ts'

/** A search index ready to query: the rows, with their text lower-cased once. */
export interface SearchIndex {
  data: SearchData
  lower: { title: string; fields: string; body: string }[]
}

/** Prepare a fetched `data/search.json` for `search`. */
export function prepareSearch(data: SearchData): SearchIndex {
  return {
    data,
    lower: data.docs.map((d) => ({
      title: d[1].toLowerCase(),
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
  /** Text around the first match outside the title, or the start of the record's text. */
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

/**
 * The records that hold every word of `query`, best first: a word in the title counts most
 * (more at its start or as the whole title), then one in the key fields, then one in the body.
 * `type` keeps the records of one type, by name.
 */
export function search(
  index: SearchIndex,
  query: string,
  { limit = SEARCH_LIMIT, type }: { limit?: number; type?: string } = {},
): { total: number; hits: SearchHit[] } {
  const words = queryWords(query)
  if (words.length === 0) return { total: 0, hits: [] }
  const typeIndex = type === undefined ? -1 : index.data.types.indexOf(type)
  const phrase = words.join(' ')
  const scored: { i: number; score: number }[] = []
  for (let i = 0; i < index.lower.length; i++) {
    if (typeIndex !== -1 && (index.data.docs[i] as SearchData['docs'][number])[2] !== typeIndex)
      continue
    const doc = index.lower[i] as SearchIndex['lower'][number]
    let score = 0
    for (const word of words) {
      const inTitle = doc.title.indexOf(word)
      if (inTitle !== -1) score += inTitle === 0 ? 12 : 8
      else if (doc.fields.includes(word)) score += 3
      else if (doc.body.includes(word)) score += 1
      else {
        score = 0
        break
      }
    }
    if (score === 0) continue
    if (doc.title === phrase) score += 20
    else if (doc.title.includes(phrase)) score += 6
    scored.push({ i, score })
  }
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  const hits = scored.slice(0, limit).map(({ i, score }): SearchHit => {
    const doc = index.data.docs[i] as SearchData['docs'][number]
    const lower = index.lower[i] as SearchIndex['lower'][number]
    const inFields = words.some((w) => lower.fields.includes(w))
    const inBody = words.some((w) => lower.body.includes(w))
    const snippet =
      inBody || !inFields
        ? snippetOf(doc[4] || doc[3], inBody ? lower.body : lower.fields, words)
        : snippetOf(doc[3], lower.fields, words)
    return {
      url: doc[0],
      title: doc[1],
      type: index.data.types[doc[2]] ?? '',
      snippet,
      marks: marksOf(snippet, words),
      score,
    }
  })
  return { total: scored.length, hits }
}
