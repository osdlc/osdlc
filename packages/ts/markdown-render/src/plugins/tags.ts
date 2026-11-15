/**
 * Inline `#tags`, by the `@osdlc/markdown-tags` rule for the chosen dialect.
 *
 * The rule runs on each text node, and link text is skipped, so the tags
 * found can differ from a source scan: `**bold**#tag` is a tag here, because
 * `#tag` starts a text node. `tests/tag-conformance.test.ts` holds the default
 * dialect to the crate's case file, which marks those cases `rendererOnly`.
 */

import { DEFAULT_TAG_DIALECT, type TagDialect, tagAt } from '@osdlc/markdown-tags'
import { hastNode, text, visitTextOutside, type MdNode, type MdParent } from './util.ts'

export interface RemarkTagsOptions {
  /** Which tag rule to apply. Default `obsidian`. */
  tagDialect?: TagDialect
}

/**
 * Subtrees we never tag. A `#` anywhere inside link text is not a tag —
 * including nested in emphasis, which an immediate-parent check missed.
 */
const SKIP_SUBTREES = new Set([
  'link',
  'linkReference',
  'definition',
  'image',
  'imageReference',
  'wikilink',
  'tag',
])

/** Remark plugin: tokenize `#tags` into `<a class="tag" data-tag>` nodes. */
export function remarkTags(options: RemarkTagsOptions = {}) {
  const dialect = options.tagDialect ?? DEFAULT_TAG_DIALECT
  return (tree: MdNode) => {
    visitTextOutside(tree, SKIP_SUBTREES, (node: MdNode, i: number, parent: MdParent) => {
      if (typeof node.value !== 'string') return
      const value = node.value
      const replacement: MdNode[] = []
      let last = 0
      let at = value.indexOf('#')
      while (at !== -1) {
        const name = tagAt(value, at, dialect)
        if (name !== null) {
          if (at > last) replacement.push(text(value.slice(last, at)))
          replacement.push(
            hastNode('tag', 'a', { className: ['tag'], dataTag: name }, [text(`#${name}`)]),
          )
          last = at + 1 + name.length
        }
        at = value.indexOf('#', name === null ? at + 1 : last)
      }
      if (!replacement.length) return
      if (last < value.length) replacement.push(text(value.slice(last)))

      parent.children.splice(i, 1, ...replacement)
      return i + replacement.length
    })
  }
}
