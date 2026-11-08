/**
 * Reading a rendered table's data back out of its hast, and ordering its rows
 * for the reading-view sort.
 *
 * Everything here is pure and takes hast, never the DOM and never a component.
 * It is also all on-demand: nothing in this module runs until a reader clicks a
 * column header or the copy button.
 *
 * Cell text is every text node under the cell, so a wikilink contributes its
 * DISPLAY text and inline code its code text, and a `<br>` — the way a GFM
 * cell breaks a line — or a block child contributes the line break the reader
 * sees. That is the point: these are lenses over what the reader sees, and a
 * sort key that disagreed with the copied value would make two views of one
 * table.
 */

import type { HastNode } from './render.ts'

export type SortDirection = 'asc' | 'desc'

/** Elements that start on a line of their own inside a cell. */
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'tr',
  'hr',
])

function isBlock(node: HastNode): boolean {
  return node.type === 'element' && node.tagName !== undefined && BLOCK_TAGS.has(node.tagName)
}

/**
 * `render.ts`'s `nodeText`, with the line breaks the reader sees: a `<br>` is
 * one, and a block child (several `<p>` in a raw-HTML cell) sits on its own
 * line. Whitespace-only text between blocks draws nothing and adds nothing.
 */
function visibleText(node: HastNode): string {
  if (node.type === 'text') return String(node.value ?? '')
  if (node.type === 'element' && node.tagName === 'br') return '\n'
  let out = ''
  let afterBlock = false
  for (const child of node.children ?? []) {
    const text = visibleText(child)
    if (isBlock(child)) {
      out = out.replace(/\s+$/, '')
      if (out !== '') out += '\n'
      out += text
      afterBlock = true
      continue
    }
    if (afterBlock) {
      if (text.trim() === '') continue
      if (!out.endsWith('\n')) out += '\n'
      afterBlock = false
    }
    out += text
  }
  return out
}

/** A cell's comparable, copyable text. */
export function cellText(node: HastNode): string {
  return visibleText(node).trim()
}

/** A table's first `<thead>` or `<tbody>`. Either may be absent. */
export function tableSection(table: HastNode, tagName: 'thead' | 'tbody'): HastNode | undefined {
  return (table.children ?? []).find((child) => child.tagName === tagName)
}

/**
 * Every `<thead>`, `<tbody>` and `<tfoot>` of a table, in the order a table
 * draws them: headers on top and footers at the bottom whatever order the
 * markup wrote them in, each group in document order. Given `tagName`, only
 * the sections of that kind, in document order.
 */
export function tableSections(table: HastNode, tagName?: 'thead' | 'tbody' | 'tfoot'): HastNode[] {
  const children = table.children ?? []
  const kinds = tagName ? [tagName] : (['thead', 'tbody', 'tfoot'] as const)
  return kinds.flatMap((kind) => children.filter((child) => child.tagName === kind))
}

export function tableRows(section: HastNode): HastNode[] {
  return (section.children ?? []).filter((child) => child.tagName === 'tr')
}

export function rowCells(row: HastNode): HastNode[] {
  return (row.children ?? []).filter((child) => child.tagName === 'td' || child.tagName === 'th')
}

/**
 * Whether any cell spans rows or columns.
 *
 * A span breaks the assumption a column sort rests on — that the n-th header
 * names the n-th value of every body row — and there is no honest repair, so a
 * table carrying one is not offered a sort at all. `colspan="1"` is not a span;
 * it changes nothing and refusing on it would refuse on noise. `rowspan="0"`
 * IS one: it runs to the end of the row group. (`colspan="0"` reads as 1.)
 */
export function hasSpannedCells(table: HastNode): boolean {
  for (const section of ['thead', 'tbody'] as const) {
    const part = tableSection(table, section)
    if (!part) continue
    for (const row of tableRows(part)) {
      for (const cell of rowCells(row)) {
        const properties = cell.properties
        if (!properties) continue
        const rowSpan = properties.rowSpan
        const spansRows =
          rowSpan !== undefined &&
          rowSpan !== null &&
          rowSpan !== '' &&
          (Number(rowSpan) > 1 || Number(rowSpan) === 0)
        if (Number(properties.colSpan) > 1 || spansRows) return true
      }
    }
  }
  return false
}

/** One column's body text, row by row. A row too short for it reads empty. */
export function columnKeys(table: HastNode, column: number): string[] {
  const body = tableSection(table, 'tbody')
  if (!body) return []
  return tableRows(body).map((row) => {
    const cell = rowCells(row)[column]
    return cell ? cellText(cell) : ''
  })
}

/**
 * Optional sign, digits, optional decimal — and nothing else.
 *
 * Deliberately tight: a column of `$1,200` or `40%` is text with numbers in it,
 * and guessing at a currency or a locale's separators gets an order wrong in a
 * way a reader cannot see. Text comparison falls back to `numeric` collation,
 * which already reads `Item 2` before `Item 10`.
 */
const NUMBER = /^[+-]?\d+(\.\d+)?$/

/**
 * Two keys that both match {@link NUMBER}, compared exactly.
 *
 * On the digit strings rather than on `Number()`: past 2^53 (or about 17
 * significant digits) distinct keys parse to the same double, subtract to 0,
 * and a column of long IDs would never move; four hundred digits parse to
 * `Infinity`, and `Infinity - Infinity` is `NaN`, an order the engine picks.
 */
function compareNumbers(left: string, right: string): number {
  const parse = (key: string) => {
    const negative = key.startsWith('-')
    const [whole = '', fraction = ''] = key.replace(/^[+-]/, '').split('.')
    const digits = { whole: whole.replace(/^0+/, ''), fraction: fraction.replace(/0+$/, '') }
    const zero = digits.whole === '' && digits.fraction === ''
    return { sign: zero ? 0 : negative ? -1 : 1, ...digits }
  }
  const a = parse(left)
  const b = parse(right)
  if (a.sign !== b.sign) return a.sign - b.sign
  let magnitude = a.whole.length - b.whole.length
  if (magnitude === 0) magnitude = a.whole < b.whole ? -1 : a.whole > b.whole ? 1 : 0
  if (magnitude === 0) {
    const width = Math.max(a.fraction.length, b.fraction.length)
    const fa = a.fraction.padEnd(width, '0')
    const fb = b.fraction.padEnd(width, '0')
    magnitude = fa < fb ? -1 : fa > fb ? 1 : 0
  }
  return a.sign * magnitude
}

/**
 * A column's display order, as indices into the source row order.
 *
 * Two rules beyond the obvious one. Empty cells sort LAST in both directions —
 * an empty cell is absence, not a minimum, and sinking it in one direction only
 * to float it in the other buries the rows a reader was looking for. And the
 * sort is stable, so rows sharing a key keep the order the document put them
 * in; `Array.prototype.sort` has been stable since ES2019.
 */
export function sortRowOrder(keys: string[], direction: SortDirection): number[] {
  const filled = keys.filter((key) => key !== '')
  const numeric = filled.length > 0 && filled.every((key) => NUMBER.test(key))
  const sign = direction === 'asc' ? 1 : -1

  return keys
    .map((_, index) => index)
    .sort((a, b) => {
      const left = keys[a]
      const right = keys[b]
      if (!left || !right) return left === right ? 0 : left ? -1 : 1
      const order = numeric
        ? compareNumbers(left, right)
        : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
      return sign * order
    })
}
