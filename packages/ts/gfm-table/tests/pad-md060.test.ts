/**
 * padTable against rumdl's MD060 rule ("table-format") in its "aligned"
 * style. fixtures/md060/expected.md is fixtures/md060/input.md formatted by
 * rumdl 0.3.0 with the config beside them:
 *
 *     cp input.md expected.md && rumdl fmt --config rumdl.toml expected.md
 *
 * The format comes from rumdl 0.3.0, src/rules/md060_table_format.rs:
 * `calculate_column_widths` takes each column's widest cell by display width
 * (the unicode-width crate, 0.2.2), at least 3 and at least 3 plus the
 * column's colons; `format_table_row` pads left and unaligned cells on the
 * right, right-aligned ones on the left, centered ones on both sides with
 * the odd space on the right, and writes the delimiter row as dashes the
 * column's width, colons kept. See also docs/md060.md in the same release.
 *
 * Inputs MD060 and padTable read differently are left out of the corpus and
 * tested on their own below: an unescaped pipe in a code span, `\\|`, a
 * table already aligned with extra padding, and 1-3 spaces before the
 * opening pipe.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { padTable } from '../src/index.ts'

const FIXTURES = join(import.meta.dir, 'fixtures', 'md060')

/** The fixture's tables: its blank-line separated blocks after the heading. */
function tables(name: string): string[] {
  return readFileSync(join(FIXTURES, name), 'utf-8').trimEnd().split('\n\n').slice(1)
}

const INPUT = tables('input.md')
const EXPECTED = tables('expected.md')

describe('padTable matches rumdl MD060 aligned', () => {
  test('the corpus has one expected table per input table', () => {
    expect(INPUT.length).toBeGreaterThan(10)
    expect(EXPECTED.length).toBe(INPUT.length)
  })

  for (const [i, input] of INPUT.entries()) {
    test(`table ${i + 1}: ${input.split('\n')[0]}`, () => {
      expect(padTable(input)).toBe(EXPECTED[i]!)
      // MD060's output is padTable's fixed point too.
      expect(padTable(EXPECTED[i]!)).toBe(EXPECTED[i]!)
    })
  }
})

describe('where padTable and MD060 differ', () => {
  test('an aligned table with extra padding is narrowed; MD060 keeps it', () => {
    expect(padTable('| a     |\n| ----- |\n| b     |')).toBe('| a   |\n| --- |\n| b   |')
  })

  test('the spaces before the opening pipe are kept; MD060 drops them', () => {
    expect(padTable('  | a |\n  |-|')).toBe('  | a   |\n  | --- |')
  })

  test('a pipe after two backslashes ends the cell; MD060 keeps it in the cell', () => {
    expect(padTable('| a | b |\n| - | - |\n| x\\\\|y |')).toBe(
      '| a   | b   |\n| --- | --- |\n| x\\\\ | y   |',
    )
  })

  test('an unescaped pipe in a code span ends the cell; MD060 leaves the table as is', () => {
    expect(padTable('| `a|b` |\n| - | - |')).toBe('| `a  | b`  |\n| --- | --- |')
  })
})
