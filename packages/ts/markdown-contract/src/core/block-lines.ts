/**
 * The source lines of code blocks and of table rows. A caller that scans the raw lines of a
 * document uses them to skip code and to find table rows. Both return 1-based line numbers.
 *
 * `codeBlockLines` walks `tree.mdast`, not `SectionNode.blocks`, because a section's blocks do
 * not include code nested in lists or blockquotes. `tableRowLines` reads the table blocks of
 * every section. Their `pos` and `rowPos` give the row lines. The separator row is not a data
 * row, so it is left out.
 */
import type { DocTree, SectionNode } from './types.js'

/** The fields of an mdast node that `codeBlockLines` reads. */
interface MdLike {
  type: string
  position?: { start: { line: number }; end: { line: number } }
  children?: MdLike[]
}

/**
 * Every source line of a code block, from the opening fence to the closing fence. Code nested
 * in lists and blockquotes is included. A raw-line scan can use the set to ignore a `##` or `|`
 * line inside a code block.
 */
export function codeBlockLines(tree: DocTree): Set<number> {
  const lines = new Set<number>()
  const walk = (node: MdLike): void => {
    if (node.type === 'code') {
      const pos = node.position
      if (pos) for (let l = pos.start.line; l <= pos.end.line; l++) lines.add(l)
      return
    }
    if (node.children) for (const child of node.children) walk(child)
  }
  walk(tree.mdast as unknown as MdLike)
  return lines
}

/**
 * Every table row line: each table's header line (`table.pos.line`) and each data row line
 * (`table.rowPos(i).line`). It covers the blocks directly under `root` (the H1) and every
 * section below it. The separator row is left out.
 */
export function tableRowLines(root: SectionNode): Set<number> {
  const lines = new Set<number>()
  const walk = (nodes: SectionNode[]): void => {
    for (const s of nodes) {
      for (const b of s.blocks) {
        if (b.kind === 'table') {
          lines.add(b.pos.line)
          for (let i = 0; i < b.rows.length; i++) lines.add(b.rowPos(i).line)
        }
      }
      walk(s.sections)
    }
  }
  walk([root])
  return lines
}
