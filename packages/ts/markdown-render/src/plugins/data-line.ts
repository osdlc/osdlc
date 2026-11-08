/**
 * Source mapping: every block-level element carries `data-line`, the 1-based
 * source line its mdast node started on. A host with an editor beside the preview maps
 * a click in the preview back to a line with it; without it, source mapping
 * would need a second parse.
 *
 * Nodes with no position info (anything a plugin synthesized) are skipped.
 */

import { visit } from 'unist-util-visit'
import { isBlockType, setHProps, type MdNode } from './util.ts'

/**
 * Remark plugin: stamp `data-line` on block nodes that know their position.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export function remarkDataLine() {
  return (tree: MdNode) => {
    visit(tree as never, (node: MdNode) => {
      if (!isBlockType(node.type) && node.type !== 'wikiEmbed') return
      const line = node.position?.start?.line
      if (typeof line !== 'number') return
      setHProps(node, { dataLine: line })
    })
  }
}
