import { describe, expect, test } from 'vitest'

import { blocksOfKind } from '../../src/core/navigate.js'
import { parse } from '../../src/core/projection.js'
import { rawTableRow, rawTableRows } from '../../src/core/table-source.js'

// table-source.ts splits table cells again from the raw source, so markup in a cell is kept.
// Each case shows `parse()` flattening a cell while the raw split keeps it.

const DOC = [
  '## Operations', // 1
  '', // 2
  '| Name | CLI | Description |', // 3  header
  '| ---- | --- | ----------- |', // 4  separator
  '| create | `tool x new` | Make a thing |', // 5
  '| list | `tool x ls` | List things |', // 6
].join('\n')

function opsTable(doc: string) {
  const { root } = parse(doc)
  return blocksOfKind(root.sections[0]!, 'table')[0]!
}

describe('rawTableRows — verbatim header + rows from source', () => {
  test("preserves backticks the projection's columns/rows flatten away", () => {
    const table = opsTable(DOC)
    // `parse()` drops the backticks:
    expect(table.rows[0]).toEqual(['create', 'tool x new', 'Make a thing'])
    // The raw split keeps them:
    expect(rawTableRows(table, DOC)).toEqual({
      header: ['Name', 'CLI', 'Description'],
      rows: [
        ['create', '`tool x new`', 'Make a thing'],
        ['list', '`tool x ls`', 'List things'],
      ],
    })
  })

  test('accepts pre-split source lines too', () => {
    const table = opsTable(DOC)
    expect(rawTableRows(table, DOC.split('\n')).header).toEqual(['Name', 'CLI', 'Description'])
  })

  test('pad: "header" pads short rows to the header cell count', () => {
    const doc = [
      '## T', // 1
      '', // 2
      '| A | B | C |', // 3
      '| - | - | - |', // 4
      '| x | y |', // 5  short row (2 cells)
    ].join('\n')
    const table = opsTable(doc)
    expect(rawTableRows(table, doc, { pad: 'header' }).rows).toEqual([['x', 'y', '']])
  })

  test('pad: <number> pads short rows to that many cells', () => {
    const doc = [
      '## T', // 1
      '', // 2
      '| A | B | C |', // 3
      '| - | - | - |', // 4
      '| x |', // 5  one cell
    ].join('\n')
    const table = opsTable(doc)
    expect(rawTableRows(table, doc, { pad: 2 }).rows).toEqual([['x', '']])
  })

  test('a borderless table (no outer pipes) re-splits with nothing to drop', () => {
    const doc = [
      '## T', // 1
      '', // 2
      'Name | CLI', // 3  header, no outer pipes
      '---- | ---', // 4  separator
      'create | `x`', // 5  data, no outer pipes
    ].join('\n')
    const table = opsTable(doc)
    expect(rawTableRows(table, doc)).toEqual({
      header: ['Name', 'CLI'],
      rows: [['create', '`x`']],
    })
  })
})

describe('rawTableRow — the literal, unpadded cell array for one row', () => {
  test('returns exactly the cells the source line carries (for arity checks)', () => {
    const doc = [
      '## T', // 1
      '', // 2
      '| A | B | C |', // 3
      '| - | - | - |', // 4
      '| x | y |', // 5  only 2 cells
    ].join('\n')
    const table = opsTable(doc)
    // Unpadded — the caller sees the 2-vs-3 mismatch against the header.
    expect(rawTableRow(table, doc, 0)).toEqual(['x', 'y'])
  })

  test('an escaped pipe stays inside its cell, so the arity is not inflated', () => {
    const doc = [
      '## T', // 1
      '', // 2
      '| A | B |', // 3
      '| - | - |', // 4
      '| x \\| y | z |', // 5  two cells; the first holds `\|`
    ].join('\n')
    const table = opsTable(doc)
    expect(rawTableRow(table, doc, 0)).toEqual(['x \\| y', 'z'])
    expect(rawTableRows(table, doc).rows).toEqual([['x \\| y', 'z']])
  })
})
