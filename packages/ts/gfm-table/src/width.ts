/**
 * Display width of cell text in columns, as rumdl measures it with the
 * unicode-width crate. East Asian wide and fullwidth characters and emoji
 * take 2 columns, combining marks 0, and other characters 1. All Unicode
 * data comes from width-data.ts, not from the JavaScript engine, so every
 * runtime gives the same widths.
 */

import { FE0F_BASE, MODIFIER_BASE, WIDE, ZERO_WIDTH } from './width-data.ts'

function inRanges(ranges: readonly number[], cp: number): boolean {
  let lo = 0
  let hi = ranges.length / 2 - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cp < ranges[2 * mid]!) hi = mid - 1
    else if (cp > ranges[2 * mid + 1]!) lo = mid + 1
    else return true
  }
  return false
}

function charWidth(cp: number): number {
  if (cp === 0x17d8) return 3 // KHMER SIGN BEYYAL
  if (inRanges(ZERO_WIDTH, cp)) return 0
  return inRanges(WIDE, cp) ? 2 : 1
}

/**
 * The display width of `text`: the sum of its characters' widths, except
 * for two kinds of emoji sequence, which count 2 each: an emoji shown as
 * text followed by U+FE0F, and an emoji followed by a skin-tone modifier.
 * Other ligatures, such as Arabic lam-alef, and U+FE0E after an emoji count
 * as the sum of their characters.
 */
export function displayWidth(text: string): number {
  let width = 0
  // The previous character, and its width on its own.
  let prev = -1
  let prevWidth = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    const own = charWidth(cp)
    let w = own
    if (cp === 0xfe0f && inRanges(FE0F_BASE, prev)) {
      w = 1
    } else if (cp >= 0x1f3fb && cp <= 0x1f3ff && inRanges(MODIFIER_BASE, prev)) {
      w = 2 - prevWidth
    }
    width += w
    prev = cp
    prevWidth = own
  }
  return width
}
