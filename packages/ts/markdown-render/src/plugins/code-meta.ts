/**
 * Fence metadata normalization.
 *
 * `mdast-util-to-hast` attaches a code node's data to the inner `<code>`, but
 * the block a reader (and the source mapper, and the fence-override router)
 * sees is the `<pre>`. This pass lifts `data-line` onto the `<pre>` and stamps
 * `data-lang` there, so `lang:base` / `lang:mermaid` overrides can be routed
 * without re-reading class names.
 */

import { visit } from 'unist-util-visit'
import { fenceLang } from './fence-lang.ts'

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  [key: string]: unknown
}

/** Rehype plugin: hoist fence metadata from `<code>` to its `<pre>`. */
export function rehypeCodeMeta() {
  return (tree: HastNode) => {
    visit(tree as never, 'element', (node: HastNode) => {
      if (node.tagName !== 'pre') return
      const code = node.children?.find(
        (child) => child.type === 'element' && child.tagName === 'code',
      )
      if (!code) return
      node.properties ??= {}
      const line = code.properties?.dataLine
      if (line !== undefined && node.properties.dataLine === undefined) {
        node.properties.dataLine = line
        delete code.properties!.dataLine
      }
      const blockId = code.properties?.dataBlockId
      if (blockId !== undefined && node.properties.dataBlockId === undefined) {
        node.properties.dataBlockId = blockId
        node.properties.id ??= blockId
        delete code.properties!.dataBlockId
        delete code.properties!.id
      }
      const lang = fenceLang(code)
      if (lang) node.properties.dataLang = lang
    })
  }
}
