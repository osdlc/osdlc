/**
 * `[label](Note.md)` — a markdown link that names a note.
 *
 * Obsidian writes these itself (it is the "Use Markdown links" setting, and
 * what you get pasting a path), and they mean exactly what `[[Note]]` means.
 * Left alone they came out as a plain `<a href="Projects/Alpha.md">`: a real
 * browser navigation that full-reloads the app, resolved by the server rather
 * than by the vault, and with no way to show that the target does not exist.
 *
 * The rewrite reuses `wikilinkProps`, so the anchor is the same shape a
 * `[[wikilink]]` produces and routes to the same component. The link's own
 * children survive — a markdown link's label can be rich (`[**Alpha**](…)`),
 * unlike a wikilink alias.
 *
 * The reference spellings (`[label][ref]` with `[ref]: Note.md`) are rewritten
 * too, through their definition: one more way to write the same link.
 *
 * Deliberately narrow. Only a *relative* target ending in `.md`/`.markdown` is
 * claimed: an absolute path is a host route rather than a vault path, a
 * scheme-bearing URL is an external link, and `[x](#heading)` is an in-note
 * anchor the browser already handles.
 */

import { visit } from 'unist-util-visit'
import type { WikilinkResolver } from '../types.ts'
import { urlScheme } from '../url.ts'
import { defaultResolver, splitFragment, wikilinkProps, withFragment } from './wikilinks.ts'
import { clearLinkFields, definitionUrls, destination, safeDecode, type MdNode } from './util.ts'

/** Extensions this dialect renders as a note. */
const MARKDOWN_EXT = /\.(md|markdown)$/i

export interface RemarkMarkdownLinksOptions {
  /** Injected resolver. Defaults to {@link defaultResolver}. */
  resolveLink?: WikilinkResolver
  /** Path of the note being rendered, forwarded to the resolver. */
  notePath?: string
}

/**
 * Split a link destination into the vault target and its `#fragment`, or
 * `null` when this is not a relative markdown link.
 */
export function splitMarkdownLink(url: string): { target: string; fragment: string } | null {
  if (!url || url.startsWith('#') || url.startsWith('/') || url.startsWith('//')) return null
  if (urlScheme(url) !== undefined) return null
  const hash = url.indexOf('#')
  const rawTarget = hash === -1 ? url : url.slice(0, hash)
  const fragment = hash === -1 ? '' : url.slice(hash + 1)
  if (!MARKDOWN_EXT.test(rawTarget)) return null
  return { target: safeDecode(rawTarget), fragment: safeDecode(fragment) }
}

/** Remark plugin: rewrite relative `.md` links into wikilink anchors. */
export function remarkMarkdownLinks(options: RemarkMarkdownLinksOptions = {}) {
  const resolve = options.resolveLink ?? defaultResolver

  return (tree: MdNode) => {
    const definitions = definitionUrls(tree)
    visit(tree as never, ['link', 'linkReference'], (node: MdNode) => {
      const url = destination(node, definitions)
      const split = url === undefined ? null : splitMarkdownLink(url)
      if (!split) return
      const fragment = splitFragment(split.fragment)
      const resolved = resolve(split.target, options.notePath)
      // `type` moves off `link`/`linkReference` so the tag tokenizer keeps skipping this
      // subtree — a `#` in link text is not a tag either way.
      node.type = 'wikilink'
      node.data = {
        hName: 'a',
        hProperties: wikilinkProps(split.target, withFragment(resolved, fragment)),
      }
      clearLinkFields(node)
    })
  }
}
