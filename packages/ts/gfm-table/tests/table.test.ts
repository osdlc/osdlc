import { describe, expect, test } from 'vitest'
import { readTable, renderTable, rowCellSources, rowCellTexts, tableGrid } from '../src/index.ts'

describe('readTable', () => {
  test('header, alignment and body cells, raw and as text', () => {
    expect(readTable(['| a | b \\| c |', '| :-- | --: |', '| x |'])).toEqual({
      header: [
        { raw: 'a', text: 'a' },
        { raw: 'b \\| c', text: 'b | c' },
      ],
      align: ['left', 'right'],
      rows: [[{ raw: 'x', text: 'x' }]],
    })
  })

  test('not a table without a matching delimiter row', () => {
    expect(readTable(['| a |'])).toBeNull()
    expect(readTable(['| a |', '| b |'])).toBeNull()
    expect(readTable(['| a | b |', '| --- |'])).toBeNull()
  })
})

describe('readTable whitespace', () => {
  test('a cell is trimmed of tabs as well as spaces', () => {
    const table = readTable(['| a\t| \tb |', '| --- | --- |'])
    expect(table?.header.map((cell) => cell.raw)).toEqual(['a', 'b'])
  })
})

describe('renderTable', () => {
  test('escapes cells, writes alignment, pads short rows', () => {
    expect(
      renderTable({
        header: ['a|b', 'c'],
        align: ['center', 'none'],
        rows: [['x\ny'], ['1', '2']],
      }),
    ).toBe('| a\\|b | c |\n| :---: | --- |\n| x y |  |\n| 1 | 2 |')
  })

  test('an empty header renders nothing', () => {
    expect(renderTable({ header: [], rows: [] })).toBe('')
  })

  test('line break option', () => {
    expect(renderTable({ header: ['a'], rows: [] }, { lineBreak: '\r\n' })).toBe('| a |\r\n| --- |')
  })

  test('round trip: read(render(x)) gives back the cell texts and alignment', () => {
    const input = {
      header: ['Name', 'Pipe | here', 'Path\\\\|'],
      align: ['left', 'center', 'right'] as const,
      rows: [
        ['a', 'b', 'c\\'],
        ['', '`x|y`', '\\\\'],
      ],
    }
    const table = readTable(renderTable({ ...input, align: [...input.align] }).split('\n'))
    expect(table?.header.map((cell) => cell.text)).toEqual(input.header)
    expect(table?.align).toEqual([...input.align])
    expect(table?.rows.map((row) => row.map((cell) => cell.text))).toEqual(input.rows)
  })
})

describe('rowCellSources', () => {
  test('cell sources are trimmed, with escapes and inline markup as written', () => {
    expect(rowCellSources('| `a` \t| \tb \\| c |')).toEqual(['`a`', 'b \\| c'])
  })

  test('drops the outer pipes; empty cells stay', () => {
    expect(rowCellSources('| a | | c |')).toEqual(['a', '', 'c'])
    expect(rowCellSources('a | b')).toEqual(['a', 'b'])
  })
})

describe('rowCellTexts', () => {
  test('cell texts are trimmed of tabs and spaces, with pipe escapes read', () => {
    expect(rowCellTexts('| a\t| \tb \\| c |')).toEqual(['a', 'b | c'])
  })

  test('splits and trims, dropping the outer pipes; empty cells stay', () => {
    expect(rowCellTexts('| a | b | c |')).toEqual(['a', 'b', 'c'])
    expect(rowCellTexts('| a | | c |')).toEqual(['a', '', 'c'])
  })

  test('a backslash before a pipe is itself escaped: the pipe ends the cell', () => {
    expect(rowCellTexts('| x\\\\| y | z |')).toEqual(['x\\\\', 'y', 'z'])
  })

  test('a trailing escaped pipe is not the closing pipe', () => {
    expect(rowCellTexts('| a | b\\|')).toEqual(['a', 'b|'])
  })
})

describe('tableGrid', () => {
  test('header, alignment and body texts', () => {
    expect(
      tableGrid(['| Name | Qty | Done |', '| :--- | ---: | :---: |', '| a | 1 | x |']),
    ).toEqual({
      header: ['Name', 'Qty', 'Done'],
      align: ['left', 'right', 'center'],
      rows: [['a', '1', 'x']],
      issues: [],
    })
    expect(tableGrid(['a | b', '--- | ---'])?.align).toEqual(['none', 'none'])
  })

  test('escaped pipes read as pipes; other escapes stay', () => {
    const grid = tableGrid(['| a | b |', '| - | - |', '| x \\| y | `c` \\* |'])
    expect(grid?.rows).toEqual([['x | y', '`c` \\*']])
  })

  test('missing cells are padded and extra cells dropped, both reported', () => {
    const grid = tableGrid([
      '| a | b | c |',
      '|---|---|---|',
      '| 1 |',
      '| 1 | 2 | 3 | 4 |',
      '| 1 | 2 | 3 |',
    ])
    expect(grid?.rows).toEqual([
      ['1', '', ''],
      ['1', '2', '3'],
      ['1', '2', '3'],
    ])
    expect(grid?.issues).toEqual([
      { line: 3, row: 0, message: '1 cells, header has 3; padded' },
      { line: 4, row: 1, message: '4 cells, header has 3; extra cells dropped' },
    ])
  })

  test('wiki links and empty cells survive as text', () => {
    expect(tableGrid(['| a | b |', '|---|---|', '| [[Note\\|alias]] | |'])?.rows).toEqual([
      ['[[Note|alias]]', ''],
    ])
  })

  test('a header only has no rows', () => {
    expect(tableGrid(['| a |', '| - |'])).toEqual({
      header: ['a'],
      align: ['none'],
      rows: [],
      issues: [],
    })
  })

  test('null when the lines are not a table', () => {
    expect(tableGrid([])).toBeNull()
    expect(tableGrid(['| a |'])).toBeNull()
    expect(tableGrid(['| a | b |', '| - |'])).toBeNull()
    expect(tableGrid(['| a |', 'text'])).toBeNull()
  })
})
