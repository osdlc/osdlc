/**
 * displayWidth against the unicode-width crate, 0.2.2, the version rumdl
 * 0.3.0 measures table cells with. Each expected width is that crate's
 * `UnicodeWidthStr::width` for the string.
 */

import { expect, test } from 'bun:test'
import { displayWidth } from '../src/width.ts'

const CASES: [name: string, text: string, width: number][] = [
  ['ASCII', 'abc', 3],
  ['CJK ideographs', '中文', 4],
  ['fullwidth Latin', 'ｈｅｌｌｏ', 10],
  ['Hangul syllables', '한국어', 6],
  ['Hangul jamo: medial and final take no column', '한', 2],
  ['a combining mark', 'é', 1],
  ['an emoji shown as emoji by default', '✅', 2],
  ['an emoji shown as text by default', '☝', 1],
  ['... with U+FE0F', '☝️', 2],
  ['... with a skin-tone modifier', '☝\u{1f3fb}', 2],
  ['a wide emoji with a skin-tone modifier', '\u{1f44d}\u{1f3fd}', 2],
  ['a keycap', '1️⃣', 2],
  ['a flag', '\u{1f1ef}\u{1f1f5}', 2],
  ['the copyright sign, as text and as emoji', '© ©️', 4],
  ['a soft hyphen', '­', 0],
  ['KHMER SIGN BEYYAL', '៘', 3],
  ['an empty string', '', 0],
]

for (const [name, text, width] of CASES) {
  test(`displayWidth: ${name}`, () => {
    expect(displayWidth(text)).toBe(width)
  })
}
