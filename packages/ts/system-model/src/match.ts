/**
 * Ranked search over catalog entries — the one matcher both views use.
 *
 * Every surface over this catalog has to agree on what a query means, or the
 * same keystrokes rank differently depending on which one you reached for.
 * The terminal UI imports it directly; the web view loads it transpiled for
 * the browser, which is why it has its own `./match` export subpath and why it
 * must stay free of DOM and of node builtins. Importing anything from
 * `node:fs` here breaks the browser build.
 *
 * Query language, such as it is:
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
export type Mode = 'fuzzy' | 'exact'

/**
 * Case-insensitive subsequence match. Consecutive characters and matches at a
 * word boundary score higher, so "ddev" ranks "determined:dev" above an
 * incidental scatter of those letters.
 */
export function fuzzy(text: string, rawTerm: string): Hit | null {
  const hay = text.toLowerCase()
  // Both sides are lowered here rather than trusting the caller: `terms()`
  // already lowers, but these are exported and a capitalised term would
  // otherwise fail to match anything, silently.
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
  // A subsequence smeared across a long string is a coincidence, not a hit:
  // "photo" is a subsequence of the absolute path inside sdf:dev's command
  // line. Require the matched span to stay near the term's own length.
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
