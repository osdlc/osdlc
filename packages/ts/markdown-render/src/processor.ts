/**
 * The pipeline.
 *
 * Binding constraint (D-7VMX): the dialect consumes remark's parse. Every
 * feature below is a remark or rehype plugin over the standard mdast/hast
 * pipeline — there is no bespoke Obsidian parser anywhere in this package, and
 * there must not be one.
 *
 * Order matters:
 *   1. `remark-parse` + `remark-gfm` (+ `remark-math`) produce mdast.
 *   2. Dialect plugins re-tokenize `text` nodes. Code fences and inline code
 *      never become `text` nodes, so they are immune for free.
 *   3. Escapes are masked and `%%comments%%` deleted before any of them, so
 *      escaped syntax never activates and commented-out content is never
 *      tokenized. Wikilinks then run before tags so a `[[Note#Heading]]`
 *      fragment is consumed before `#Heading` could look like a tag; embeds run
 *      before callouts so an embed inside a callout is already a node.
 *   4. Escapes are restored, then heading ids and `data-line` run last, over
 *      the final text.
 *   5. `remark-rehype` (allowing raw HTML) → `rehype-raw` → `rehype-sanitize`.
 *      Sanitization is downstream of raw-HTML reparsing, which is the only
 *      order that is safe. The provenance pair brackets `rehype-raw`, which is
 *      the only window in which the pipeline's own markup and the note's are
 *      still distinguishable — see `plugins/provenance.ts`.
 *   6. The consumer's `highlight` pass (e.g. `rehypeShiki` from the `/shiki`
 *      subpath) runs after sanitize, so its inline styles survive. Nothing here
 *      imports Shiki.
 */

import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified, type Processor } from 'unified'
import type { Root as HastRoot } from 'hast'
import type { Root as MdastRoot } from 'mdast'

import { markdownSchema } from './sanitize.ts'
import type { MarkdownRenderOptions } from './types.ts'
import { remarkBlockIds } from './plugins/block-ids.ts'
import { remarkCallouts } from './plugins/callouts.ts'
import { FOOTNOTE_ID_PREFIX, pipelineProvenance } from './plugins/provenance.ts'
import { remarkComments } from './plugins/comments.ts'
import { remarkDataLine } from './plugins/data-line.ts'
import { remarkEscapes, remarkUnescape } from './plugins/escapes.ts'
import { remarkEmbeds } from './plugins/embeds.ts'
import { remarkHeadingIds } from './plugins/heading-ids.ts'
import { remarkMarkdownImages } from './plugins/markdown-images.ts'
import { remarkMarkdownLinks } from './plugins/markdown-links.ts'
import { remarkMark } from './plugins/mark.ts'
import { remarkTags } from './plugins/tags.ts'
import { remarkWikilinks } from './plugins/wikilinks.ts'
import { rehypeCodeMeta } from './plugins/code-meta.ts'

/** Parses markdown into mdast and runs it out to hast. No compiler attached. */
export type MarkdownProcessor = Processor<MdastRoot, MdastRoot, HastRoot, undefined, undefined>

/**
 * Build the markdown → hast processor for one set of options.
 *
 * The returned processor has no compiler: use `.parse()` + `.run()` (or
 * {@link renderToHast}). {@link renderToHtml} builds its own stringifying
 * variant.
 */
export function createMarkdownProcessor(options: MarkdownRenderOptions = {}): MarkdownProcessor {
  // Each key is spread in only when supplied. Both are optional on the remark
  // plugins' option types, and under exactOptionalPropertyTypes an optional
  // property does not accept an explicit `undefined`. One object feeds four
  // `.use()` calls, so this is the only place it has to be right.
  const linkOptions = {
    ...(options.resolveLink !== undefined ? { resolveLink: options.resolveLink } : {}),
    ...(options.notePath !== undefined ? { notePath: options.notePath } : {}),
  }
  const provenance = pipelineProvenance()
  const highlight = options.highlight

  return (
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      // Conditional stages go in as (possibly empty) plugin lists so the chain —
      // and its mdast → hast type inference — stays unbroken.
      .use(options.math ? [remarkMath] : [])
      // Escaped syntax is masked at parse time and restored below, so no dialect
      // tokenizer can activate on it — see `plugins/escapes.ts`.
      .use(remarkEscapes)
      // Ahead of every tokenizer: content inside a `%%comment%%` must not become
      // nodes at all, or a commented-out `[[link]]` reaches the host's
      // `resolveLink` and a commented-out `![[embed]]` loads a note.
      //
      // On by default, because a vault note means it. Off for hosts rendering
      // text that is not a vault note, where a doubled percent is far more likely
      // to be printf or a format string than a comment marker.
      .use(options.comments === false ? [] : [remarkComments])
      .use(remarkWikilinks, linkOptions)
      // Before `remarkEmbeds`, not beside `remarkMarkdownLinks`: this turns an
      // `image` node into the same `embed` type, and `remarkEmbeds`'
      // second pass is what lifts a lone embed out of its paragraph. Running
      // after it would leave a markdown image wrapped in a `<p>` while the
      // `![[…]]` spelling of the same thing is block-level.
      .use(remarkMarkdownImages, linkOptions)
      .use(remarkEmbeds, linkOptions)
      .use(remarkMarkdownLinks, linkOptions)
      .use(remarkCallouts)
      .use(remarkTags, options.tagDialect !== undefined ? { tagDialect: options.tagDialect } : {})
      .use(remarkMark)
      .use(remarkBlockIds)
      // The last tokenizer has run: put the escaped characters back before
      // anything downstream — heading slugs included — reads the text.
      .use(remarkUnescape)
      .use(remarkHeadingIds)
      .use(remarkDataLine)
      // Footnote ids get a namespace of their own, apart from the one a note's
      // raw ids are pushed into — see `FOOTNOTE_ID_PREFIX`.
      .use(remarkRehype, { allowDangerousHtml: true, clobberPrefix: FOOTNOTE_ID_PREFIX })
      // Fence metadata is hoisted before the raw pass, not after, so the `id` it
      // mints from a fence's block id exists in time to be vouched for — and so
      // a note cannot mint one by writing `<pre><code data-block-id="app">`.
      .use(rehypeCodeMeta)
      // Stamp our own markup, parse the note's raw HTML, then drop every
      // `<markdown-embed>` and namespace every `id` that appeared in between —
      // see `plugins/provenance.ts`.
      .use(provenance.mark)
      .use(rehypeRaw)
      .use(provenance.enforce)
      .use(options.sanitize === false ? [] : [[rehypeSanitize, options.sanitize ?? markdownSchema]])
      // The attacher returns the consumer's transformer; unified runs it last.
      .use(highlight ? [() => highlight] : [])
  )
}

/** Markdown → hast. The tree the Vue layer walks into VNodes. */
export async function renderToHast(
  markdown: string,
  options: MarkdownRenderOptions = {},
): Promise<HastRoot> {
  const processor = createMarkdownProcessor(options)
  const mdast = processor.parse(markdown)
  return (await processor.run(mdast)) as unknown as HastRoot
}

/**
 * Markdown → HTML string. The SSR / Astro path: no Vue, no DOM.
 *
 * `<markdown-embed>` elements are emitted as-is — a custom element the host
 * page is expected to define (or leave inert). Sync twin: {@link renderToHtmlSync}.
 */
export async function renderToHtml(
  markdown: string,
  options: MarkdownRenderOptions = {},
): Promise<string> {
  const processor = createMarkdownProcessor(options).use(rehypeStringify, {
    allowDangerousHtml: false,
  })
  const file = await processor.process(markdown)
  return String(file)
}

/** Markdown → HTML string, synchronously. Throws when `options.highlight` is set: a highlight pass may be async; use `renderToHtml`. */
export function renderToHtmlSync(markdown: string, options: MarkdownRenderOptions = {}): string {
  if (options.highlight) {
    throw new Error('renderToHtmlSync: highlight is async; use renderToHtml')
  }
  const processor = createMarkdownProcessor(options).use(rehypeStringify, {
    allowDangerousHtml: false,
  })
  const file = processor.processSync(markdown)
  return String(file)
}
