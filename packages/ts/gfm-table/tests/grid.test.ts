import { describe, expect, test } from 'vitest'
import {
  CELL_SOURCE_ATTR,
  clipboardLines,
  gridFromCsv,
  gridFromCsvPaste,
  gridFromTsv,
  htmlFromGrid,
  padRow,
  pasteRect,
  rectangular,
  toCsv,
  tsvFromGrid,
} from '../src/index.ts'

describe('padRow', () => {
  test('pads to width and leaves longer rows', () => {
    expect(padRow(['a'], 3)).toEqual(['a', '', ''])
    expect(padRow(['a', 'b'], 1)).toEqual(['a', 'b'])
  })
})

describe('rectangular', () => {
  test('pads ragged rows; empty is null', () => {
    expect(rectangular([['a'], ['b', 'c']])).toEqual([
      ['a', ''],
      ['b', 'c'],
    ])
    expect(rectangular([])).toBeNull()
    expect(rectangular([[]])).toBeNull()
  })
})

describe('clipboardLines', () => {
  test('any line break, one trailing break dropped', () => {
    expect(clipboardLines('a\r\nb\rc\nd\n')).toEqual(['a', 'b', 'c', 'd'])
    expect(clipboardLines('')).toEqual([''])
  })
})

describe('gridFromTsv', () => {
  test('tab-separated rows of one width', () => {
    expect(gridFromTsv('a\tb\nc\td\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  test('empty cells are kept', () => {
    expect(gridFromTsv('x\ty\n\tb\na\t')).toEqual([
      ['x', 'y'],
      ['', 'b'],
      ['a', ''],
    ])
  })

  test('CRLF line breaks and a missing trailing break both work', () => {
    expect(gridFromTsv('a\tb\r\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  test('tab-indented code and ragged rows stay text', () => {
    expect(gridFromTsv('\tfoo()\n\tbar()')).toBeNull()
    expect(gridFromTsv('a\tb\nc')).toBeNull()
    expect(gridFromTsv('plain')).toBeNull()
    expect(gridFromTsv('a\nb')).toBeNull()
    expect(gridFromTsv('\tx\n')).toBeNull()
  })
})

describe('tsvFromGrid', () => {
  test('tabs and line breaks inside a cell become spaces', () => {
    expect(
      tsvFromGrid([
        ['a\tb', 'c\nd'],
        ['e', 'f'],
      ]),
    ).toBe('a b\tc d\ne\tf')
  })
})

describe('toCsv', () => {
  test('records are CRLF-separated, as the RFC says and spreadsheets expect', () => {
    expect(
      toCsv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a,b\r\nc,d')
  })

  test('a comma, a quote, a CR or an LF forces quoting; quotes double', () => {
    expect(toCsv([['a,b']])).toBe('"a,b"')
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""')
    expect(toCsv([['two\nlines']])).toBe('"two\nlines"')
    expect(toCsv([['carriage\rreturn']])).toBe('"carriage\rreturn"')
  })

  test('everything else is written bare', () => {
    expect(toCsv([['plain', '', "it's fine"]])).toBe("plain,,it's fine")
  })
})

describe('gridFromCsv', () => {
  test('CRLF, LF and CR end records; one trailing break adds none', () => {
    expect(gridFromCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(gridFromCsv('a\nb\rc')).toEqual([['a'], ['b'], ['c']])
  })

  test('quoted fields hold commas, doubled quotes and line breaks', () => {
    expect(gridFromCsv('"a,b","say ""hi""","two\r\nlines"\r\nx,y,z')).toEqual([
      ['a,b', 'say "hi"', 'two\r\nlines'],
      ['x', 'y', 'z'],
    ])
  })

  test('empty fields and ragged records are kept as written', () => {
    expect(gridFromCsv(',a,\n b ')).toEqual([['', 'a', ''], [' b ']])
    expect(gridFromCsv('""')).toEqual([['']])
  })

  test('a quote inside an unquoted field is literal', () => {
    expect(gridFromCsv('5" pipe,x')).toEqual([['5" pipe', 'x']])
  })

  test('malformed or empty text is null', () => {
    expect(gridFromCsv('')).toBeNull()
    expect(gridFromCsv('"open')).toBeNull()
    expect(gridFromCsv('"a"b,c')).toBeNull()
  })

  test('round-trips toCsv', () => {
    const rows = [
      ['h,1', 'h"2', ''],
      ['two\nlines', 'cr\rhere', 'plain'],
    ]
    expect(gridFromCsv(toCsv(rows))).toEqual(rows)
  })
})

describe('gridFromCsvPaste', () => {
  test('the toCsv output reads back as its grid', () => {
    const rows = [
      ['Name', 'Note'],
      ['a, b', 'say "hi"'],
      ['c', ''],
    ]
    expect(gridFromCsvPaste(toCsv(rows))).toEqual(rows)
  })

  test('bare line breaks, prose, one record, one column and ragged records stay text', () => {
    expect(gridFromCsvPaste('f(a,b)\ng(c,d)')).toBeNull()
    expect(gridFromCsvPaste('a,b\r\nc,d\ne,f')).toBeNull()
    expect(gridFromCsvPaste('Hello, world\r\nand more, words')).toBeNull()
    expect(gridFromCsvPaste('a,b')).toBeNull()
    expect(gridFromCsvPaste('a\r\nb')).toBeNull()
    expect(gridFromCsvPaste('a,b\r\nc')).toBeNull()
    expect(gridFromCsvPaste('"open,b\r\nc,d')).toBeNull()
  })
})

describe('htmlFromGrid', () => {
  test('cells carry their markdown; the header row is th; text is escaped', () => {
    expect(htmlFromGrid([['a<b'], ['"c"']], [['a\\<b'], ['"c"']], true)).toBe(
      `<table><tr><th ${CELL_SOURCE_ATTR}="a\\&lt;b">a&lt;b</th></tr>` +
        `<tr><td ${CELL_SOURCE_ATTR}="&quot;c&quot;">&quot;c&quot;</td></tr></table>`,
    )
  })

  test('a missing source falls back to the shown text', () => {
    expect(htmlFromGrid([['x']], [], false)).toBe(
      `<table><tr><td ${CELL_SOURCE_ATTR}="x">x</td></tr></table>`,
    )
  })
})

describe('pasteRect', () => {
  const grid = [
    ['a', 'b'],
    ['c', 'd'],
  ]

  test('lands at start with the grid size', () => {
    const { rect, value } = pasteRect(grid, { row: 1, col: 2 })
    expect(rect).toEqual({ top: 1, left: 2, bottom: 2, right: 3 })
    expect(value(2, 3)).toBe('d')
    expect(value(5, 5)).toBe('')
  })

  test('a one-cell grid fills the range', () => {
    const range = { top: 0, left: 0, bottom: 2, right: 2 }
    const { rect, value } = pasteRect([['x']], { row: 0, col: 0 }, range)
    expect(rect).toBe(range)
    expect(value(2, 1)).toBe('x')
  })
})
