import { describe, expect, test } from 'bun:test'
import { padTable, readTable } from '../src/index.ts'

const lines = (...rows: string[]) => rows.join('\n')

describe('padTable', () => {
  test('pads every cell to its column width, at least 3', () => {
    expect(padTable(lines('|a|bb|', '|-|-|', '|ccccc|d|'))).toBe(
      lines('| a     | bb  |', '| ----- | --- |', '| ccccc | d   |'),
    )
  })

  test('padding twice changes nothing', () => {
    const tables = [
      lines('| Name | Age |', '|:-|--:|', '| Alice | 30 |', '| 中文 | ✅ |'),
      lines('|a|b|', '|:-:|-|', '|x|'),
      lines('a | b', '- | -', 'long cell | z'),
    ]
    for (const table of tables) {
      const once = padTable(table)
      expect(padTable(once)).toBe(once)
      expect(padTable(once, { maxColumnWidth: 4 })).toBe(padTable(table, { maxColumnWidth: 4 }))
      const capped = padTable(table, { maxColumnWidth: 4 })
      expect(padTable(capped, { maxColumnWidth: 4 })).toBe(capped)
    }
  })

  test('keeps alignment colons and aligns each cell by its column', () => {
    expect(
      padTable(lines('| l | c | r | n |', '|:-|:-:|-:|-|', '| left | mid | right | none |')),
    ).toBe(
      lines(
        '| l    |   c   |     r | n    |',
        '| :--- | :---: | ----: | ---- |',
        '| left |  mid  | right | none |',
      ),
    )
  })

  test('a centered cell puts the odd space on the right', () => {
    expect(padTable(lines('| abcd |', '| :-: |', '| a |'))).toBe(
      lines('| abcd  |', '| :---: |', '|   a   |'),
    )
  })

  test('a column is wide enough for 3 dashes and its colons', () => {
    expect(padTable(lines('|a|b|', '|:-:|-:|'))).toBe(lines('|   a   |    b |', '| :---: | ---: |'))
  })

  test('East Asian wide characters and emoji count as 2 columns', () => {
    expect(padTable(lines('| 名前 | x |', '| - | - |', '| ab | 👍🏽 |', '| 東京都 | ☝️ |'))).toBe(
      lines('| 名前   | x   |', '| ------ | --- |', '| ab     | 👍🏽  |', '| 東京都 | ☝️  |'),
    )
  })

  test('combining marks take no column', () => {
    const ete = 'e\u0301te\u0301'
    expect(padTable(lines(`| ${ete} |`, '| - |', '| ab |'))).toBe(
      lines(`| ${ete} |`, '| --- |', '| ab  |'),
    )
  })

  test('an escaped pipe stays in its cell and counts as written', () => {
    const padded = padTable(lines('| a \\| b | c |', '| - | - |', '| x | y |'))
    expect(padded).toBe(lines('| a \\| b | c   |', '| ------ | --- |', '| x      | y   |'))
    expect(readTable(padded.split('\n'))?.header.map((cell) => cell.text)).toEqual(['a | b', 'c'])
  })

  test('a cell ending in a backslash keeps its closing pipe unescaped', () => {
    expect(padTable(lines('| a | b |', '| - | - |', '| x | y\\'))).toBe(
      lines('| a   | b   |', '| --- | --- |', '| x   | y\\  |'),
    )
  })

  test('cell text is kept as written, inline markup and escapes included', () => {
    const table = lines('| `a\\|b` | **c** |', '| - | - |', '| \\* | [l](u) |')
    const before = readTable(table.split('\n'))
    const after = readTable(padTable(table).split('\n'))
    expect(after).toEqual(before)
  })

  test('rows keep their own number of cells', () => {
    expect(padTable(lines('| a | b |', '| - | - |', '| x |', '| x | y | extra |'))).toBe(
      lines('| a   | b   |', '| --- | --- |', '| x   |', '| x   | y   | extra |'),
    )
  })

  test('outer pipes are added to rows without them', () => {
    expect(padTable(lines('a | b', '--|--', 'c | d'))).toBe(
      lines('| a   | b   |', '| --- | --- |', '| c   | d   |'),
    )
  })

  test('a 1-column table', () => {
    expect(padTable(lines('|x|', '|-|', '|long|'))).toBe(lines('| x    |', '| ---- |', '| long |'))
  })

  test('a table with no body rows', () => {
    expect(padTable(lines('| a | b |', '|:-|-|'))).toBe(lines('| a    | b   |', '| :--- | --- |'))
  })

  test('empty cells are padded with spaces', () => {
    expect(padTable(lines('| a | |', '| - | - |', '| | b |'))).toBe(
      lines('| a   |     |', '| --- | --- |', '|     | b   |'),
    )
  })

  test("every row takes the 0-3 spaces before the header's opening pipe", () => {
    expect(padTable(lines('  | a |', '  | - |', '   | bcde |', 'f | g'))).toBe(
      lines('  | a    |', '  | ---- |', '  | bcde |', '  | f    | g   |'),
    )
  })

  test('keeps each line break, and a final one', () => {
    expect(padTable('| a |\r\n| - |\r\n| b |\r\n')).toBe('| a   |\r\n| --- |\r\n| b   |\r\n')
    expect(padTable('| a |\n| - |\r\n| b |')).toBe('| a   |\n| --- |\r\n| b   |')
  })

  test('a blank line ends the table; the lines after it are kept', () => {
    const after = '\n\nnot | a | row\n|x|'
    expect(padTable(lines('|a|', '|-|', '|b|') + after)).toBe(
      lines('| a   |', '| --- |', '| b   |') + after,
    )
  })

  test('text that is not a table is returned unchanged', () => {
    for (const text of [
      '',
      '\n',
      'plain text',
      '| a |',
      lines('| a | b |', '| - |'),
      lines('|a|', '|b|'),
    ]) {
      expect(padTable(text)).toBe(text)
    }
  })

  test('a table with a zero-width joiner, space or word joiner is left as is', () => {
    for (const ch of ['\u200d', '\u200b', '\u200c', '\u2060']) {
      const table = lines('| a |', '|-|', `| 👩${ch}💻 |`)
      expect(padTable(table)).toBe(table)
    }
  })
})

describe('padTable maxColumnWidth', () => {
  test('must be a positive integer', () => {
    const table = lines('| a |', '| - |')
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => padTable(table, { maxColumnWidth: bad })).toThrow(RangeError)
    }
    expect(padTable(table, { maxColumnWidth: 1 })).toBe(lines('| a   |', '| --- |'))
  })

  test('a cell over the cap keeps one space per side and does not widen its column', () => {
    const table = lines(
      '| Name | Note |',
      '|-|-|',
      '| a | short |',
      '| b | a note far longer than the cap |',
    )
    expect(padTable(table, { maxColumnWidth: 10 })).toBe(
      lines(
        '| Name | Note  |',
        '| ---- | ----- |',
        '| a    | short |',
        '| b    | a note far longer than the cap |',
      ),
    )
  })

  test('a cell at the cap still sets its column width', () => {
    expect(padTable(lines('| a |', '| - |', '| 12345 |'), { maxColumnWidth: 5 })).toBe(
      lines('| a     |', '| ----- |', '| 12345 |'),
    )
  })

  test('the cap counts display width', () => {
    expect(padTable(lines('| a |', '| - |', '| 東京 |'), { maxColumnWidth: 3 })).toBe(
      lines('| a   |', '| --- |', '| 東京 |'),
    )
  })

  test('a column of over-cap cells takes the minimum width', () => {
    expect(padTable(lines('| header |', '| :-: |', '| body |'), { maxColumnWidth: 2 })).toBe(
      lines('| header |', '| :---: |', '| body  |'),
    )
  })

  test('no cap by default', () => {
    const wide = 'x'.repeat(200)
    expect(padTable(lines('| a |', '| - |', `| ${wide} |`))).toBe(
      lines(`| a${' '.repeat(199)} |`, `| ${'-'.repeat(200)} |`, `| ${wide} |`),
    )
  })
})
