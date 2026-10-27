/** Helpers for printing untrusted text to a terminal. */

import { eastAsianWidth } from 'get-east-asian-width'

/** Options for {@link stripControls}. */
export interface StripControlsOptions {
  /** Keep line feeds (`\n`). A carriage return is always removed. Default `false`. */
  readonly newline?: boolean
  /** Keep tabs (`\t`). Default `false`. */
  readonly tab?: boolean
}

const ESC = 0x1b
const BEL = 0x07
/** 8-bit C1 introducers and the string terminator. */
const C1_CSI = 0x9b
const C1_ST = 0x9c
/** The C1 controls, 7-bit (after ESC) and 8-bit, that open a string ended by ST. */
const STRING_7BIT = new Set([0x5d, 0x50, 0x58, 0x5e, 0x5f]) // ] P X ^ _
const STRING_8BIT = new Set([0x9d, 0x90, 0x98, 0x9e, 0x9f]) // OSC DCS SOS PM APC
/**
 * Bidirectional controls, which reorder the text around them: the marks ALM,
 * LRM and RLM, and the embeddings, overrides and isolates. A character-class
 * body.
 */
const BIDI = '\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069'
/** C0, DEL, C1 and the bidi controls: every single character {@link stripControls} removes. */
const CONTROL = new RegExp(`[\\u0000-\\u001f\\u007f-\\u009f${BIDI}]`)

/** The C0 class body for each choice of kept tab and line feed. */
function c0Class(options: StripControlsOptions): string {
  const tab = options.tab === true
  const newline = options.newline === true
  if (tab && newline) return '\\u0000-\\u0008\\u000b-\\u001f'
  if (tab) return '\\u0000-\\u0008\\u000a-\\u001f'
  if (newline) return '\\u0000-\\u0009\\u000b-\\u001f'
  return '\\u0000-\\u001f'
}

/**
 * A global `RegExp` that matches, one character at a time, every control
 * character {@link stripControls} removes with the same `options`: C0 (a tab
 * or line feed kept by `options` excepted; a carriage return always
 * matches), DEL, C1 and the bidirectional controls.
 *
 * It does not know escape sequences, so it matches only the ESC or C1
 * introducer of one, not the rest. For a filter that must keep the text's
 * length, such as one that replaces each control with U+FFFD so offsets into
 * the text stay valid.
 */
export function controlPattern(options: StripControlsOptions = {}): RegExp {
  return new RegExp(`[${c0Class(options)}\\u007f-\\u009f${BIDI}]`, 'g')
}

/**
 * `text` with every terminal control removed, so printing it cannot move the
 * cursor, change colors, set the window title, write the clipboard (OSC 52)
 * or send any other command to the terminal.
 *
 * Removed:
 *
 * - Escape sequences, whole: CSI (`ESC [` … final byte), the strings opened
 *   by OSC, DCS, SOS, PM and APC up to BEL or ST, or up to the next ESC,
 *   which ends the string and starts a new sequence (or the end of the text
 *   when there is no terminator), and two-character escapes such as `ESC c`.
 * - The same sequences in their 8-bit C1 form (`U+009B` CSI, `U+009D` OSC
 *   and the rest), and every other C1 control, `U+0080`-`U+009F`.
 * - C0 controls, `U+0000`-`U+001F`, except a tab or line feed you keep with
 *   `options`. A carriage return is always removed.
 * - DEL, `U+007F`.
 * - The bidirectional controls: the marks `U+061C`, `U+200E` and `U+200F`,
 *   and `U+202A`-`U+202E` and `U+2066`-`U+2069`.
 *
 * Other text, including combining marks and emoji, is kept as is.
 */
export function stripControls(text: string, options: StripControlsOptions = {}): string {
  let out = ''
  let i = 0
  const n = text.length
  const code = (at: number) => (at < n ? text.charCodeAt(at) : -1)

  /** The index after a string body that starts at `at`: past BEL or ST, or at an ESC that is not ST. */
  const skipString = (at: number): number => {
    while (at < n) {
      const c = code(at)
      if (c === BEL || c === C1_ST) return at + 1
      if (c === ESC) return code(at + 1) === 0x5c ? at + 2 : at
      at++
    }
    return n
  }

  /** The index after CSI parameters and intermediates that start at `at`, past the final byte. */
  const skipCsi = (at: number): number => {
    while (at < n) {
      const c = code(at)
      if (c >= 0x40 && c <= 0x7e) return at + 1
      // A byte that cannot be in a CSI ends it; the byte is handled on its own.
      if (c < 0x20 || c > 0x3f) return at
      at++
    }
    return n
  }

  while (i < n) {
    const c = code(i)
    if (c === ESC) {
      const next = code(i + 1)
      if (next === 0x5b) i = skipCsi(i + 2)
      else if (STRING_7BIT.has(next)) i = skipString(i + 2)
      else if (next >= 0x20 && next <= 0x7e) {
        // Intermediates 0x20-0x2F, then one final byte.
        let at = i + 1
        while (code(at) >= 0x20 && code(at) <= 0x2f) at++
        const final = code(at)
        i = final >= 0x30 && final <= 0x7e ? at + 1 : at
      } else i += 1
      continue
    }
    if (c === C1_CSI) {
      i = skipCsi(i + 1)
      continue
    }
    if (STRING_8BIT.has(c)) {
      i = skipString(i + 1)
      continue
    }
    const keep =
      (c === 0x0a && options.newline === true) ||
      (c === 0x09 && options.tab === true) ||
      !CONTROL.test(text[i]!)
    if (keep) out += text[i]
    i++
  }
  return out
}

let segmenter: Intl.Segmenter | undefined
const graphemes = (text: string): Iterable<Intl.SegmentData> =>
  (segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })).segment(text)

const ZERO_WIDTH = /^[\p{M}\p{Cf}\p{Cc}]+$/u
const WIDE_EMOJI = /\p{Emoji_Presentation}|️/u

/** The columns one grapheme cluster takes: 0, 1 or 2. */
function clusterWidth(cluster: string): number {
  if (ZERO_WIDTH.test(cluster)) return 0
  if (WIDE_EMOJI.test(cluster)) return 2
  return eastAsianWidth(cluster.codePointAt(0)!)
}

/**
 * The number of terminal columns `text` takes, counted per grapheme cluster.
 * East Asian wide and fullwidth characters and emoji take 2 columns.
 * Combining marks and format characters such as a zero-width joiner take 0.
 * East Asian ambiguous characters take 1. Remove controls first with
 * {@link stripControls}; any left count 0. A tab counts 0 too, because its
 * width depends on the column it starts at, so replace tabs with spaces
 * before you measure.
 */
export function displayWidth(text: string): number {
  let width = 0
  for (const { segment } of graphemes(text)) width += clusterWidth(segment)
  return width
}

/** Options for {@link fitWidth}. */
export interface FitWidthOptions {
  /** What marks cut text. Default `…`. Use `''` for none. */
  readonly ellipsis?: string
  /** Pad with spaces to exactly `width` columns. Default `false`. */
  readonly pad?: boolean
}

/**
 * `text` cut to at most `width` columns, as {@link displayWidth} counts
 * them. Cut text ends in `options.ellipsis`, inside the width. The cut falls
 * between grapheme clusters, so a combining mark stays with its letter and a
 * wide character is never split; a column a wide character could not fill
 * is left empty. When the ellipsis is wider than `width`, the text is cut
 * with no ellipsis. With `pad`, the result is padded with spaces to exactly
 * `width` columns.
 *
 * `text` should be one line with no controls or tabs; run
 * {@link stripControls} first.
 *
 * @throws RangeError when `width` is not a non-negative integer.
 */
export function fitWidth(text: string, width: number, options: FitWidthOptions = {}): string {
  if (!Number.isInteger(width) || width < 0) {
    throw new RangeError(`ux: width ${width} is not a non-negative integer`)
  }
  const padTo = (s: string, used: number) =>
    options.pad === true ? s + ' '.repeat(width - used) : s
  const full = displayWidth(text)
  if (full <= width) return padTo(text, full)
  let ellipsis = options.ellipsis ?? '…'
  let ellipsisWidth = displayWidth(ellipsis)
  if (ellipsisWidth > width) {
    ellipsis = ''
    ellipsisWidth = 0
  }
  const budget = width - ellipsisWidth
  let kept = ''
  let used = 0
  for (const { segment } of graphemes(text)) {
    const w = clusterWidth(segment)
    if (used + w > budget) break
    kept += segment
    used += w
  }
  return padTo(kept + ellipsis, used + ellipsisWidth)
}
