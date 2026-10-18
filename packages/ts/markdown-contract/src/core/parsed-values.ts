/**
 * The values one `validate()` call parses out of a document: the frontmatter schema's output and
 * the output of each cell and list-item schema that transforms its text. They live in this
 * object, not on the parse tree, so two contracts that validate one tree never see each other's
 * values.
 */
import type { BlockNode } from './types.js'

/** The parsed values of one validation pass. */
export interface ParsedValues {
  /** The frontmatter schema's output. Absent when the contract declares no frontmatter schema. */
  frontmatter?: { data: unknown }
  /** The output of a table cell's schema, or `undefined` when none ran. */
  cell(table: BlockNode, row: number, col: string): unknown
  setCell(table: BlockNode, row: number, col: string, value: unknown): void
  /** The output of a list's `everyItem` schema for item `i`, or `undefined` when none ran. */
  item(list: BlockNode, i: number): unknown
  setItem(list: BlockNode, i: number, value: unknown): void
}

/** A fresh, empty set of parsed values. */
export function createParsedValues(): ParsedValues {
  const cells = new WeakMap<BlockNode, Map<number, Map<string, unknown>>>()
  const items = new WeakMap<BlockNode, Map<number, unknown>>()
  const values: ParsedValues = {
    cell(table, row, col) {
      return cells.get(table)?.get(row)?.get(col)
    },
    setCell(table, row, col, value) {
      let byRow = cells.get(table)
      if (byRow === undefined) cells.set(table, (byRow = new Map()))
      let byCol = byRow.get(row)
      if (byCol === undefined) byRow.set(row, (byCol = new Map()))
      byCol.set(col, value)
    },
    item(list, i) {
      return items.get(list)?.get(i)
    },
    setItem(list, i, value) {
      let byIndex = items.get(list)
      if (byIndex === undefined) items.set(list, (byIndex = new Map()))
      byIndex.set(i, value)
    },
  }
  return values
}
