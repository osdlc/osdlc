/**
 * The sanitize schema.
 *
 * Notes may contain raw HTML (Obsidian allows it, and `rehype-raw` reparses
 * it), so sanitization is not optional on the untrusted path — it is the only
 * thing standing between a note and script execution. The schema extends
 * `rehype-sanitize`'s GitHub-derived default *minimally*: the dialect's own
 * classes and `data-*` attributes, task-list checkboxes, `id` on flow elements,
 * `<mark>`, and the `<markdown-embed>` custom element. Everything the default
 * strips — `<script>`, event handlers, `javascript:` URLs, `data:` iframes —
 * keeps being stripped, and `className` is widened by *pattern* rather than
 * opened wholesale (see {@link CLASS_ALLOW}).
 *
 * Note the pipeline order: sanitize runs *before* the Shiki pass, so Shiki's
 * inline `style` attributes never have to be allowed here.
 */

import { defaultSchema, type Options as Schema } from 'rehype-sanitize'
import { RAW_ID_PREFIX } from './plugins/provenance.ts'

/**
 * `data-*` properties the pipeline emits, in hast's camelCase spelling
 * (`dataBlockId` serializes as `data-block-id`). All are inert metadata, so
 * they are allowed globally rather than tag by tag.
 */
const DIALECT_DATA_ATTRS = [
  'dataLine',
  'dataBlockId',
  'dataWikilink',
  'dataKind',
  'dataPath',
  'dataHeading',
  'dataTag',
  'dataCallout',
  'dataFold',
  'dataLang',
]

/**
 * Class names a note's markup may keep.
 *
 * Every entry is either a class the pipeline itself emits or the namespace one
 * of them lives in — nothing else. The pipeline's whole set, measured by
 * rendering a document that exercises every feature: `callout`,
 * `callout-title`, `callout-content` (callouts); `wikilink`,
 * `wikilink-missing`, `wikilink-external` (links); `tag`; `contains-task-list`,
 * `task-list-item`, `footnotes`, `sr-only`, `data-footnote-backref` (GFM);
 * `math-inline`, `math-display` (remark-math); `language-<lang>` (any fence).
 * `markdown-*` is the Vue layer's own namespace, allowed so a host extending the
 * renderer does not have to fork the schema.
 *
 * A pattern list rather than a bare `className` allowance: classes are the
 * routing table (`math-inline` reaches KaTeX, `callout` reaches
 * `Callout`) and, over the host's own stylesheet, real layout control.
 * In a Tailwind app, `class="fixed inset-0 z-50 bg-white"` on a note-authored
 * `<div>` is a full-viewport overlay the reader cannot tell from the
 * application: UI spoofing, from a note. Values are filtered item by item, so a
 * forged `class="language-ts fixed inset-0"` keeps the fence class and loses
 * the rest.
 */
const CLASS_ALLOW: ReadonlyArray<string | RegExp> = [
  /^callout(-[a-z0-9-]+)?$/,
  /^wikilink(-[a-z0-9-]+)?$/,
  'tag',
  'contains-task-list',
  /^task-list-item(-[a-z0-9-]+)?$/,
  'footnotes',
  'sr-only',
  'data-footnote-backref',
  /^math-(inline|display)$/,
  /^language-\S+$/,
  /^markdown-[a-z0-9-]+$/,
]

/** The `className` definition every tag gets, in the schema's tuple form. */
const CLASS_DEFINITION = ['className', ...CLASS_ALLOW]

/** Attributes carried by the `<markdown-embed>` custom element. */
const EMBED_ATTRS: unknown[] = [
  CLASS_DEFINITION,
  'dataLine',
  'dataEmbedTarget',
  'dataEmbedKind',
  'dataEmbedPath',
  'dataEmbedHeading',
  'dataEmbedBlockId',
  'dataEmbedDisplay',
  'dataResolvedKind',
]

function extend(existing: readonly unknown[] | null | undefined, added: string[]): unknown[] {
  const list = existing ? [...existing] : []
  for (const item of added) if (!list.includes(item)) list.push(item)
  return list
}

function buildSchema(): Schema {
  const schema = structuredClone(defaultSchema) as Schema

  schema.tagNames = extend(schema.tagNames, ['mark', 'markdown-embed']) as string[]

  const attributes = (schema.attributes ??= {})

  // The default schema restricts `className` to fixed value lists on a handful
  // of tags (`a` may only carry `data-footnote-backref`, `code` only
  // `language-*`, …). A tag-specific definition short-circuits the `*` list for
  // an array-valued property — it does not union with it — so every one of
  // those tuples is replaced by the same allowlist the `*` entry below carries,
  // and the schema ends up with one rule for classes rather than eight.
  for (const [tag, list] of Object.entries(attributes)) {
    if (!Array.isArray(list)) continue
    attributes[tag] = list.map((entry) =>
      (Array.isArray(entry) ? entry[0] : entry) === 'className' ? CLASS_DEFINITION : entry,
    ) as never
  }

  // Every dialect element is class-driven, and the default schema only allows
  // `className` on a handful of tags.
  attributes['*'] = [
    ...extend(attributes['*'], ['id', ...DIALECT_DATA_ATTRS]).filter(
      (entry) => (Array.isArray(entry) ? entry[0] : entry) !== 'className',
    ),
    CLASS_DEFINITION,
  ] as never
  attributes['markdown-embed'] = EMBED_ATTRS as never

  // Heading and block ids are addressable anchors (`#heading`, `#^block`), so
  // the default schema's blanket `user-content-` prefix on `id` would break
  // every in-note link. It cannot simply be turned off, though: that would
  // hand a note `id="app"` and with it `getElementById` shadowing and the
  // ability to hijack a real heading's anchor. `plugins/provenance.ts` draws
  // the line the schema cannot see — the pipeline's heading and block ids stay
  // bare, a note's are namespaced into `RAW_ID_PREFIX`. The pipeline's footnote
  // ids are the one prefixed kind, in a namespace of their own
  // (`FOOTNOTE_ID_PREFIX`), so a note's ids cannot land on them either.
  //
  // The default's other two clobber entries, `ariaDescribedBy` and
  // `ariaLabelledBy`, point *at* an id and are dropped here for the same
  // reason: the pipeline emits `aria-describedby="footnote-label"` against its
  // own bare id, so a blanket prefix would dangle it. Provenance namespaces
  // them in step with `id`, on the note's elements only — along with the id
  // references the default does not clobber but this schema still allows
  // (`headers`, `htmlFor`); see `ID_REFERENCE_PROPS`.
  //
  // That leaves `name` for the schema. Nothing in the pipeline emits a `name`,
  // so every one it sees belongs to a note, and window named-property
  // clobbering is what it buys.
  schema.clobber = ['name']
  schema.clobberPrefix = RAW_ID_PREFIX

  // GFM emits disabled checkboxes; the Vue layer re-enables them for toggling,
  // so `disabled` is allowed through rather than required.
  schema.required = { ...schema.required, input: { type: 'checkbox' } }

  return schema
}

/**
 * Schema for the Obsidian dialect. Exported so hosts can extend it further
 * (`{...markdownSchema, tagNames: [...]}`) rather than disabling sanitization.
 */
export const markdownSchema: Schema = buildSchema()
