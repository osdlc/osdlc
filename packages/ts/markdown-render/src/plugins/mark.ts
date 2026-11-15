/**
 * `==highlight==` → `<mark>`.
 *
 * Uses the shared paired-delimiter scanner so a highlight may span inline
 * markup (`==**bold** and plain==`), which a per-text-node regex could not do.
 */

import { visit } from 'unist-util-visit'
import { hastNode, isPhrasingParent, spliceDelimited, text, type MdNode } from './util.ts'

/** Remark plugin: wrap `==…==` runs in `<mark>`. */
export function remarkMark() {
  return (tree: MdNode) => {
    visit(tree as never, (node: MdNode) => {
      if (!isPhrasingParent(node)) return
      spliceDelimited(
        node,
        '==',
        // An empty run (`====`) is not a highlight; keep the author's text.
        (inner) => (inner.length ? [hastNode('mark', 'mark', {}, inner)] : [text('====')]),
        // Obsidian requires the run to start and end on a non-space. An empty
        // neighbour means the delimiter sits at a text-node boundary — the run
        // continues into a sibling node (`==**bold** tail==`), which is fine.
        (after) => !/\s/.test(after),
        (before) => !/\s/.test(before),
      )
    })
  }
}
