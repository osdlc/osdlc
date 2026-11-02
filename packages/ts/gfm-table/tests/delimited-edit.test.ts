import { describe, expect, test } from 'vitest'
import {
  applyDelimitedChanges,
  deleteDelimitedColumn,
  deleteDelimitedRow,
  delimitedRecordText,
  insertDelimitedColumn,
  insertDelimitedRow,
  parseDelimited,
  quoteDelimitedField,
  readDelimited,
  setDelimitedField,
} from '../src/index.ts'

/** Set one body field and return the new text. */
const setField = (text: string, row: number, col: number, value: string) => {
  const read = readDelimited(text)
  return applyDelimitedChanges(text, setDelimitedField(read, read.rows[row]!, col, value))
}

describe('spans', () => {
  test('each field and record knows where it is', () => {
    const text = 'a,"b,c"\r\nx,y'
    const { records, lineEnding } = parseDelimited(text, ',')
    expect(lineEnding).toBe('\r\n')
    expect(records[0]).toMatchObject({ from: 0, to: 7, end: 9 })
    expect(records[0]!.spans).toEqual([
      { from: 0, to: 1, quoted: false },
      { from: 2, to: 7, quoted: true },
    ])
    expect(records[1]).toMatchObject({ from: 9, to: 12, end: 12 })
    for (const r of records)
      for (const s of r.spans) expect(text.slice(s.from, s.to)).not.toContain('\n')
  })

  test('a field with text after its closing quote is not quoted', () => {
    const { records } = parseDelimited('"a"b,c\n', ',')
    expect(records[0]!.spans[0]).toEqual({ from: 0, to: 4, quoted: false })
  })

  test('an unclosed quote spans the text read', () => {
    const { records } = parseDelimited('"a,b\n', ',')
    expect(records[0]!.spans[0]).toEqual({ from: 0, to: 2, quoted: false })
  })

  test('the reader reports line ending, BOM and the header record', () => {
    const read = readDelimited('﻿name\tqty\rapple\t3\r')
    expect(read.bom).toBe(true)
    expect(read.lineEnding).toBe('\r')
    expect(read.headerRecord?.fields).toEqual(['name', 'qty'])
    expect(read.headerRecord?.from).toBe(1)
    expect(readDelimited('1,2\n').headerRecord).toBeNull()
    expect(readDelimited('').lineEnding).toBe('\n')
  })

  test('a multi-line quoted field', () => {
    const text = 'a,b\n"x\ny",z\n'
    const read = readDelimited(text)
    const span = read.rows[0]!.spans[0]!
    expect(text.slice(span.from, span.to)).toBe('"x\ny"')
  })
})

describe('setDelimitedField', () => {
  test('changes only that field', () => {
    expect(setField('a,b\n1,2\n3,4\n', 1, 0, '9')).toBe('a,b\n1,2\n9,4\n')
  })

  test('keeps CRLF, BOM and the quoting of other fields', () => {
    const text = '﻿"a",b\r\n"1","2"\r\n'
    expect(setField(text, 0, 1, 'z')).toBe('﻿"a",b\r\n"1","z"\r\n')
  })

  test('quotes a value that needs it, and only then', () => {
    expect(setField('a,b\n1,2\n', 0, 0, 'x,y')).toBe('a,b\n"x,y",2\n')
    expect(setField('a,b\n1,2\n', 0, 0, 'say "hi"')).toBe('a,b\n"say ""hi""",2\n')
    expect(setField('a,b\n1,2\n', 0, 0, 'two\nlines')).toBe('a,b\n"two\nlines",2\n')
    expect(setField('a;b\n1;2\n', 0, 0, 'x,y')).toBe('a;b\nx,y;2\n')
    expect(setField('a\tb\n1\t2\n', 0, 1, 'x\ty')).toBe('a\tb\n1\t"x\ty"\n')
  })

  test('a quoted field stays quoted', () => {
    expect(setField('a,b\n"1",2\n', 0, 0, 'plain')).toBe('a,b\n"plain",2\n')
  })

  test('a multi-line field is replaced whole', () => {
    expect(setField('a,b\n"x\ny",z\n', 0, 0, 'one')).toBe('a,b\n"one",z\n')
  })

  test('fills out a short row up to the column', () => {
    expect(setField('a,b,c\n1\n', 0, 2, 'z')).toBe('a,b,c\n1,,z\n')
    expect(setField('a,b,c\n1\n', 0, 1, 'y')).toBe('a,b,c\n1,y\n')
  })

  test('edits the header', () => {
    const text = 'a,b\n1,2\n'
    const read = readDelimited(text)
    expect(applyDelimitedChanges(text, setDelimitedField(read, read.headerRecord!, 1, 'B'))).toBe(
      'a,B\n1,2\n',
    )
  })

  test('the result reads back to the new value', () => {
    const values = ['', ' padded ', 'a,b', '"', 'x\r\ny', 'ünï', 'tab\there']
    for (const v of values) {
      const out = setField('h1,h2\n1,2\n', 0, 1, v)
      expect(readDelimited(out, { header: true, delimiter: ',' }).rows[0]!.fields[1]).toBe(v)
    }
  })
})

describe('insertDelimitedRow', () => {
  test('before a row', () => {
    const text = 'a,b\r\n1,2\r\n'
    const read = readDelimited(text)
    expect(applyDelimitedChanges(text, insertDelimitedRow(read, 0, ['x', 'y,z']))).toBe(
      'a,b\r\nx,"y,z"\r\n1,2\r\n',
    )
  })

  test('appending keeps a trailing break, or its absence', () => {
    for (const [text, out] of [
      ['a,b\n1,2\n', 'a,b\n1,2\n3,4\n'],
      ['a,b\n1,2', 'a,b\n1,2\n3,4'],
      ['a,b\n', 'a,b\n3,4\n'],
      ['a,b', 'a,b\n3,4'],
    ] as const) {
      const read = readDelimited(text)
      expect(
        applyDelimitedChanges(text, insertDelimitedRow(read, read.rows.length, ['3', '4'])),
      ).toBe(out)
    }
  })

  test('into an empty file, after its BOM', () => {
    for (const text of ['', '﻿']) {
      const read = readDelimited(text)
      expect(applyDelimitedChanges(text, insertDelimitedRow(read, 0, ['x']))).toBe(`${text}x\n`)
    }
  })
})

describe('deleteDelimitedRow', () => {
  test('with its line break', () => {
    const text = 'a,b\n1,2\n3,4\n'
    const read = readDelimited(text)
    expect(applyDelimitedChanges(text, deleteDelimitedRow(read, 0)!)).toBe('a,b\n3,4\n')
    expect(applyDelimitedChanges(text, deleteDelimitedRow(read, 1)!)).toBe('a,b\n1,2\n')
  })

  test('the last line without a break takes the break before it', () => {
    const text = 'a,b\n1,2\n3,4'
    const read = readDelimited(text)
    expect(applyDelimitedChanges(text, deleteDelimitedRow(read, 1)!)).toBe('a,b\n1,2')
  })

  test('a multi-line row goes whole', () => {
    const text = 'a,b\n"x\ny",z\n1,2\n'
    const read = readDelimited(text)
    expect(applyDelimitedChanges(text, deleteDelimitedRow(read, 0)!)).toBe('a,b\n1,2\n')
  })

  test('the only row of a headerless file without a break', () => {
    const text = '1,2'
    const read = readDelimited(text)
    expect(applyDelimitedChanges(text, deleteDelimitedRow(read, 0)!)).toBe('')
  })

  test('a missing row is null', () => {
    expect(deleteDelimitedRow(readDelimited('a,b\n'), 0)).toBeNull()
  })
})

describe('insertDelimitedColumn', () => {
  test('at the start, middle and end', () => {
    const text = 'a,b\n1,2\n'
    const read = readDelimited(text)
    expect(applyDelimitedChanges(text, insertDelimitedColumn(read, 0, 'x'))).toBe('x,a,b\n,1,2\n')
    expect(applyDelimitedChanges(text, insertDelimitedColumn(read, 2, 'x'))).toBe('a,b,x\n1,2,\n')
  })

  test('quotes the header label when it needs it; leaves short rows alone', () => {
    const text = 'a,b,c\n1\n'
    const read = readDelimited(text)
    expect(applyDelimitedChanges(text, insertDelimitedColumn(read, 2, 'p,q'))).toBe(
      'a,b,"p,q",c\n1\n',
    )
  })
})

describe('deleteDelimitedColumn', () => {
  test('first, middle and last', () => {
    const text = 'a,b,c\n1,"2,5",3\n'
    const read = readDelimited(text)
    expect(applyDelimitedChanges(text, deleteDelimitedColumn(read, 0))).toBe('b,c\n"2,5",3\n')
    expect(applyDelimitedChanges(text, deleteDelimitedColumn(read, 1))).toBe('a,c\n1,3\n')
    expect(applyDelimitedChanges(text, deleteDelimitedColumn(read, 2))).toBe('a,b\n1,"2,5"\n')
  })

  test('the only column leaves empty records; short rows are skipped', () => {
    const text = 'a\n1\n'
    expect(
      applyDelimitedChanges(text, deleteDelimitedColumn(readDelimited(text, { header: true }), 0)),
    ).toBe('\n\n')
    const ragged = 'a,b\n1\n'
    expect(applyDelimitedChanges(ragged, deleteDelimitedColumn(readDelimited(ragged), 1))).toBe(
      'a\n1\n',
    )
  })
})

describe('helpers', () => {
  test('quoteDelimitedField', () => {
    expect(quoteDelimitedField('plain', ',')).toBe('plain')
    expect(quoteDelimitedField('plain', ',', true)).toBe('"plain"')
    expect(quoteDelimitedField('a\rb', ',')).toBe('"a\rb"')
  })

  test('delimitedRecordText', () => {
    expect(delimitedRecordText(['a', 'b\tc'], '\t')).toBe('a\t"b\tc"')
  })

  test('applyDelimitedChanges sorts and rejects overlaps', () => {
    expect(
      applyDelimitedChanges('abc', [
        { from: 2, to: 3, insert: 'Z' },
        { from: 0, to: 1, insert: 'X' },
      ]),
    ).toBe('XbZ')
    expect(() =>
      applyDelimitedChanges('abc', [
        { from: 0, to: 2, insert: '' },
        { from: 1, to: 3, insert: '' },
      ]),
    ).toThrow(RangeError)
  })
})
