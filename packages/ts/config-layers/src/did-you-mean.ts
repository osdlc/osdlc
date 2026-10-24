/**
 * Close-match suggestions for a mistyped name (noun, verb, config key,
 * repo). Every CLI built on this package uses the same rule.
 */

/** Optimal-string-alignment distance: edits plus adjacent transpositions. */
function distance(a: string, b: string): number {
  let prev2: number[] = []
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2]! + 1)
      }
      row.push(d)
    }
    prev2 = prev
    prev = row
  }
  return prev[b.length]!
}

/**
 * The candidates closest to `input`, nearest first, ties alphabetical.
 *
 * A candidate matches when its edit distance (case-insensitive) is at most
 * `max(1, floor(input.length / 3))`, or when `input` is a prefix of it and is
 * at least 3 characters long. Returns at most `opts.max` names (default 3).
 * @experimental
 */
export function closestMatches(
  input: string,
  candidates: readonly string[],
  opts: { max?: number } = {},
): string[] {
  const max = opts.max ?? 3
  const needle = input.toLowerCase()
  const limit = Math.max(1, Math.floor(needle.length / 3))
  const scored: { name: string; d: number }[] = []
  for (const name of new Set(candidates)) {
    const hay = name.toLowerCase()
    const d = distance(needle, hay)
    if (d <= limit || (needle.length >= 3 && hay.startsWith(needle))) scored.push({ name, d })
  }
  scored.sort((x, y) => x.d - y.d || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
  return scored.slice(0, max).map((s) => s.name)
}

/**
 * `did you mean: a, b?` over the closest matches, or null when none.
 *
 * @experimental
 */
export function didYouMean(input: string, candidates: readonly string[]): string | null {
  const matches = closestMatches(input, candidates)
  return matches.length === 0 ? null : `did you mean: ${matches.join(', ')}?`
}
