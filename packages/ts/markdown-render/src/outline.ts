/**
 * Document outline, read off the rendered hast rather than the mdast — so the
 * ids in the outline are byte-for-byte the ids on the page, including whatever
 * the sanitizer did to them.
 */

import type { Element, Root } from 'hast'
import type { OutlineEntry } from './types.ts'

const HEADING = /^h([1-6])$/

/**
 * Collect `h1`–`h6` in document order. A screen-reader-only heading
 * (`.sr-only`, such as GFM's "Footnotes" label) is not on the visible page, so
 * it is not in the outline.
 */
export function extractOutline(tree: Root | Element): OutlineEntry[] {
  const entries: OutlineEntry[] = []
  walk(tree as Element, entries)
  return entries
}

function walk(node: Element | Root, entries: OutlineEntry[]): void {
  for (const child of (node.children ?? []) as Element[]) {
    if (child.type === 'element') {
      const match = HEADING.exec(child.tagName)
      if (match && !isScreenReaderOnly(child)) {
        entries.push({
          depth: Number(match[1]),
          text: headingText(child),
          id: String(child.properties?.id ?? ''),
        })
      }
      walk(child, entries)
    }
  }
}

/**
 * Flatten an element's text content.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export function hastText(node: { type?: string; value?: unknown; children?: unknown[] }): string {
  if (node.type === 'text') return String(node.value ?? '')
  const children = (node.children ?? []) as Array<Parameters<typeof hastText>[0]>
  return children.map(hastText).join('')
}

function isScreenReaderOnly(node: Element): boolean {
  const className = node.properties?.className
  return Array.isArray(className) && className.includes('sr-only')
}

/**
 * A heading's own text: {@link hastText} without GFM footnote references
 * (the `<a data-footnote-ref>` in its `<sup>`). The heading id is slugged from the
 * mdast, where a reference has no text, so this keeps the outline text the
 * text the id was slugged from.
 */
function headingText(node: Element): string {
  let text = ''
  for (const child of node.children) {
    if (child.type === 'text') text += child.value
    else if (child.type === 'element' && child.properties?.dataFootnoteRef === undefined) {
      text += headingText(child)
    }
  }
  return text
}
