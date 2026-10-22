import { describe, expect, test } from 'vitest'
import {
  isDelimiterRow,
  readTable,
  rowCellTexts,
  parseAlign,
  rowFromPipes,
  rowPipes,
  splitRow,
  type TableRowSpan,
} from '../src/index.ts'

/** Each cell's trimmed content. */
function contents(line: string, row: TableRowSpan, base = 0): string[] {
  return row.cells.map((cell) => line.slice(cell.content.from - base, cell.content.to - base))
}

describe('splitRow', () => {
  test('a padded row', () => {
    const row = splitRow('| a | b |')
    expect(row.pipes).toEqual([0, 4, 8])
    expect(row.cells).toEqual([
      { from: 1, to: 4, content: { from: 2, to: 3 } },
      { from: 5, to: 8, content: { from: 6, to: 7 } },
    ])
  })

  test('offsets are absolute from base', () => {
    const row = splitRow('|x|', 10)
    expect(row).toMatchObject({ from: 10, to: 13, pipes: [10, 12] })
    expect(row.cells[0]).toEqual({ from: 11, to: 12, content: { from: 11, to: 12 } })
  })

  test('no leading or trailing pipe', () => {
    const line = 'a | b'
    expect(contents(line, splitRow(line))).toEqual(['a', 'b'])
  })

  test('an escaped pipe does not split', () => {
    const line = '| a \\| b | c |'
    expect(contents(line, splitRow(line))).toEqual(['a \\| b', 'c'])
  })

  test('an escaped backslash leaves the pipe a delimiter', () => {
    const line = '| x\\\\| y | z |'
    expect(contents(line, splitRow(line))).toEqual(['x\\\\', 'y', 'z'])
  })

  test('three backslashes escape the pipe', () => {
    const line = '| x\\\\\\| y |'
    expect(contents(line, splitRow(line))).toEqual(['x\\\\\\| y'])
  })

  test('a backslash escapes any character, not only a pipe', () => {
    // `\a` consumes the `a`, so the run resets before the pipe.
    const line = '| \\a| b |'
    expect(contents(line, splitRow(line))).toEqual(['\\a', 'b'])
  })

  test('pipes inside a code span still split, as in GFM', () => {
    const line = '| `a|b` |'
    expect(contents(line, splitRow(line))).toEqual(['`a', 'b`'])
  })

  test('an empty cell collapses to a point past its pad space', () => {
    expect(splitRow('|  | x |').cells[0]).toEqual({ from: 1, to: 3, content: { from: 2, to: 2 } })
    expect(splitRow('||x|').cells[0]).toEqual({ from: 1, to: 1, content: { from: 1, to: 1 } })
  })

  test('whitespace after the closing pipe is no cell; text is', () => {
    expect(splitRow('| a |  ').cells).toHaveLength(1)
    const line = '| a | b'
    expect(contents(line, splitRow(line))).toEqual(['a', 'b'])
  })

  test('a lone pipe has no cells', () => {
    expect(splitRow('|')).toEqual({ from: 0, to: 1, pipes: [0], cells: [] })
  })
})

describe('rowPipes', () => {
  test('finds unescaped pipes at base', () => {
    expect(rowPipes('a\\|b|c', 5)).toEqual([9])
  })
})

describe('rowFromPipes', () => {
  test('uses the pipes it is given', () => {
    const line = '| a | b |'
    const row = rowFromPipes(line, 3, [3, 11])
    expect(contents(line, row, 3)).toEqual(['a | b'])
  })
})

describe('parseAlign', () => {
  test('colons decide the alignment', () => {
    expect(parseAlign('---')).toBe('none')
    expect(parseAlign(':--')).toBe('left')
    expect(parseAlign('--:')).toBe('right')
    expect(parseAlign(':-:')).toBe('center')
    expect(parseAlign(':')).toBe('left')
  })
})

describe('isDelimiterRow', () => {
  test('dash cells with optional colons', () => {
    expect(isDelimiterRow('| --- | :-: |')).toBe(true)
    expect(isDelimiterRow('---|---:')).toBe(true)
    expect(isDelimiterRow('|-|')).toBe(true)
  })

  test('anything else is not', () => {
    expect(isDelimiterRow('---')).toBe(false)
    expect(isDelimiterRow('| a | --- |')).toBe(false)
    expect(isDelimiterRow('| - - |')).toBe(false)
    expect(isDelimiterRow('|')).toBe(false)
  })
})

describe('indented rows', () => {
  test('indent before the first pipe is not a cell', () => {
    const line = '  | a | b |'
    expect(contents(line, splitRow(line))).toEqual(['a', 'b'])
    expect(rowCellTexts(line)).toEqual(['a', 'b'])
  })

  test('offsets stay absolute from base', () => {
    const row = splitRow('  |x|', 10)
    expect(row.pipes).toEqual([12, 14])
    expect(row.cells).toEqual([{ from: 13, to: 14, content: { from: 13, to: 14 } }])
  })

  test('an indented delimiter row is one', () => {
    expect(isDelimiterRow('  | - | - |')).toBe(true)
    expect(isDelimiterRow('   |:---|---:|')).toBe(true)
  })

  test('four spaces or a tab are not indent before an opening pipe', () => {
    expect(isDelimiterRow('    |---|')).toBe(false)
    expect(isDelimiterRow('\t|---|')).toBe(false)
    expect(rowCellTexts('    | a |')).toEqual(['', 'a'])
    expect(readTable(['        | a |', '        |---|', '        | 1 |'])).toBeNull()
  })

  test('readTable reads indented lines', () => {
    expect(readTable(['  | a |', '  |---|', '  | 1 |'])?.rows[0]?.[0]?.text).toBe('1')
  })
})
