/**
 * `![alt](assets/diagram.png)` — a markdown image that names a vault file.
 *
 * Obsidian writes these itself (the "Use Markdown links" setting, and what you
 * get pasting a path), and they mean exactly what `![[assets/diagram.png]]`
 * means. Left alone they become a plain `<img src="assets/diagram.png">`: a
 * URL the browser resolves against the SPA's own route — `/apps/notes/<vault>/
 * <folder>/` — rather than against the vault, so it fetches a Nuxt page and
 * paints a broken image. A reader cannot tell the two spellings apart, so
 * neither should the renderer.
 *
 * ## Why this emits `<markdown-embed>` rather than rewriting `src`
 *
 * It has to. `hast-util-sanitize`'s schema pins `protocols.src` to
 * `['http', 'https']`, and `markdownSchema` does not widen it — so an
 * `<img src="blob:…">` written by the pipeline loses its `src` outright. A
 * host's `assetUrl` hands back exactly a `blob:` URL, and the URL is not
 * knowable at parse time anyway.
 *
 * That is why `![[…]]` works: it becomes an inert custom element here,
 * and the real `<img>`/`<video>`/`<audio>` is built AFTER sanitization, in the
 * Vue layer, where `isSafeAssetUrl` admits `blob:`. This plugin joins that
 * path instead of inventing a second one, which also means one classification
 * (`embedKind`) decides the element for both spellings.
 *
 * Deliberately narrow, mirroring `splitMarkdownLink`: only a *relative* target
 * naming a file the dialect can embed is claimed. An absolute path is a host
 * route, a scheme-bearing URL is an external image the browser should fetch
 * itself, and an extensionless target is not an attachment reference.
 *
 * The reference spellings (`![alt][ref]` with `[ref]: assets/diagram.png`) are
 * claimed too, through their definition: one more way to write the same image.
 *
 * `![](Note.md)` is NOT claimed, and so still renders as a broken `<img>`. In
 * Obsidian it is a whole-note transclusion, the same as `![[Note]]`; claiming
 * it belongs with transclusion, not with attachment rendering.
 */

import { visit } from 'unist-util-visit'
import type { WikilinkResolver } from '../types.ts'
import { ATTACHMENT_EXTENSIONS, noteExtension } from '../paths.ts'
import { urlScheme } from '../url.ts'
import { defaultResolver } from './wikilinks.ts'
import { embedKind } from './embeds.ts'
import { clearLinkFields, definitionUrls, destination, safeDecode, type MdNode } from './util.ts'

export interface RemarkMarkdownImagesOptions {
  /** Injected resolver. Defaults to {@link defaultResolver}. */
  resolveLink?: WikilinkResolver
  /** Path of the note being rendered, forwarded to the resolver. */
  notePath?: string
}

/**
 * The vault target a markdown image names, or `null` when it names none.
 *
 * A trailing `#fragment` is dropped rather than forwarded: for media it is not
 * a heading or a block id (Obsidian uses it for `#page=3` on a PDF), so
 * emitting it as one would be a lie, and it must not reach the resolver —
 * `assets/paper.pdf#page=3` is not a path any vault holds.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export function splitMarkdownImage(url: string): string | null {
  if (!url || url.startsWith('#') || url.startsWith('/') || url.startsWith('//')) return null
  if (urlScheme(url) !== undefined) return null
  const hash = url.indexOf('#')
  const target = safeDecode(hash === -1 ? url : url.slice(0, hash))
  if (!target) return null
  // Extension required, and it has to be one the dialect actually embeds.
  // This is also what keeps `![](Some Note)` — which is not an attachment
  // reference at all — out of the rewrite.
  if (!ATTACHMENT_EXTENSIONS.includes(noteExtension(target))) return null
  return target
}

/** Remark plugin: rewrite relative attachment images into embed elements. */
export function remarkMarkdownImages(options: RemarkMarkdownImagesOptions = {}) {
  const resolve = options.resolveLink ?? defaultResolver

  return (tree: MdNode) => {
    const definitions = definitionUrls(tree)
    visit(tree as never, ['image', 'imageReference'], (node: MdNode) => {
      const url = destination(node, definitions)
      const target = url === undefined ? null : splitMarkdownImage(url)
      if (target === null) return

      const resolved = resolve(target, options.notePath)
      const props: Record<string, unknown> = {
        dataEmbedTarget: target,
        // No fragment reaches here, so this is never a heading or block embed.
        dataEmbedKind: embedKind(target, {}, resolved.kind),
        dataResolvedKind: resolved.kind,
      }
      if (resolved.kind !== 'missing' && resolved.path !== undefined) {
        props.dataEmbedPath = resolved.path
      }
      // A markdown image's `alt` is the caption an author wrote, which is the
      // same role `![[img.png|caption]]` gives its display text.
      const display = String(node.alt ?? '').trim()
      if (display) props.dataEmbedDisplay = display

      // `type` moves off `image`/`imageReference` so nothing downstream still treats this as
      // one, and so `remarkEmbeds`' paragraph-unwrap pass — which runs next and
      // looks for exactly this type — lifts a lone image out of its `<p>`, the
      // way it already does for `![[…]]`.
      node.type = 'wikiEmbed'
      node.data = { hName: 'markdown-embed', hProperties: props }
      node.children = []
      clearLinkFields(node)
      delete node.alt
    })
  }
}
