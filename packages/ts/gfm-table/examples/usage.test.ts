/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 */

import { describe, expect, test } from 'bun:test'

import {
  CELL_SOURCE_ATTR,
  cellTextFromSource,
  clipboardLines,
  deleteCellSplice,
  DELIMITER_NAMES,
  DELIMITERS,
  endsWithEscape,
  EMPTY_ROW,
  escapeCell,
  escapeCellInsert,
  escapeCodeCell,
  gridFromCsv,
  gridFromCsvPaste,
  gridFromTsv,
  hasTrailingPipe,
  htmlFromGrid,
  insertCellSplice,
  isDelimiterRow,
  literalPipeFixes,
  looksLikeHeader,
  padRow,
  padRowSplice,
  padTable,
  parseAlign,
  parseDelimited,
  pasteRect,
  readDelimited,
  readTable,
  rectangular,
  renderTable,
  rowCellTexts,
  rowFromPipes,
  rowLineText,
  rowPipes,
  sniffDelimiter,
  sourceOffset,
  splitRow,
  tableGrid,
  tableLines,
  textOffset,
  toCsv,
  tsvFromGrid,
  type CellGrid,
  type CellRect,
  type CellText,
  type ColumnAlign,
  type DelimitedIssue,
  type DelimitedRead,
  type DelimitedRecord,
  type Delimiter,
  type LineSplice,
  type PadTableOptions,
  type PipeFix,
  type ReadDelimitedOptions,
  type RenderTableOptions,
  type RowPad,
  type TableCell,
  type TableCellSpan,
  type TableData,
  type TableGrid,
  type TableInput,
  type TableRowSpan,
} from '@osdlc/gfm-table'

/** Apply one line splice to its line. */
function applySplice(line: string, span: TableRowSpan, splice: LineSplice): string {
  if (!splice.change) return line
  const from = splice.change.from - span.from
  const to = (splice.change.to ?? splice.change.from) - span.from
  return line.slice(0, from) + (splice.change.insert ?? '') + line.slice(to)
}

describe('write a table from data', () => {
  test('renderTable escapes cells and pads short rows', () => {
    const input: TableInput = {
      header: ['Command', 'Meaning'],
      align: ['left', 'none'],
      rows: [['a | b', 'pipe'], ['solo']],
    }
    const options: RenderTableOptions = { lineBreak: '\n' }
    expect(renderTable(input, options)).toBe(
      ['| Command | Meaning |', '| :--- | --- |', '| a \\| b | pipe |', '| solo |  |'].join('\n'),
    )
  })

  test('escapeCell for one cell, escapeCodeCell for a cell in a code span', () => {
    expect(escapeCell(' two\nlines | here ')).toBe('two lines \\| here')
    expect(escapeCodeCell('a|b\\c')).toBe('a\\|b\\c')
  })

  test('padTable lines up the pipes of a table', () => {
    const table = ['| Name | Qty |', '|:--|--:|', '| 東京 | 3 |', '| a long note | 12 |']
    expect(padTable(table.join('\n')).split('\n')).toEqual([
      '| Name        |  Qty |',
      '| :---------- | ---: |',
      '| 東京        |    3 |',
      '| a long note |   12 |',
    ])
    // A cell over the cap does not widen its column.
    const options: PadTableOptions = { maxColumnWidth: 6 }
    expect(padTable(table.join('\n'), options).split('\n')).toEqual([
      '| Name |  Qty |',
      '| :--- | ---: |',
      '| 東京 |    3 |',
      '| a long note |   12 |',
    ])
  })

  test('rowLineText builds a row and says where each cell starts', () => {
    expect(rowLineText(['a', 'bc'])).toEqual({ text: '| a | bc |', offsets: [2, 6] })
  })
})

describe('read a table', () => {
  const lines = ['| Name | Qty |', '|:--|--:|', '| apple \\| pear | 3 |', '| fig |']

  test('readTable keeps the source and the text of each cell', () => {
    const table: TableData | null = readTable(lines)
    const first: TableCell | undefined = table?.rows[0]?.[0]
    const align: ColumnAlign[] | undefined = table?.align
    expect(first).toEqual({ raw: 'apple \\| pear', text: 'apple | pear' })
    expect(align).toEqual(['left', 'right'])
  })

  test('tableGrid fits rows to the header and reports ragged ones', () => {
    const grid: TableGrid | null = tableGrid(lines)
    expect(grid?.rows).toEqual([
      ['apple | pear', '3'],
      ['fig', ''],
    ])
    expect(grid?.issues).toEqual([{ line: 4, row: 1, message: '1 cells, header has 2; padded' }])
  })

  test('row helpers', () => {
    expect(rowCellTexts('| x | y |')).toEqual(['x', 'y'])
    expect(isDelimiterRow('| --- | :-: |')).toBe(true)
    expect(parseAlign(':-:')).toBe('center')
    expect(rowPipes('a|b\\|c|', 10)).toEqual([11, 16])
  })
})

describe('find cells by offset in a larger document', () => {
  const doc = 'intro\n| a | b |\n'
  const base = doc.indexOf('|')
  const line = doc.slice(base, doc.indexOf('\n', base))

  test('splitRow reports absolute offsets', () => {
    const row: TableRowSpan = splitRow(line, base)
    const cell: TableCellSpan = row.cells[1]!
    expect(doc.slice(cell.content.from, cell.content.to)).toBe('b')
  })

  test('rowFromPipes takes pipes found elsewhere', () => {
    const row = rowFromPipes(line, base, rowPipes(line, base))
    expect(row.cells.length).toBe(2)
    expect(EMPTY_ROW.cells).toEqual([])
  })
})

describe('edit a table in place', () => {
  const line = '| a | b |'

  test('insert and delete a column', () => {
    const span = splitRow(line)
    expect(applySplice(line, span, insertCellSplice(line, span, 1, ''))).toBe('| a |  | b |')
    expect(applySplice(line, span, deleteCellSplice(span, 0))).toBe('| b |')
    expect(hasTrailingPipe(span)).toBe(true)
  })

  test('pad a short row', () => {
    const span = splitRow(line)
    const pad: RowPad | null = padRowSplice(line, span, 3)
    expect(pad && line.slice(0, pad.from) + pad.insert + line.slice(pad.from)).toBe('| a | b |  |')
  })

  test('tableLines lists the lines in order with their filler', () => {
    const header = splitRow('| a |')
    const delimiter = splitRow('|---|')
    expect(tableLines({ rows: [header], delimiter }).map((l) => l.filler)).toEqual(['', '---'])
  })
})

describe('edit the text of one cell', () => {
  test('map between the shown text and the source', () => {
    const cell: CellText = cellTextFromSource('a\\|b')
    expect(cell.text).toBe('a|b')
    expect(sourceOffset(cell, 2)).toBe(3)
    expect(textOffset(cell, 2)).toBe(1)
  })

  test('typed text is escaped, and pipes stay literal', () => {
    expect(escapeCellInsert('x|y')).toBe('x\\|y')
    const fixes: PipeFix[] = literalPipeFixes('a\\|', [{ from: 2, to: 3 }])
    expect(fixes).toEqual([{ from: 2, to: 2, insert: '\\' }])
    expect(endsWithEscape('a\\')).toBe(true)
  })
})

describe('clipboard', () => {
  test('TSV and CSV round trips', () => {
    const grid: CellGrid = [
      ['a', 'b'],
      ['1', '2'],
    ]
    expect(gridFromTsv(tsvFromGrid(grid))).toEqual(grid)
    expect(gridFromCsv(toCsv(grid))).toEqual(grid)
    expect(gridFromCsvPaste(toCsv(grid))).toEqual(grid)
    expect(clipboardLines('a\nb\n')).toEqual(['a', 'b'])
  })

  test('HTML for a rich paste, with the markdown kept per cell', () => {
    const html = htmlFromGrid([['a|b']], [['a\\|b']], true)
    expect(html).toBe(`<table><tr><th ${CELL_SOURCE_ATTR}="a\\|b">a|b</th></tr></table>`)
  })

  test('where a paste lands', () => {
    const range: CellRect = { top: 0, left: 0, bottom: 1, right: 1 }
    const { rect, value } = pasteRect([['x']], { row: 0, col: 0 }, range)
    expect(rect).toEqual(range)
    expect(value(1, 1)).toBe('x')
    expect(rectangular([['a'], ['b', 'c']])).toEqual([
      ['a', ''],
      ['b', 'c'],
    ])
    expect(padRow(['a'], 2)).toEqual(['a', ''])
  })
})

describe('open a CSV-like file', () => {
  test('readDelimited sniffs, detects a header and reports problems', () => {
    const options: ReadDelimitedOptions = {}
    const file: DelimitedRead = readDelimited('name;qty\napple;3\npear\n', options)
    const delimiter: Delimiter = file.delimiter
    const issue: DelimitedIssue | undefined = file.issues[0]
    const row: DelimitedRecord | undefined = file.rows[1]
    expect(DELIMITER_NAMES[delimiter]).toBe('semicolon')
    expect(file.header).toEqual(['name', 'qty'])
    expect(issue).toEqual({ line: 3, message: '1 fields, header has 2' })
    expect(row?.fields).toEqual(['pear'])
  })

  test('the parts of the reader', () => {
    expect(DELIMITERS).toContain('\t')
    expect(sniffDelimiter('a\tb\nc\td\n')).toBe('\t')
    expect(looksLikeHeader(['id', 'name'])).toBe(true)
    expect(parseDelimited('a,"b,c"\n', ',').records[0]?.fields).toEqual(['a', 'b,c'])
  })
})
