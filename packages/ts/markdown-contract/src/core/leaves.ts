/**
 * Content leaves: `table`, `list`, `code` and `maxWords`. Each names the block kind a section
 * must hold, which the structure plane checks, and keeps its options on `config`, which the
 * content plane (`./content.ts`) reads to check the block's data.
 */
import type { z, ZodType } from 'zod'

import type { LeafSpec } from './types.js'

/**
 * The row type a table leaf reads back as. Each declared column is a key: a column with a cell
 * schema holds that schema's output type, and any other column holds the cell's text.
 */
export type RowOf<Cols extends string, C> = {
  [K in Cols]: K extends keyof C ? z.output<C[K]> : string
}

/**
 * A table leaf: the section must hold a table with these columns.
 *
 * With `cells`, each named column's text is checked by its Zod schema, and the typed model
 * reads the rows back as `RowOf<columns, cells>`: a schema that transforms its value gives the
 * transformed value. Without `cells`, rows read back as `Record<string, string>`.
 *
 * @param s.columns The columns the table must have.
 * @param s.anchor The table's `^anchor` id. In a `content` record the record key is the anchor:
 *   validation checks the block with that `^key`, and the typed model exposes it on the section
 *   under the key. Set `anchor` to the key, or leave it out.
 * @param s.minRows The fewest body rows.
 * @param s.extraColumns `"error"` reports columns not in `columns`; `"ignore"` (the default) allows them.
 * @param s.cells A Zod schema per column, for the cell text.
 */
export function table<const Cols extends string = string>(s: {
  columns: Cols[]
  anchor?: string
  minRows?: number
  extraColumns?: 'ignore' | 'error'
  cells?: undefined
}): LeafSpec<Record<string, string>>
export function table<
  const Cols extends string,
  C extends Partial<Record<Cols, z.core.$ZodType>>,
>(s: {
  columns: Cols[]
  anchor?: string
  minRows?: number
  extraColumns?: 'ignore' | 'error'
  cells: C
}): LeafSpec<RowOf<Cols, C>>
// A config built at run time, such as from YAML: the rows read back untyped.
export function table(s: {
  columns: string[]
  anchor?: string
  minRows?: number
  extraColumns?: 'ignore' | 'error'
  cells?: Record<string, ZodType>
}): LeafSpec
export function table(s: {
  columns: string[]
  anchor?: string
  minRows?: number
  cells?: Record<string, unknown> | undefined
  extraColumns?: 'ignore' | 'error'
}): LeafSpec {
  return { kind: 'table', config: s }
}

/**
 * A list leaf: the section must hold a list.
 *
 * With `everyItem` set to a Zod schema, each item's text is checked by it, and the typed model
 * reads the items back as the schema's output type. `everyItem: "checkbox"` requires every item
 * to be a task list item. Otherwise items read back as `ListItem`.
 *
 * @param s.ordered Kept on `config`; this version does not check it.
 * @param s.everyItem A Zod schema for each item's text, or `"checkbox"`.
 * @param s.minItems The fewest items.
 */
export function list<I extends z.core.$ZodType>(s: {
  ordered?: boolean
  everyItem: I
  minItems?: number
}): LeafSpec<unknown, z.output<I>>
export function list(s: { ordered?: boolean; everyItem?: 'checkbox'; minItems?: number }): LeafSpec
// A config built at run time, such as from YAML: the items read back untyped.
export function list(s: {
  ordered?: boolean
  everyItem?: 'checkbox' | ZodType
  minItems?: number
}): LeafSpec
export function list(s: {
  ordered?: boolean
  everyItem?: 'checkbox' | ZodType
  minItems?: number
}): LeafSpec {
  return { kind: 'list', config: s }
}

/**
 * A code leaf: the section must hold a fenced code block, in language `lang` when given.
 *
 * @param s.lang The language the fence's info string must name.
 */
export function code(s: { lang?: string }): LeafSpec {
  return { kind: 'code', config: s }
}

/**
 * A paragraph leaf: the section must hold a paragraph of at most `n` words.
 *
 * @param n The most words.
 */
export function maxWords(n: number): LeafSpec {
  return { kind: 'paragraph', config: { maxWords: n } }
}
