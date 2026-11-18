/**
 * A URL longer than the scan reads in place is answered from a run or from
 * tables. These bodies check that answer against the URL read char by char,
 * as the Rust crate's `long_urls_end_where_reading_them_char_by_char_ends`
 * does. Each body holds several link attempts, so a later one can start
 * inside the run an earlier one made.
 */
import { expect, test } from 'vitest'
import { bodyLinksSpannedWith } from '../src/index.ts'

/** A seeded generator, so a failure repeats: the high bits of a 32-bit LCG. */
function generator(seed: number): (bound: number) => number {
  let state = seed >>> 0
  return (bound) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return (state >>> 8) % bound
  }
}

/** The end of the unbracketed URL at `from`, read char by char. */
function urlEndByHand(chars: string[], from: number): number | null {
  let depth = 0
  let escaped = false
  for (let k = from; k < chars.length; k++) {
    const c = chars[k]!
    if (/\s/u.test(c)) return k > from && depth === 0 ? k : null
    if (!escaped) {
      if (c === '(') depth++
      else if (c === ')') {
        if (depth === 0) return k
        depth--
      }
    }
    escaped = !escaped && c === '\\'
  }
  return null
}

test('long URLs end where reading them char by char ends', () => {
  const alphabet = [...'((()))\\\\ \na\u00a0é']
  // An `a` before the `[` so that no `\` escapes it.
  const opener = [...'a[a](']
  const next = generator(7)
  for (let round = 0; round < 10000; round++) {
    const spread = 1 + next(alphabet.length)
    const chars: string[] = []
    const attempts: number[] = []
    for (let attempt = 1 + next(5); attempt > 0; attempt--) {
      attempts.push(chars.length + 1)
      chars.push(...opener)
      for (let k = 20 + next(120); k > 0; k--) {
        chars.push(next(8) === 0 ? alphabet[next(spread)]! : 'a')
      }
    }
    const body = chars.join('')
    const links = bodyLinksSpannedWith(body, { allMarkdownLinks: true })
    let found = 0
    let after = 0
    for (const open of attempts) {
      if (open < after) continue
      // Spaces and tabs may come before the URL, but no line break.
      let start = open + 4
      while (chars[start] === ' ' || chars[start] === '\t') start++
      const end = chars[start] === '\n' ? null : urlEndByHand(chars, start)
      const url = end === null ? '' : body.slice(start, end)
      const link = links[found]?.start === open ? links[found] : undefined
      if (url === '') {
        expect(link, `${open} in ${body}`).toBeUndefined()
      } else if (chars[end!] === ')') {
        expect(link && { raw: link.raw, end: link.end }, `${open} in ${body}`).toEqual({
          raw: url,
          end: end! + 1,
        })
      } else if (link !== undefined) {
        // The URL ends at whitespace, so whether it is a link depends on what
        // follows: a title or a `)`.
        expect(link.raw, `${open} in ${body}`).toBe(url)
      }
      if (link !== undefined) {
        found++
        after = link.end
      }
    }
    expect(found, body).toBe(links.length)
  }
})
