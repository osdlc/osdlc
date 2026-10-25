/** stripControls, displayWidth and fitWidth on hostile and wide text. */
import { describe, expect, test } from 'vitest'

import { displayWidth, fitWidth, stripControls } from '../src/index.ts'

const ESC = '\x1b'
const BEL = '\x07'
const ST = `${ESC}\\`

describe('stripControls', () => {
  test.each<[string, string, string]>([
    ['OSC 52 clipboard write ended by BEL', `a${ESC}]52;c;cm0gLXJmIH4=${BEL}b`, 'ab'],
    ['OSC 52 clipboard write ended by ST', `a${ESC}]52;c;cm0gLXJmIH4=${ST}b`, 'ab'],
    ['OSC 0 window title', `a${ESC}]0;pwned${BEL}b`, 'ab'],
    ['OSC 2 window title ended by ST', `a${ESC}]2;pwned${ST}b`, 'ab'],
    ['OSC 8 hyperlink', `${ESC}]8;;https://x.test${ST}link${ESC}]8;;${ST}`, 'link'],
    ['CSI color', `${ESC}[1;31mred${ESC}[0m`, 'red'],
    ['CSI cursor move and erase', `a${ESC}[2J${ESC}[10;20Hb${ESC}[?1049h`, 'ab'],
    ['DCS string', `a${ESC}Pq#0;2;0;0;0${ST}b`, 'ab'],
    ['APC, PM and SOS strings', `a${ESC}_x${ST}b${ESC}^y${ST}c${ESC}Xz${ST}d`, 'abcd'],
    ['two-character escapes', `a${ESC}cb${ESC}7c${ESC}8d${ESC}=e`, 'abcde'],
    ['an escape with an intermediate', `a${ESC}(Bb${ESC}#8c`, 'abc'],
    ['8-bit CSI', 'a\x9b31mb', 'ab'],
    ['8-bit OSC title ended by 8-bit ST', 'a\x9d0;pwned\x9cb', 'ab'],
    ['8-bit OSC ended by BEL', `a\x9d52;c;eA==${BEL}b`, 'ab'],
    ['8-bit DCS and APC', 'a\x90x\x9cb\x9fy\x9cc', 'abc'],
    ['other C1 controls', 'a\x85b\x8dc\x9ad', 'abcd'],
    ['C0 controls, CR and DEL', 'a\x00b\x08c\x0bd\re\x7ff', 'abcdef'],
    ['tab and newline by default', 'a\tb\nc', 'abc'],
    ['bidi override and isolate', 'a‮b⁦c⁩d‪e', 'abcde'],
    ['bidi marks ALM, LRM and RLM', 'a\u061cb\u200ec\u200fd', 'abcd'],
    ['a lone ESC at the end', `a${ESC}`, 'a'],
    ['ESC ESC', `a${ESC}${ESC}[31mb`, 'ab'],
    ['an unterminated OSC drops the rest', `a${ESC}]52;c;eA==`, 'a'],
    ['an unterminated CSI', `a${ESC}[31`, 'a'],
    ['an ESC inside OSC starts a new sequence', `a${ESC}]0;t${ESC}[31mb`, 'ab'],
    ['a control byte ends a CSI and is removed', `a${ESC}[3\x07b`, 'ab'],
    ['U+001F ends a CSI and is removed', `a${ESC}[3\x1fb`, 'ab'],
    ['DEL ends a CSI and is removed', `a${ESC}[3\x7fb`, 'ab'],
    ['a character above U+007E ends a CSI and is kept', `a${ESC}[3éb`, 'aéb'],
    ['a space is a CSI intermediate', `a${ESC}[2 qb`, 'ab'],
    ['a ? is a CSI parameter', `a${ESC}[?25lb`, 'ab'],
  ])('removes %s', (_, input, expected) => {
    expect(stripControls(input)).toBe(expected)
  })

  test('keeps text, combining marks, emoji and wide characters', () => {
    const text = 'café é 日本語 👨‍👩‍👧 🇯🇵 ❤️ a‍b'
    expect(stripControls(text)).toBe(text)
  })

  test('keeps newlines and tabs when asked, and still removes CR', () => {
    expect(stripControls('a\r\nb\tc', { newline: true })).toBe('a\nbc')
    expect(stripControls('a\r\nb\tc', { tab: true })).toBe('ab\tc')
    expect(stripControls('a\r\nb\tc', { newline: true, tab: true })).toBe('a\nb\tc')
  })

  test('the result has no control character left', () => {
    let all = ''
    for (let c = 0; c < 0xa0; c++) all += String.fromCharCode(c)
    const out = stripControls(`${all}${all}`)
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\x00-\x1f\x7f-\x9f]/)
  })
})

describe('displayWidth', () => {
  test.each<[string, string, number]>([
    ['ASCII', 'abc', 3],
    ['empty', '', 0],
    ['CJK', '日本語', 6],
    ['fullwidth Latin', 'ＡＢ', 4],
    ['a combining acute', 'é', 1],
    ['a lone combining mark', '́', 0],
    ['a precomposed letter', 'é', 1],
    ['an emoji', '👍', 2],
    ['a ZWJ family', '👨‍👩‍👧', 2],
    ['a flag', '🇯🇵', 2],
    ['a text symbol with VS16', '❤️', 2],
    ['a zero-width space', 'a​b', 2],
    ['an East Asian ambiguous character', '±', 1],
    ['Hangul', '한국', 4],
    ['a tab counts 0', 'a\tb', 2],
  ])('%s', (_, text, width) => {
    expect(displayWidth(text)).toBe(width)
  })
})

describe('fitWidth', () => {
  test('text that fits is unchanged', () => {
    expect(fitWidth('abc', 3)).toBe('abc')
    expect(fitWidth('abc', 10)).toBe('abc')
  })

  test('cut text ends in an ellipsis inside the width', () => {
    expect(fitWidth('abcdef', 4)).toBe('abc…')
    expect(displayWidth(fitWidth('abcdef', 4))).toBe(4)
  })

  test('a wide character is never split; the spare column stays empty', () => {
    expect(fitWidth('日本語テキスト', 6)).toBe('日本…')
    expect(fitWidth('日本語テキスト', 6, { pad: true })).toBe('日本… ')
    expect(fitWidth('日本語', 5, { ellipsis: '' })).toBe('日本')
  })

  test('a combining mark stays with its letter', () => {
    expect(fitWidth('ééé', 2)).toBe('é…')
  })

  test('a custom ellipsis, or none', () => {
    expect(fitWidth('abcdef', 5, { ellipsis: '...' })).toBe('ab...')
    expect(fitWidth('abcdef', 3, { ellipsis: '' })).toBe('abc')
  })

  test('an ellipsis wider than the width is dropped', () => {
    expect(fitWidth('abcdef', 2, { ellipsis: '...' })).toBe('ab')
    expect(fitWidth('abc', 0)).toBe('')
  })

  test('pad fills to exactly the width', () => {
    expect(fitWidth('ab', 4, { pad: true })).toBe('ab  ')
    expect(fitWidth('日', 3, { pad: true })).toBe('日 ')
    expect(fitWidth('abcdef', 4, { pad: true })).toBe('abc…')
  })

  test.each([-1, 1.5, Number.NaN, Infinity])('width %s throws a RangeError', (width) => {
    expect(() => fitWidth('abc', width)).toThrow(RangeError)
  })
})
