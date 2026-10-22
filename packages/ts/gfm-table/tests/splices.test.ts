import { describe, expect, test } from 'vitest'
import {
  deleteCellSplice,
  hasTrailingPipe,
  insertCellSplice,
  type LineSplice,
  padRowSplice,
  rowLineText,
  splitRow,
  tableLines,
} from '../src/index.ts'

function apply(line: string, change: LineSplice['change']): string {
  if (!change) return line
  return line.slice(0, change.from) + (change.insert ?? '') + line.slice(change.to ?? change.from)
}

describe('rowLineText', () => {
  test('a padded row and its content offsets', () => {
    expect(rowLineText(['a', 'bc'])).toEqual({ text: '| a | bc |', offsets: [2, 6] })
    expect(rowLineText([''])).toEqual({ text: '|  |', offsets: [2] })
  })
})

describe('tableLines', () => {
  test('header, delimiter, then body rows', () => {
    const head = splitRow('| a |')
    const delim = splitRow('| --- |')
    const body = splitRow('| b |')
    expect(tableLines({ rows: [head, body], delimiter: delim })).toEqual([
      { span: head, filler: '' },
      { span: delim, filler: '---' },
      { span: body, filler: '' },
    ])
  })
})

describe('hasTrailingPipe', () => {
  test('closed, open and lone-pipe rows', () => {
    expect(hasTrailingPipe(splitRow('| a |'))).toBe(true)
    expect(hasTrailingPipe(splitRow('| a'))).toBe(false)
    expect(hasTrailingPipe(splitRow('|'))).toBe(true)
  })
})

describe('a new cell follows the row style', () => {
  const append = (line: string) =>
    apply(line, insertCellSplice(line, splitRow(line), splitRow(line).cells.length, 'x').change)

  test('padded next to a padded cell, bare next to a compact one', () => {
    expect(append('| a |')).toBe('| a | x |')
    expect(append('|a|')).toBe('|a|x|')
    expect(append('|')).toBe('| x |')
  })
})

describe('insertCellSplice', () => {
  const at = (line: string, col: number) =>
    apply(line, insertCellSplice(line, splitRow(line), col, '').change)

  test('before a cell, after its opening pipe', () => {
    expect(at('| a | b |', 1)).toBe('| a |  | b |')
    expect(at('| a | b |', 0)).toBe('|  | a | b |')
  })

  test('a row without an opening pipe gets one', () => {
    expect(at('a | b', 0)).toBe('|  |a | b')
  })

  test('past the last cell appends after the closing pipe', () => {
    expect(at('|a|b|', 2)).toBe('|a|b||')
  })

  test('an unclosed row cannot take a trailing cell', () => {
    const line = '| a | b'
    expect(insertCellSplice(line, splitRow(line), 2, '').change).toBeNull()
  })

  test('offsets are absolute', () => {
    const line = '| a |'
    expect(insertCellSplice(line, splitRow(line, 10), 0, '').change).toEqual({
      from: 11,
      insert: '  |',
    })
  })
})

describe('padRowSplice', () => {
  const pad = (line: string, width: number) => {
    const result = padRowSplice(line, splitRow(line), width)
    return result ? line.slice(0, result.from) + result.insert + line.slice(result.from) : null
  }

  test('pads a short row in its own style', () => {
    expect(pad('| a |', 3)).toBe('| a |  |  |')
    expect(pad('|a|', 2)).toBe('|a||')
  })

  test('an unclosed row gets a closing pipe first', () => {
    expect(pad('| a', 2)).toBe('| a |  |')
  })

  test('a wide enough row is left alone', () => {
    expect(pad('| a | b |', 2)).toBeNull()
  })

  test('content offsets of the new cells', () => {
    const line = '| a |'
    expect(padRowSplice(line, splitRow(line), 3)?.contents).toEqual([1, 4])
  })
})

describe('deleteCellSplice', () => {
  const del = (line: string, col: number) =>
    apply(line, deleteCellSplice(splitRow(line), col).change)

  test('takes the cell and the pipe after it', () => {
    expect(del('| a | b | c |', 1)).toBe('| a | c |')
  })

  test('an unclosed last cell takes the pipe before it', () => {
    expect(del('| a | b', 1)).toBe('| a ')
  })

  test('a missing cell leaves the row alone', () => {
    expect(deleteCellSplice(splitRow('| a |'), 3).change).toBeNull()
  })
})
