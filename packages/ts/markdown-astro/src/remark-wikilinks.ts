/**
 * Build-time `[[wikilink]]` resolution and `![[embed]]` rendering against
 * Astro content collections.
 *
 * Tokenization is delegated to `remarkWikilinks` and `remarkEmbeds` from
 * `@osdlc/markdown-render/plugins` — the Vue-free, Shiki-free plugin entry, so
 * an Astro build never pulls the render stack. This module keeps the
 * Astro-specific parts: the collection-backed resolver
 * ({@link buildRefIndex} / {@link resolveRef}), a `buildNode` emission seam
 * mapping each match onto this package's three output shapes (routed link,
 * relation span, missing span) and its dangling-ref policy, and the embed
 * lookups `remark-embeds.ts` renders with.
 */

import { join, resolve as resolvePath } from 'node:path'
import type { RemarkWikilinksOptions as TokenizerOptions } from '@osdlc/markdown-render/plugins'
import type { LinkResolution, MdNode, WikilinkResolver } from '@osdlc/markdown-render/plugins'
import {
  embedKind,
  isMediaKind,
  remarkWikilinks as tokenizeWikilinks,
} from '@osdlc/markdown-render/plugins'
import { assetManifestReader } from './assets.ts'
import type { DanglingRefPolicy } from './config.ts'
import { assetUrl } from './markdown.ts'
import { renderEmbeds, type EmbedLookups } from './remark-embeds.ts'
import { buildRefIndex, pathKey, resolveRef } from './wikilink-ref.ts'

export type { DanglingRefPolicy } from './config.ts'

export interface WikilinkCollection {
  name: string
  /** Absolute path to the collection's content directory. */
  dir: string
  /**
   * The collection's folder inside the vault (e.g. `Posts` or `00/posts`).
   * Used so vault-relative links like `[[00/posts/some-file]]` resolve even
   * though the file now lives at a different path under `src/content`.
   */
  vaultDir?: string
  /** Route template (`/posts/:slug`) or null if the collection has no route. */
  route: string | null
  /** Prefix for typed `[[type/slug]]` links that target this collection. */
  type?: string
}

export interface RemarkWikilinksOptions {
  /** Resolution order — first collection that owns the key wins. */
  collections: WikilinkCollection[]
  /** Class applied to every resolved relation span/link. Default `wikilink`. */
  className?: string
  /** Warn (once) about ambiguous bare names. Default true. */
  warnOnCollision?: boolean
  /**
   * What a dangling wikilink-ref does at build time. `error` (default)
   * hard-fails the build naming the offending link; `warn` degrades to a
   * `wikilink-missing` span (the legacy behaviour).
   */
  danglingRefPolicy?: DanglingRefPolicy
  /**
   * Where the transform recorded the media it copied, so a video, audio, PDF
   * or sized image embed gets the URL of its copy. Without it every such
   * embed renders as a missing attachment.
   */
  assets?: EmbedAssets
}

export interface EmbedAssets {
  /** Absolute path to the transform's asset manifest (`<astroRoot>/` + `ASSET_MANIFEST`). */
  manifest: string
  /** URL prefix the public asset dir is served under, e.g. `/_media`. */
  publicBase: string
}

/**
 * This package's rich resolution, riding through markdown-render's
 * {@link LinkResolution} seam as extra fields — the tokenizer passes the
 * resolver's answer to `buildNode` intact, so the builder reads them back.
 */
interface AstroResolution extends LinkResolution {
  /** Normalised pathKey id — the `data-wikilink` value. */
  id: string
  /** Owning collection name; empty when the target resolved to nothing. */
  collection: string
  /** Route href; null when the collection is route-less or the target missed. */
  href: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Remark plugin: resolve Obsidian `[[wikilinks]]` in the body against the Astro
 * content collections, at build time. A target may be a bare note name, a
 * content-relative path, or a vault-relative path — all resolve to the same
 * note.
 *
 *   - resolvable + collection has a route  -> real <a> hyperlink
 *   - resolvable but no route              -> <span class="wikilink"> (relation)
 *   - no note, but a published media file  -> <a> to its copy (`[[report.pdf]]`)
 *   - unresolvable                         -> <span class="wikilink wikilink-missing">
 *
 * A `#fragment` is dropped from both resolution and display. Frontmatter is
 * untouched — the file transform handles it.
 *
 * Embeds render first, the way markdown-render renders them (see
 * `remark-embeds.ts`), so a `[[link]]` inside an embedded note is resolved
 * by the pass below like any other. Only a sized image embed, or one in
 * content that skipped the file transform, reaches this pass; the transform
 * turns the rest into markdown images.
 */
export function remarkWikilinks(this: unknown, options: RemarkWikilinksOptions) {
  // unified calls an attacher with the processor as `this`. Its parser, with
  // the site's syntax extensions, is what transcluded text is parsed with.
  const processor = this as { parse?: (markdown: string) => unknown } | undefined
  const className = options.className ?? 'wikilink'
  const danglingRefPolicy: DanglingRefPolicy = options.danglingRefPolicy ?? 'error'
  const mediaPath = options.assets ? assetManifestReader(options.assets.manifest) : () => null
  const publicBase = (options.assets?.publicBase ?? '').replace(/\/+$/, '')
  /** A media target to the URL of its published copy, from the asset manifest. */
  const mediaUrl = (target: string): string | null => {
    // Astro's smartypants may have curled the quotes of the target as
    // written; the manifest holds it as written.
    const sub =
      mediaPath(target) ??
      mediaPath(target.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"'))
    return sub === null ? null : assetUrl(publicBase, sub)
  }
  const collisions: string[] = []
  const typeMap = new Map<string, string>()
  for (const c of options.collections) if (c.type) typeMap.set(c.type, c.name)
  const index = buildRefIndex(options.collections, typeMap, (msg) => collisions.push(msg))
  if ((options.warnOnCollision ?? true) && collisions.length) {
    console.warn(
      `[markdown-astro] ambiguous wikilink name(s) — bare links resolve to the first match; ` +
        `use a path link (e.g. [[Folder/Name]]) to disambiguate:\n  ` +
        collisions.join('\n  '),
    )
  }

  // Adapt the pure resolver to markdown-render's resolver seam. A target that
  // names no note but does name a published media file (`[[report.pdf]]`)
  // links its copy. A miss keeps the normalised key as the data-wikilink id
  // and an empty collection so the builder renders a `wikilink-missing` span.
  const resolveLink: WikilinkResolver = (target) => {
    const note = resolveRef(target, index)
    const url = note || !isMediaKind(embedKind(target, {}, 'missing')) ? null : mediaUrl(target)
    const id = pathKey(target)
    // `collection` is only read for being non-empty once `href` is set.
    const r =
      note ?? (url ? { id, collection: 'assets', href: url } : { id, collection: '', href: null })
    return {
      kind: url ? 'attachment' : r.collection ? 'note' : 'missing',
      ...(r.href ? { path: r.href } : {}),
      display: target,
      ...r,
    } satisfies AstroResolution
  }

  const buildNode: NonNullable<TokenizerOptions['buildNode']> = ({ target, label, resolution }) => {
    // markdown-render tokenizes `[[]]`, `[[#Heading]]` and `[[|alias]]` (empty
    // target = same-note link); returning null keeps them literal text.
    if (!target) return null
    const r = resolution as AstroResolution
    if (r.href) {
      return {
        type: 'link',
        url: r.href,
        data: { hProperties: { className: [className] } },
        children: [{ type: 'text', value: label }],
      }
    }
    if (!r.collection) {
      // Genuinely dangling: the target resolved to no collection at all.
      // (A route-less-but-resolved link keeps `r.collection`, so it is a
      // valid relation span — never a dangling ref.)
      if (danglingRefPolicy === 'error') {
        throw new Error(
          `[markdown-astro] dangling wikilink-ref: "${target}" resolves to no content. ` +
            `Set danglingRefPolicy: 'warn' to degrade instead of failing the build.`,
        )
      }
      console.warn(
        `[markdown-astro] dangling wikilink-ref: "${target}" resolves to no content; ` +
          `rendering a wikilink-missing span (danglingRefPolicy: 'warn').`,
      )
      return {
        type: 'html',
        value: `<span class="${escapeHtml(className)} ${escapeHtml(className)}-missing" data-wikilink="${escapeHtml(r.id)}">${escapeHtml(label)}</span>`,
      }
    }
    // Resolved but route-less: a valid relation span (not dangling).
    return {
      type: 'html',
      value: `<span class="${escapeHtml(className)}" data-wikilink="${escapeHtml(r.id)}" data-collection="${escapeHtml(r.collection)}">${escapeHtml(label)}</span>`,
    }
  }

  const dirs = new Map(options.collections.map((c) => [c.name, c.dir]))
  const lookups: EmbedLookups = {
    // `id` is the file's path stem today. Making it Astro's route id
    // must keep the file path for this lookup.
    notePath: (target) => {
      const r = resolveRef(target, index)
      const dir = r && dirs.get(r.collection)
      return dir ? join(dir, `${r.id}.md`) : null
    },
    mediaUrl,
    ...(typeof processor?.parse === 'function'
      ? { parse: (markdown: string) => processor.parse!(markdown) as MdNode }
      : {}),
  }

  const tokenize = tokenizeWikilinks({ resolveLink, buildNode })
  return (tree: Parameters<typeof tokenize>[0], file?: { path?: string; value?: unknown }) => {
    renderEmbeds(tree, file?.path ? resolvePath(file.path) : undefined, lookups, file)
    tokenize(tree, file)
  }
}
