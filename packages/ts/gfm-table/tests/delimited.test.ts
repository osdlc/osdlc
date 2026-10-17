import { describe, expect, test } from 'bun:test'
import { looksLikeHeader, parseDelimited, readDelimited, sniffDelimiter } from '../src/index.ts'

const fields = (text: string, delim = ',') =>
  parseDelimited(text, delim).records.map((r) => r.fields)

describe('sniffDelimiter', () => {
  test('comma, semicolon, tab and pipe', () => {
    expect(sniffDelimiter('a,b,c\n1,2,3\n')).toBe(',')
    expect(sniffDelimiter('a;b;c\n1;2;3\n')).toBe(';')
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3\n')).toBe('\t')
    expect(sniffDelimiter('a|b|c\n1|2|3\n')).toBe('|')
  })

  test('the most consistent count wins over a stray delimiter', () => {
    expect(sniffDelimiter('name;note\nAda;hi, there\nBob;ok\nCy;fine\n')).toBe(';')
    expect(sniffDelimiter('a\tb\n1,5\t2\n3\t4\n')).toBe('\t')
  })

  test('ignores delimiters inside quotes', () => {
    expect(sniffDelimiter('a;b\n"1,2,3";x\n"4,5,6";y\n')).toBe(';')
  })

  test('ties go to comma; no delimiter reads as comma', () => {
    expect(sniffDelimiter('a,b;c\n')).toBe(',')
    expect(sniffDelimiter('just text\n')).toBe(',')
    expect(sniffDelimiter('')).toBe(',')
  })
})

describe('parseDelimited', () => {
  test('quoted fields keep delimiters, escaped quotes and line breaks', () => {
    const { records, issues } = parseDelimited('a,"b,c","say ""hi""","x\ny"\n1,2,3,4\n', ',')
    expect(records.map((r) => r.fields)).toEqual([
      ['a', 'b,c', 'say "hi"', 'x\ny'],
      ['1', '2', '3', '4'],
    ])
    expect(records.map((r) => r.line)).toEqual([1, 3])
    expect(issues).toEqual([])
  })

  test('CRLF, LF and CR line ends; blank lines add no record', () => {
    expect(fields('a,b\r\n1,2\r3,4\n\n5,6')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
    ])
  })

  test('drops a leading BOM', () => {
    expect(fields('﻿name,age\nAda,36\n')[0]).toEqual(['name', 'age'])
  })

  test('fields are not trimmed and empty fields are kept', () => {
    expect(fields(' a ,,c\n')).toEqual([[' a ', '', 'c']])
  })

  test('an unclosed quote reads as text up to the next delimiter and is reported', () => {
    const { records, issues } = parseDelimited('a,b\n"open,x\nc,d\n', ',')
    expect(records.map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['"open', 'x'],
      ['c', 'd'],
    ])
    expect(issues).toEqual([{ line: 2, message: 'Unclosed quote; read as text' }])
    expect(records[1]!.issue).toBe('Unclosed quote; read as text')
  })

  test('a quote closing on a later line, not before a delimiter, counts as unclosed', () => {
    const { records, issues } = parseDelimited('"abc,1\nd"e,2\n', ',')
    expect(records.map((r) => r.fields)).toEqual([
      ['"abc', '1'],
      ['d"e', '2'],
    ])
    expect(issues.map((i) => i.line)).toEqual([1])
  })

  test('text after a closing quote is kept and reported', () => {
    const { records, issues } = parseDelimited('"ab"cd,e\n', ',')
    expect(records[0]!.fields).toEqual(['abcd', 'e'])
    expect(issues).toEqual([{ line: 1, message: 'Text after a closing quote; kept as written' }])
  })

  test('a quote inside an unquoted field is literal', () => {
    expect(fields('5" pipe,x\n')).toEqual([['5" pipe', 'x']])
  })

  test('other delimiters', () => {
    expect(fields('a\t"b\tc"\n', '\t')).toEqual([['a', 'b\tc']])
    expect(fields('a|b\n', '|')).toEqual([['a', 'b']])
  })

  test('empty text has no records', () => {
    expect(parseDelimited('', ',')).toEqual({ records: [], issues: [] })
    expect(parseDelimited('﻿', ',')).toEqual({ records: [], issues: [] })
  })
})

describe('looksLikeHeader', () => {
  test('unique, non-empty, non-numeric cells', () => {
    expect(looksLikeHeader(['name', 'age'])).toBe(true)
    expect(looksLikeHeader(['name', ''])).toBe(false)
    expect(looksLikeHeader(['a', 'a'])).toBe(false)
    expect(looksLikeHeader(['name', '1,200'])).toBe(false)
    expect(looksLikeHeader(['2024', 'x'])).toBe(false)
    expect(looksLikeHeader(['-1.5e3', 'x'])).toBe(false)
    expect(looksLikeHeader(['.5', 'x'])).toBe(false)
    expect(looksLikeHeader([])).toBe(false)
    expect(looksLikeHeader(undefined)).toBe(false)
  })
})

describe('readDelimited', () => {
  test('an exponent-like header is a header, not a number', () => {
    expect(looksLikeHeader(['E1', 'E2'])).toBe(true)
    expect(readDelimited('E1,e5\n1,2\n').header).toEqual(['E1', 'e5'])
  })

  test('sniffs, splits off the header and reads rows', () => {
    const read = readDelimited('name;age\nAda;36\nBob;41\n')
    expect(read.delimiter).toBe(';')
    expect(read.header).toEqual(['name', 'age'])
    expect(read.rows.map((r) => r.fields)).toEqual([
      ['Ada', '36'],
      ['Bob', '41'],
    ])
    expect(read.rows.map((r) => r.line)).toEqual([2, 3])
    expect(read.width).toBe(2)
    expect(read.issues).toEqual([])
  })

  test('numeric first row is data', () => {
    const read = readDelimited('1,2\n3,4\n')
    expect(read.header).toBeNull()
    expect(read.rows).toHaveLength(2)
  })

  test('options override the sniff and the header guess', () => {
    const read = readDelimited('1;2\n3;4\n', { delimiter: ';', header: true })
    expect(read.header).toEqual(['1', '2'])
    expect(read.rows.map((r) => r.fields)).toEqual([['3', '4']])
    expect(readDelimited('a,b\nc,d\n', { header: false }).rows).toHaveLength(2)
  })

  test('ragged rows: short and long rows are kept and reported by line', () => {
    const read = readDelimited('a,b,c\n1,2\n1,2,3\n1,2,3,4,5\n')
    expect(read.rows.map((r) => r.fields.length)).toEqual([2, 3, 5])
    expect(read.width).toBe(5)
    expect(read.rows[0]!.issue).toBe('2 fields, header has 3')
    expect(read.rows[1]!.issue).toBeUndefined()
    expect(read.issues).toEqual([
      { line: 2, message: '2 fields, header has 3' },
      { line: 4, message: '5 fields, header has 3' },
    ])
  })

  test('without a header, rows are measured against the widest', () => {
    const read = readDelimited('1,2,3\n4,5\n')
    expect(read.issues).toEqual([{ line: 2, message: '2 fields, widest row has 3' }])
  })

  test('a parse problem is the row issue, not also a count problem', () => {
    const read = readDelimited('a,b\n"x"y\n')
    expect(read.issues).toEqual([
      { line: 2, message: 'Text after a closing quote; kept as written' },
    ])
    expect(read.rows[0]!.issue).toBe('Text after a closing quote; kept as written')
  })

  test('issues sort by line', () => {
    const read = readDelimited('a,b\n1\n"x"y,2\n3\n')
    expect(read.issues.map((i) => i.line)).toEqual([2, 3, 4])
  })

  test('BOM before a header', () => {
    expect(readDelimited('﻿id,name\n1,a\n').header).toEqual(['id', 'name'])
  })

  test('an empty file', () => {
    expect(readDelimited('')).toEqual({
      delimiter: ',',
      header: null,
      rows: [],
      width: 0,
      issues: [],
    })
  })

  test('a header only', () => {
    const read = readDelimited('name,age\n')
    expect(read.header).toEqual(['name', 'age'])
    expect(read.rows).toEqual([])
    expect(read.width).toBe(2)
  })

  test('300,000 rows read without overflowing the stack', () => {
    const lines = ['id,name,amount,note']
    for (let i = 0; i < 300_000; i++) lines.push(`${i},row ${i},${i * 1.5},"a, b"`)
    lines.push('300000,short')
    const read = readDelimited(lines.join('\n'))
    expect(read.rows).toHaveLength(300_001)
    expect(read.rows[299_999]!.fields).toEqual(['299999', 'row 299999', '449998.5', 'a, b'])
    expect(read.issues).toEqual([{ line: 300_002, message: '2 fields, header has 4' }])
  })
})
