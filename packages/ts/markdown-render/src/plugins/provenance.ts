/**
 * Telling the pipeline's own markup apart from a note's raw HTML.
 *
 * Notes may contain raw HTML, `rehype-raw` genuinely parses it, and from that
 * moment a forged element is indistinguishable from a produced one: `data-*`
 * carries no constraint the sanitizer can check, and hast `data` (which would
 * be unforgeable) does not survive `rehype-raw`'s stringify-and-reparse. Two
 * things in this dialect need the distinction:
 *
 * - `<markdown-embed>` and `<input>` are *commands*. An embed becomes a live
 *   component that fetches a note through `NoteSource.loadNote` and paints an
 *   `<img>` from a URL the element names; a checkbox becomes a control whose
 *   `data-line` tells the host which line of the file to rewrite. Both are
 *   built by the pipeline alone — from a resolved `![[…]]` and from GFM's
 *   `- [ ]` — so their fields have been derived from the document. A
 *   hand-written one has been derived from nothing: `<input type="checkbox"
 *   data-line="1">` dropped mid-prose flips a real task somewhere else in the
 *   note, and the schema's `required` rule would turn any other kind of input
 *   into a checkbox anyway.
 * - `id` is an *address*. The dialect deliberately leaves its own ids
 *   unprefixed so `#heading` and `#^block` links keep working, and that same
 *   decision left a note free to mint `id="app"`, shadow `getElementById`, or
 *   shadow a real heading's anchor and hijack in-note navigation. Every
 *   attribute the schema allows whose value *points at* an id moves with it
 *   ({@link ID_REFERENCE_PROPS}): namespacing the id alone either dangles a
 *   note's own reference or lets it borrow a pipeline anchor as its accessible
 *   name. The sanitize schema cannot draw this line either, since it would
 *   have to clobber the pipeline's own `aria-describedby="footnote-label"` too.
 * - A *routing signal* is a command too, one indirection further out. The Vue
 *   layer routes on tag, class and `data-lang` — all of which the schema
 *   allows, because they are what the pipeline's own markup is made of — so
 *   `<a class="wikilink" data-path="…">` reaches `WikilinkAnchor` and
 *   `<pre data-lang="mermaid">` reaches `MermaidBlock` with fields the note
 *   invented. The table lives in `../routing-signals.ts`, shared with the
 *   router so the two cannot drift.
 *
 * So provenance is established the way a CSP nonce establishes it. Before raw
 * HTML is parsed, {@link pipelineProvenance} stamps the elements that will
 * need vouching for — at that point necessarily its own — with a per-render
 * random token. After parsing, unvouched commands are dropped, unvouched
 * routing signals are stripped, and unvouched ids are pushed into the
 * `user-content-` namespace — or dropped, where the namespaced form is already
 * a pipeline id (a heading slugged `user-content-foo`); the token is then removed, so it never reaches
 * the DOM and never appears in a document a note author could read it out of.
 *
 * `name` needs no pass of its own: the pipeline never emits one, so the schema
 * can clobber every `name` it sees.
 */

import { visit } from 'unist-util-visit'

import { carriesRoutingSignal, stripRoutingSignals } from '../routing-signals.ts'

/** hast property holding the per-render token. Never serialized to output. */
const NONCE_PROP = 'dataMarkdownNonce'

/** Elements only the pipeline may produce. Anything else wearing one is a forgery. */
const PIPELINE_ONLY_TAGS = new Set(['markdown-embed', 'input'])

/**
 * Every id-reference attribute the schema allows, in hast's camelCase spelling.
 * All four ride `attributes['*']`, so they are allowed on every allowed tag —
 * `htmlFor` reaches no element today only because `label` and `output` are not
 * in `tagNames`, and `markdownSchema` is exported for hosts to widen. Each
 * holds one id or a space-separated list of them, and each is namespaced
 * alongside `id` on an element the pipeline did not vouch for.
 */
const ID_REFERENCE_PROPS = ['ariaDescribedBy', 'ariaLabelledBy', 'headers', 'htmlFor'] as const

/**
 * Namespace a note's own ids are moved into — the same one GitHub uses. A
 * namespaced id that would equal a pipeline id (a heading slugged
 * `user-content-foo`) is dropped by `enforce`.
 */
export const RAW_ID_PREFIX = 'user-content-'

/**
 * Namespace of the pipeline's own footnote ids (`remark-rehype`'s
 * `clobberPrefix`). It must differ from {@link RAW_ID_PREFIX}: with
 * remark-rehype's default, also `user-content-`, a note's `id="fn-1"` became
 * the very id the footnote reference jumps to. It holds an uppercase letter and
 * an underscore, so no heading slug (lowercase) or `^block-id` (no underscore)
 * can spell it either.
 */
export const FOOTNOTE_ID_PREFIX = 'markdownRender_'

interface HastElement {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastElement[]
}

/**
 * Prefix every id in an id-reference value, whatever shape hast holds it in.
 * An id whose prefixed form is in `taken` (a pipeline id) is dropped, so the
 * reference cannot name that anchor. `undefined` when every id was dropped:
 * the attribute then names nothing and is removed rather than left empty.
 */
function namespaceIds(value: unknown, taken: Set<string>): unknown {
  const ids = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/\s+/)
      : undefined
  if (ids === undefined) return value
  const present = ids.filter(Boolean)
  const prefixed = present.map((id) => RAW_ID_PREFIX + id).filter((id) => !taken.has(id))
  if (present.length > 0 && prefixed.length === 0) return undefined
  return Array.isArray(value) ? prefixed : prefixed.join(' ')
}

function newNonce(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * A matched pair of rehype plugins. `mark` goes in immediately before
 * `rehype-raw` and `enforce` immediately after — that gap is exactly the
 * window in which raw HTML becomes elements. Everything the pipeline wants
 * vouched for has to exist by the time `mark` runs, which is why
 * `rehypeCodeMeta` (it mints an `id` from a fence's block id) runs above it.
 */
export function pipelineProvenance(): {
  mark: () => (tree: HastElement) => void
  enforce: () => (tree: HastElement) => void
} {
  const nonce = newNonce()

  const needsVouching = (node: HastElement): boolean =>
    PIPELINE_ONLY_TAGS.has(node.tagName ?? '') ||
    node.properties?.id !== undefined ||
    ID_REFERENCE_PROPS.some((prop) => node.properties?.[prop] !== undefined) ||
    carriesRoutingSignal(node.properties)

  return {
    mark: () => (tree) => {
      visit(tree as never, 'element', (node: HastElement) => {
        if (!needsVouching(node)) return
        ;(node.properties ??= {})[NONCE_PROP] = nonce
      })
    },

    enforce: () => (tree) => {
      // The pipeline's own ids. A heading can slug into the namespace a note's
      // ids move into (`# user-content-foo`), so `id="foo"` would otherwise land
      // on that heading's anchor and capture its links.
      const pipelineIds = new Set<string>()
      visit(tree as never, 'element', (node: HastElement) => {
        const id = node.properties?.id
        if (node.properties?.[NONCE_PROP] === nonce && typeof id === 'string') pipelineIds.add(id)
      })
      visit(
        tree as never,
        'element',
        (
          node: HastElement,
          index: number | undefined,
          parent: { children: HastElement[] } | undefined,
        ) => {
          const properties = node.properties ?? {}
          const vouched = properties[NONCE_PROP] === nonce
          delete properties[NONCE_PROP]

          if (vouched) return

          if (PIPELINE_ONLY_TAGS.has(node.tagName ?? '')) {
            if (parent && index !== undefined) {
              parent.children.splice(index, 1)
              return index
            }
            return
          }
          // Left inert rather than dropped: the element keeps its tag, its text
          // and its non-routing attributes, it just cannot reach a component.
          stripRoutingSignals(properties)
          if (typeof properties.id === 'string' && properties.id) {
            const id = RAW_ID_PREFIX + properties.id
            if (pipelineIds.has(id)) delete properties.id
            else properties.id = id
          }
          for (const prop of ID_REFERENCE_PROPS) {
            const value = properties[prop]
            if (value === undefined) continue
            const namespaced = namespaceIds(value, pipelineIds)
            if (namespaced === undefined) delete properties[prop]
            else properties[prop] = namespaced
          }
        },
      )
    },
  }
}
