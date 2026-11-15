/**
 * github-slugger heading ids. Runs late in the pipeline: by then a heading's
 * text is the *rendered* text (a wikilink shows its label, a comment is gone).
 *
 * A heading that already carries an id — from a `^block-id` marker — keeps it.
 *
 * Every `^block-id` in the document is reserved before any heading is slugged,
 * on whatever block owns it. An author's block id is the target of `#^id`
 * links and cannot move, so a heading that would slug to the same string takes
 * the numbered suffix instead of duplicating the id. The one bare id
 * `remark-rehype` gives footnotes later, `footnote-label`, is reserved the same
 * way; the others carry `FOOTNOTE_ID_PREFIX`, which no slug can spell.
 *
 * A heading's anchor is therefore not a pure function of its text: a marker
 * *anywhere* in the note, including below the heading, can push it to
 * `foo-1`. Hosts resolving `[[Note#Heading]]` must read the id off the
 * rendered tree — `extractOutline` does — rather than re-slugging the heading
 * text or the `data-heading` value.
 */

import GithubSlugger from 'github-slugger'
import { visit } from 'unist-util-visit'
import { setHProps, type MdNode } from './util.ts'

/**
 * Reserve `footnote-label`, the heading `remark-rehype` emits over a note's
 * footnotes, so a heading that slugs to it takes the suffix: a heading reached
 * first by `getElementById` would capture every footnote's `aria-describedby`.
 * Only referenced footnotes are rendered, so only a reference reserves it. The
 * `fn-N`/`fnref-N` ids need no reservation: they carry `FOOTNOTE_ID_PREFIX`.
 */
function reserveFootnoteIds(tree: MdNode, slugger: GithubSlugger): void {
  let referenced = false
  visit(tree as never, 'footnoteReference', () => {
    referenced = true
  })
  if (referenced) slugger.slug('footnote-label')
}

/** Flatten a node's rendered text. */
export function nodeText(node: MdNode): string {
  if (typeof node.value === 'string' && node.type !== 'html') return node.value
  const children = node.children ?? []
  return children.map(nodeText).join('')
}

/** Remark plugin: assign slug ids to headings. */
export function remarkHeadingIds() {
  return (tree: MdNode) => {
    const slugger = new GithubSlugger()
    // Pass 1: reserve every id already on the tree — `remarkBlockIds` has run,
    // so these are the author's `^block-id` markers, on blocks of any type.
    visit(tree as never, (node: MdNode) => {
      const existing = node.data?.hProperties?.id
      if (typeof existing === 'string' && existing) slugger.slug(existing)
    })
    reserveFootnoteIds(tree, slugger)
    visit(tree as never, 'heading', (node: MdNode) => {
      const existing = node.data?.hProperties?.id
      if (typeof existing === 'string' && existing) return
      // Trim first: a stripped comment or trailing marker must not change the
      // slug a `#heading` link was written against.
      const text = nodeText(node).trim()
      // A heading with nothing to slug (`# !!!`) has no anchor; an empty `id`
      // would be a link target nothing can name. The shared slugger is not
      // consulted either, as it numbers empty slugs (`-1`).
      if (!new GithubSlugger().slug(text)) return
      setHProps(node, { id: slugger.slug(text) })
    })
  }
}
