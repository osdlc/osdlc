/**
 * Obsidian callouts: a blockquote whose first line opens with `[!type]`.
 *
 *   > [!warning]- Collapsed by default
 *   > body
 *
 * The blockquote is rewritten in place (rather than replaced) so nested
 * callouts inside the content are still visited by the same pass.
 */

import { visit } from 'unist-util-visit'
import { loneEmbed } from './embeds.ts'
import { hastNode, type MdNode } from './util.ts'

/** `[!type]`, optional `-`/`+` fold marker, optional title on the same line. */
const CALLOUT_RE = /^\[!([\w-]+)\]([-+])?[ \t]*/

/** Fold state written to `data-fold`: `-` starts collapsed, `+` starts open. */
export type CalloutFold = '-' | '+'

export interface CalloutInfo {
  type: string
  fold?: CalloutFold
}

/**
 * Title shown when the author wrote none: the type, title-cased.
 *
 * The type is matched case-insensitively everywhere else — `data-callout` is
 * already lowercased, so `[!DANGER]` and `[!danger]` are the same callout —
 * and capitalizing only the first character left the rest shouting, so an
 * untitled `> [!DANGER]` printed "DANGER" where `> [!danger]` printed
 * "Danger". Same callout, same title.
 */
export function defaultTitle(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
}

/**
 * Split a paragraph's children at the first line end, so a callout title keeps
 * whatever inline markup the author put on that line (`> [!tip] **Do** this`)
 * instead of degrading to plain text. A hard break (`break` node, from two
 * trailing spaces or a `\`) ends the line too, and is dropped.
 */
function splitAtFirstNewline(children: MdNode[]): { head: MdNode[]; tail: MdNode[] } {
  const head: MdNode[] = []
  for (const [i, child] of children.entries()) {
    if (child.type === 'break') return { head, tail: children.slice(i + 1) }
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('\n')) {
      const at = child.value.indexOf('\n')
      const before = child.value.slice(0, at)
      const after = child.value.slice(at + 1)
      if (before) head.push({ type: 'text', value: before })
      const tail: MdNode[] = []
      if (after) tail.push({ type: 'text', value: after })
      tail.push(...children.slice(i + 1))
      return { head, tail }
    }
    head.push(child)
  }
  return { head, tail: [] }
}

function isBlank(nodes: MdNode[]): boolean {
  return nodes.every((node) => node.type === 'text' && !String(node.value ?? '').trim())
}

/** Remark plugin: rewrite `[!type]` blockquotes into callout nodes. */
export function remarkCallouts() {
  return (tree: MdNode) => {
    visit(tree as never, 'blockquote', (node: MdNode) => {
      const children = node.children
      if (!children?.length) return
      const first = children[0]
      if (!first || first.type !== 'paragraph' || !first.children?.length) return
      const marker = first.children[0]
      if (!marker || marker.type !== 'text' || typeof marker.value !== 'string') return

      const match = CALLOUT_RE.exec(marker.value)
      if (!match) return
      const [whole, type, fold] = match
      if (whole === undefined || type === undefined) return

      // Strip the marker, then peel the title line off the first paragraph.
      const firstChildren = [...first.children]
      firstChildren[0] = { type: 'text', value: marker.value.slice(whole.length) }
      const { head, tail } = splitAtFirstNewline(firstChildren)

      const titleChildren = isBlank(head) ? [{ type: 'text', value: defaultTitle(type) }] : head
      const contentChildren: MdNode[] = []
      if (tail.length && !isBlank(tail)) {
        // The body starts on the line after the title, so shift the paragraph's
        // position to keep `data-line` honest.
        const position = first.position
          ? {
              ...first.position,
              start: { ...first.position.start, line: first.position.start.line + 1, column: 1 },
            }
          : undefined
        const body: MdNode = {
          ...first,
          children: tail,
          ...(position !== undefined ? { position } : {}),
        }
        // `remarkEmbeds` lifts a lone embed out of its paragraph, but it ran
        // while the title and this line were still one paragraph.
        contentChildren.push(loneEmbed(body) ?? body)
      }
      contentChildren.push(...children.slice(1))

      const props: Record<string, unknown> = {
        className: ['callout'],
        dataCallout: type.toLowerCase(),
      }
      if (fold) props.dataFold = fold

      node.type = 'callout'
      node.data = { hName: 'div', hProperties: props }
      node.children = [
        hastNode('calloutTitle', 'div', { className: ['callout-title'] }, titleChildren),
        hastNode('calloutContent', 'div', { className: ['callout-content'] }, contentChildren),
      ]
    })
  }
}
