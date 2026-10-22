/**
 * displayWidth against the unicode-width crate, 0.2.2, the version rumdl
 * 0.3.0 measures table cells with. Each expected width is that crate's
 * `UnicodeWidthStr::width` for the string, here and in
 * fixtures/unicode-width.tsv. Each fixture line is a string's code points in
 * hex, a tab, and its width. The fixture checks a rebuilt width-data.ts.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'
import { displayWidth } from '../src/width.ts'

const CASES: [name: string, text: string, width: number][] = [
  ['ASCII', 'abc', 3],
  ['CJK ideographs', '\u4e2d\u6587', 4],
  ['fullwidth Latin', '\uff48\uff45\uff4c\uff4c\uff4f', 10],
  ['Hangul syllables', '\ud55c\uad6d\uc5b4', 6],
  ['Hangul jamo: medial and final take no column', '\u1112\u1161\u11ab', 2],
  ['a combining mark', 'e\u0301', 1],
  ['an emoji shown as emoji by default', '\u2705', 2],
  ['an emoji shown as text by default', '\u261d', 1],
  ['... with U+FE0F', '\u261d\ufe0f', 2],
  ['... with a skin-tone modifier', '\u261d\u{1f3fb}', 2],
  ['... with a skin-tone modifier, then U+FE0F', '\u261d\u{1f3fb}\ufe0f', 2],
  ['a wide emoji with a skin-tone modifier', '\u{1f44d}\u{1f3fd}', 2],
  ['a keycap', '1\ufe0f\u20e3', 2],
  ['a flag', '\u{1f1ef}\u{1f1f5}', 2],
  ['the copyright sign, as text and as emoji', '\u00a9 \u00a9\ufe0f', 4],
  ['a soft hyphen', '\u00ad', 0],
  ['KHMER SIGN BEYYAL', '\u17d8', 3],
  ['an empty string', '', 0],
]

for (const [name, text, width] of CASES) {
  test(`displayWidth: ${name}`, () => {
    expect(displayWidth(text)).toBe(width)
  })
}

test('displayWidth matches every string in fixtures/unicode-width.tsv', () => {
  const fixture = readFileSync(join(import.meta.dirname, 'fixtures', 'unicode-width.tsv'), 'utf-8')
  const rows = fixture.trimEnd().split('\n')
  expect(rows.length).toBeGreaterThan(100)
  const wrong = rows.filter((row) => {
    const [points, width] = row.split('\t')
    const text = String.fromCodePoint(...points!.split(' ').map((hex) => parseInt(hex, 16)))
    return displayWidth(text) !== Number(width)
  })
  expect(wrong).toEqual([])
})
