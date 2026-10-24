import { describe, expect, test } from 'vitest'

import { codeBlockLines, tableRowLines } from '../../src/core/block-lines.js'
import { parse } from '../../src/core/projection.js'

// block-lines.ts lists the source lines that fenced code and table rows occupy.
// Each case checks exact 1-based line numbers against a numbered document.

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
    // The nested code fence is found even though it is not a direct block of the section.
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

  test('a table under the H1, before the first section, counts', () => {
    const doc = [
      '# Title', // 1
      '', // 2
      '| A | B |', // 3  header
      '| - | - |', // 4  separator
      '| 1 | 2 |', // 5  data
      '', // 6
      '## S', // 7
      '', // 8
      '| C |', // 9  header
      '| - |', // 10  separator
      '| 3 |', // 11  data
    ].join('\n')
    expect([...tableRowLines(parse(doc).root)].sort((a, b) => a - b)).toEqual([3, 5, 9, 11])
  })
})
