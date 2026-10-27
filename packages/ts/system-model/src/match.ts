/**
 * Ranked search over catalog entries. Both views use this one matcher.
 *
 * Every view of this catalog must agree on what a query means. Otherwise the
 * same query ranks differently depending on which view you use. The terminal
 * UI imports it directly. The web view loads it transpiled for the browser.
 * That is why it has its own `./match` export subpath, and why it must not use
 * the DOM or Node built-ins. Importing anything from `node:fs` here breaks the
 * browser build.
 *
 * Query language:
 *   - terms are whitespace-separated and ANDed; every term must match a field
 *   - a leading `'` forces that term to match as a substring, fzf-style
 *   - `mode: "exact"` forces every term to, without the prefix
 *   - matching is case-insensitive throughout
 */

/**
 * The subset of a {@link Task} that ranking looks at. Structural rather than
 * an import of `Task`, so the matcher stays usable over anything with a name
 * and some text.
 */
export interface Matchable {
  path: string[]
  display: string
  doc?: string | undefined
  detail?: string | undefined
  tags: string[]
}

/** A match of query terms in one field, scored. */
export interface Hit {
  score: number
  /** Matched character offsets within the field that matched. */
  idx: number[]
}

/** A match of query terms against a whole task, scored. */
export interface EntryMatch {
  score: number
  /** Offsets into `path.join(" ")`, when the chain is what matched. */
  labelHits: number[] | null
}

/** `fuzzy` matches letters in order; `exact` matches substrings. */
export type Mode = (typeof ALL_MATCH_MODES)[number]

/** The known {@link Mode}s. */
export const ALL_MATCH_MODES = ['fuzzy', 'exact'] as const

/**
 * Case-insensitive subsequence match. Consecutive characters and matches at a
 * word boundary score higher, so "ddev" ranks "determined:dev" above an
 * incidental scatter of those letters.
 */
export function fuzzy(text: string, rawTerm: string): Hit | null {
  const hay = text.toLowerCase()
  // Both sides are lowercased here rather than relying on the caller.
  // `terms()` already lowercases, but these functions are exported, and a
  // capitalised term would otherwise silently match nothing.
  const term = rawTerm.toLowerCase()
  let ti = 0
  let score = 0
  let streak = 0
  const idx: number[] = []
  for (let i = 0; i < hay.length && ti < term.length; i++) {
    if (hay[i] !== term[ti]) {
      streak = 0
      continue
    }
    const boundary = i === 0 || /[^a-z0-9]/.test(hay[i - 1]!)
    score += 1 + streak * 2 + (boundary ? 3 : 0)
    streak++
    idx.push(i)
    ti++
  }
  if (ti !== term.length) return null
  // A subsequence spread across a long string is a coincidence, not a match.
  // "photo" is a subsequence of the absolute path in sdf:dev's command line.
  // Require the matched span to stay close to the term's own length.
  const span = idx[idx.length - 1]! - idx[0]! + 1
  if (span > term.length * 4 + 8) return null
  return { score, idx }
}

/** Substring hit. Always outranks any subsequence hit on the same field. */
export function exact(text: string, rawTerm: string): Hit | null {
  const term = rawTerm.toLowerCase()
  const at = text.toLowerCase().indexOf(term)
  if (at < 0) return null
  const boundary = at === 0 || /[^a-z0-9]/.test(text[at - 1]!.toLowerCase())
  const idx: number[] = []
  for (let k = 0; k < term.length; k++) idx.push(at + k)
  return { score: 1000 + term.length * 4 + (boundary ? 20 : 0), idx }
}

/** Split a raw query into terms. Empty query means "everything matches". */
export function terms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

/**
 * Score one entry against every term, or return null if any term misses.
 * Fields are ordered most- to least-identifying and scores decay by position,
 * so a hit on the command's name beats the same hit buried in its tags.
 */
export function matchEntry(entry: Matchable, queryTerms: string[], mode: Mode): EntryMatch | null {
  const fields = [
    entry.path.join(' '),
    entry.display,
    entry.doc || '',
    entry.detail || '',
    entry.tags.join(' '),
  ]
  let total = 0
  let labelHits: number[] | null = null
  for (const raw of queryTerms) {
    const forced = raw.startsWith("'")
    const term = forced ? raw.slice(1) : raw
    if (!term) continue
    const match =
      forced || mode === 'exact' ? exact : (t: string, x: string) => exact(t, x) || fuzzy(t, x)
    let best: Hit | null = null
    let bestField = -1
    for (let f = 0; f < fields.length; f++) {
      const hit = match(fields[f]!, term)
      if (hit && (!best || hit.score - f * 6 > best.score - bestField * 6)) {
        best = hit
        bestField = f
      }
    }
    if (!best) return null
    total += best.score - bestField * 6
    if (bestField === 0 && !labelHits) labelHits = best.idx
  }
  return { score: total, labelHits }
}
