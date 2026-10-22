import { describe, expect, test } from 'vitest'
import {
  cellTextFromSource,
  endsWithEscape,
  escapeCell,
  escapeCellInsert,
  escapeCodeCell,
  literalPipeFixes,
  sourceOffset,
  textOffset,
} from '../src/index.ts'

describe('cellTextFromSource', () => {
  test('plain text maps one to one', () => {
    expect(cellTextFromSource('abc')).toEqual({ text: 'abc', offsets: [0, 1, 2, 3] })
  })

  test('an escaped pipe reads as one character spanning two source bytes', () => {
    expect(cellTextFromSource('a \\| b')).toEqual({ text: 'a | b', offsets: [0, 1, 2, 4, 5, 6] })
  })

  test('an escaped backslash before a pipe leaves the pipe escape alone', () => {
    // `\\\|` is an escaped backslash, then an escaped pipe.
    expect(cellTextFromSource('x\\\\\\|').text).toBe('x\\\\|')
  })

  test('an escaped pipe inside inline code reads as a pipe, as GFM renders it', () => {
    expect(cellTextFromSource('`x \\| y`').text).toBe('`x | y`')
  })

  test('other escapes stay as inline markdown', () => {
    expect(cellTextFromSource('\\*x\\\\').text).toBe('\\*x\\\\')
  })
})

describe('escapeCellInsert', () => {
  test('escapes pipes and flattens line breaks', () => {
    expect(escapeCellInsert('a|b\r\nc\rd\ne')).toBe('a\\|b c d e')
  })
})

describe('literalPipeFixes', () => {
  test('a pipe after an even run needs nothing', () => {
    expect(literalPipeFixes('a\\\\|b', [])).toEqual([])
  })

  test('a pipe typed after a trailing backslash gets one more backslash', () => {
    expect(literalPipeFixes('a\\|', [{ from: 2, to: 3 }])).toEqual([
      { from: 2, to: 2, insert: '\\' },
    ])
    expect(literalPipeFixes('a\\\\\\|', [{ from: 4, to: 5 }])).toEqual([
      { from: 4, to: 4, insert: '\\' },
    ])
  })

  test('a typed backslash before a pipe gets its pair', () => {
    expect(literalPipeFixes('a\\|', [{ from: 1, to: 2 }])).toEqual([
      { from: 2, to: 2, insert: '\\' },
    ])
  })

  test('a deleted backslash takes its pair with it', () => {
    expect(literalPipeFixes('a\\|', [])).toEqual([{ from: 1, to: 2, insert: '' }])
  })
})

describe('escapeCell', () => {
  test('trims, flattens tabs and line breaks, escapes pipes', () => {
    expect(escapeCell('  a\tb|c\r\nd  ')).toBe('a b\\|c d')
  })

  test('a pipe after an odd backslash run stays literal', () => {
    // Text `a\|b`: the pipe follows one backslash, so one more is added.
    expect(escapeCell('a\\|b')).toBe('a\\\\\\|b')
    expect(cellTextFromSource(escapeCell('a\\\\|b')).text).toBe('a\\\\|b')
  })
})

describe('escapeCodeCell', () => {
  test('escapes pipes only, keeps backslashes, trims and flattens', () => {
    expect(escapeCodeCell('  ls | wc\tx\n')).toBe('ls \\| wc x')
    expect(escapeCodeCell('C:\\dir')).toBe('C:\\dir')
  })

  test('a pipe after an even backslash run gets an escape', () => {
    expect(escapeCodeCell('a\\\\|b')).toBe('a\\\\\\|b')
  })

  test('a pipe after an odd backslash run is already escaped and never splits the cell', () => {
    expect(escapeCodeCell('grep "a\\|b"')).toBe('grep "a\\|b"')
  })
})

describe('endsWithEscape', () => {
  test('odd runs escape, even runs do not', () => {
    expect(endsWithEscape('a\\')).toBe(true)
    expect(endsWithEscape('a\\\\')).toBe(false)
    expect(endsWithEscape('a\\\\\\')).toBe(true)
    expect(endsWithEscape('')).toBe(false)
  })
})

describe('sourceOffset / textOffset', () => {
  const cell = cellTextFromSource('a\\|b')

  test('text positions map to source offsets, clamped', () => {
    expect([0, 1, 2, 3].map((pos) => sourceOffset(cell, pos))).toEqual([0, 1, 3, 4])
    expect(sourceOffset(cell, 99)).toBe(4)
    expect(sourceOffset(cell, -1)).toBe(0)
  })

  test('source offsets map back; inside an escape rounds down', () => {
    expect([0, 1, 2, 3, 4].map((offset) => textOffset(cell, offset))).toEqual([0, 1, 1, 2, 3])
  })
})
