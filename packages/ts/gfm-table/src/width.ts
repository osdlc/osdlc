/**
 * Display width of cell text in columns, as rumdl measures it with the
 * unicode-width crate. East Asian wide and fullwidth characters and emoji
 * take 2 columns, combining marks 0, and other characters 1.
 */

import { WIDE, ZERO_WIDTH } from './width-data.ts'

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

const EMOJI = /^\p{Emoji}$/u
const REGIONAL_INDICATOR = /^\p{Regional_Indicator}$/u
const MODIFIER_BASE = /^\p{Emoji_Modifier_Base}$/u

/**
 * The display width of `text`: the sum of its characters' widths, with two
 * emoji sequences counted as 2 in all. U+FE0F after an emoji shown as text
 * makes it an emoji, and a skin-tone modifier joins the emoji before it.
 * Other ligatures, such as Arabic lam-alef, count as the sum of their
 * characters.
 */
export function displayWidth(text: string): number {
  let width = 0
  let prev = ''
  let prevWidth = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    let w = charWidth(cp)
    if (cp === 0xfe0f && prevWidth === 1 && EMOJI.test(prev) && !REGIONAL_INDICATOR.test(prev)) {
      w = 1
    } else if (cp >= 0x1f3fb && cp <= 0x1f3ff && MODIFIER_BASE.test(prev)) {
      w = 2 - prevWidth
    }
    width += w
    prev = ch
    prevWidth = w
  }
  return width
}
