import { describe, expect, test } from 'vitest'

import { codeBlockLines, tableRowLines } from './block-lines.js'
import { parse } from './projection.js'

// block-lines.ts enumerates the source lines occupied by fenced code and by table rows.
// Each case pins exact 1-indexed line numbers against a counted document.

describe('codeBlockLines — every fenced-code source line', () => {
  test('covers the opening fence through the closing fence, inclusive', () => {
    const doc = [
      '## Code', // 1
      '', // 2
      '```txt', // 3
      'hello', // 4
      'world', // 5
      '```', // 6
      '', // 7
      'done', // 8
    ].join('\n')
    expect([...codeBlockLines(parse(doc))].sort((a, b) => a - b)).toEqual([3, 4, 5, 6])
  })

  test('includes a fence nested in a list item (which heading-direct blocks miss)', () => {
    const doc = [
      '## List', // 1
      '', // 2
      '- item one', // 3
      '', // 4
      '  ```', // 5
      '  nested code', // 6
      '  ```', // 7
    ].join('\n')
    const lines = codeBlockLines(parse(doc))
    // The nested code fence is captured even though it is not a heading-direct block.
    expect(lines.has(5)).toBe(true)
    expect(lines.has(6)).toBe(true)
    expect(lines.has(7)).toBe(true)
  })

  test('no fenced code → empty set', () => {
    expect(codeBlockLines(parse('## A\n\nplain prose\n')).size).toBe(0)
  })
})

describe('tableRowLines — header + data-row lines (separator excluded)', () => {
  test('collects the header line and each data-row line', () => {
    const doc = [
      '## Table', // 1
      '', // 2
      '| A | B |', // 3  header
      '| - | - |', // 4  separator (excluded)
      '| 1 | 2 |', // 5  data
      '| 3 | 4 |', // 6  data
    ].join('\n')
    expect([...tableRowLines(parse(doc).root)].sort((a, b) => a - b)).toEqual([3, 5, 6])
  })

  test('non-table blocks (prose) are skipped — only table rows contribute', () => {
    const doc = [
      '## Table', // 1
      '', // 2
      'Intro prose, not a table.', // 3  paragraph (skipped)
      '', // 4
      '| A | B |', // 5  header
      '| - | - |', // 6  separator
      '| 1 | 2 |', // 7  data
    ].join('\n')
    expect([...tableRowLines(parse(doc).root)].sort((a, b) => a - b)).toEqual([5, 7])
  })
})
