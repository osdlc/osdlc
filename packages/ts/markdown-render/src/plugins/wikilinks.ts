/**
 * `[[wikilink]]` tokenizer.
 *
 * The tokenization strategy: regex over `text` nodes, splice the replacement
 * into the parent, `SKIP` past what we inserted. Resolution is injected rather
 * than baked against any content source, so the same tokenizer serves the
 * live vault, a build, and tests. `@osdlc/markdown-astro`'s build-time plugin
 * delegates to it with an Astro-collection resolver.
 *
 * Two passes. The first is that regex over single `text` nodes. The second
 * handles the one shape it cannot see: an alias carrying markup
 * (`[[Note|the *key* idea]]`), which remark has already parsed into an
 * `emphasis` node, so no single text node holds both `[[` and `]]`. See
 * {@link spliceStraddling}.
 *
 * Before either, {@link mergeShortcutReferences} undoes the one parse that
 * splits `[[Note]]` before any pass sees it: a reference definition whose label
 * matches the target.
 */

import { visit, SKIP } from 'unist-util-visit'
import type { LinkResolution, WikilinkResolver } from '../types.ts'
import { isSafeLinkPath } from '../url.ts'
import { unmaskEscaped } from './escapes.ts'
import {
  hastNode,
  isPhrasingParent,
  text,
  visitTextOutside,
  type MdNode,
  type MdParent,
} from './util.ts'

/**
 * Subtrees a `[[…]]` never tokenizes in. A markdown link's text is already a
 * link: an anchor nested inside one is invalid HTML, and `rehype-raw` splits it
 * — which truncated the outer link to whatever preceded the wikilink.
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

/**
 * Non-embed `[[target#fragment|alias]]`. The leading-`!` embeds are excluded by
 * the lookbehind — `remarkEmbeds` owns those.
 *
 * A `#^abc` fragment is a block reference; anything else is a heading.
 *
 * The fields are **greedy over mutually exclusive character classes and
 * length-bounded**, deliberately. Do not pad them with `\s*`
 * (`\s*([^\]|#]*?)\s*`): the class itself matches whitespace, so every
 * whitespace character gets an ambiguous split between padding and capture, and
 * an unterminated `[[<spaces>|<spaces>` sends the matcher superlinear — a
 * 244-byte paragraph cost ~19s inside the remark visitor, which is synchronous
 * and so stalls the whole render. Classes that stop at the next delimiter give
 * one split per start offset, and {@link FIELD_MAX} caps what each offset can
 * cost. The padding is redundant anyway: the captures are trimmed at the use
 * sites (`target.trim()`, {@link splitFragment}, `rawAlias?.trim()`).
 *
 * Unlike markdown-astro's spelling, the target stays optional (`{0,512}`) and
 * the fragment stays captured — `[[#Heading]]` links to the current note.
 */
export const WIKILINK_RE =
  /(?<!!)\[\[([^\]|#]{0,512})(?:#([^\]|]{1,512}))?(?:\|([^\]]{0,512}))?\]\]/g

/**
 * Longest a single `[[…]]` field may be, mirrored in {@link WIKILINK_RE} and
 * `EMBED_RE` in `embeds.ts` (regex literals cannot interpolate). Generous next
 * to any real vault path or alias, small enough to bound the matcher's work.
 * A field beyond the cap leaves the whole `[[…]]` as literal text.
 */
export const FIELD_MAX = 512

/**
 * Longest text node the `[[…]]` / `![[…]]` scanners will walk. A backstop, not
 * a feature: real prose nodes are orders of magnitude smaller, and a node this
 * large is a generated or hostile document rather than something a reader
 * wants wikilinked.
 */
export const MAX_SCAN_LENGTH = 100_000

/**
 * The `[[<target>[#<fragment>]` half of a straddling link, matched against the
 * slice between `[[` and the first `|` after it.
 *
 * Only the *alias* may carry markup: the target and the `#fragment` are path
 * syntax, so this half has to be one plain-text run or the whole `[[…]]` stays
 * literal. The fields keep {@link WIKILINK_RE}'s classes and {@link FIELD_MAX}
 * bound, and the slice holds no `|` by construction, so there is nothing for
 * the matcher to backtrack across.
 */
const STRADDLE_HEAD_RE = /^([^\]|#]{0,512})(?:#([^\]|]{1,512}))?$/

/**
 * How many `[[` openers one text node offers the straddling pass before it
 * gives up. A straddling alias is a phrase with emphasis in it; a node holding
 * a run of unclosed openers is a hostile document, and this stops each of them
 * from costing a {@link FIELD_MAX} window.
 */
const MAX_HEAD_CANDIDATES = 8

/**
 * How many siblings past the opener the straddling pass looks for the closing
 * `]]`. An alias is a phrase — a handful of emphasis or code runs — not a
 * paragraph.
 */
const MAX_STRADDLE_NODES = 32

/** Nodes one alias may hold, over all of {@link MAX_STRADDLE_NODES} siblings. */
const MAX_ALIAS_NODES = 256

/** How deep {@link aliasText} descends before calling the alias implausible. */
const MAX_ALIAS_DEPTH = 6

/**
 * Phrasing types an alias may carry. A whitelist, not a blocklist: the thing
 * that must never get in is another link — an anchor inside an anchor is what
 * {@link SKIP_SUBTREES} exists to prevent, and `rehype-raw` splits it.
 */
const ALIAS_TYPES = new Set(['text', 'emphasis', 'strong', 'delete', 'inlineCode', 'break'])

export interface RemarkWikilinksOptions {
  /** Injected resolver. Defaults to {@link defaultResolver}. */
  resolveLink?: WikilinkResolver
  /** Path of the note being rendered, forwarded to the resolver. */
  notePath?: string
  /**
   * Emission seam: build the mdast node(s) for one matched wikilink. Unset, the
   * plugin emits {@link wikilinkNode}'s `<a class="wikilink">` contract. A host
   * needing a different shape (a `<span>` relation, a hard failure on a missing
   * target) supplies its own builder; returning `null` leaves the original
   * matched text in place — for hosts whose policy keeps some matches literal.
   *
   * `resolution` is the resolver's answer merged with the parsed
   * heading/blockId and the computed label — exactly what the default builder
   * renders from. `rawTarget`/`rawAlias` are the verbatim regex captures,
   * before any trimming — for hosts reproducing a legacy emission exactly.
   */
  buildNode?: (link: {
    target: string
    /** Capture group 1 verbatim — the target before any trim. */
    rawTarget: string
    heading: string | null
    blockId: string | null
    alias: string | null
    /**
     * Capture group 3 verbatim — the alias before any trim. `null` when the
     * link had no `|` segment; `''` when the segment existed but was empty
     * (`[[x|]]`). For an alias that carried markup there is no capture, so this
     * is `children` flattened to plain text, untrimmed.
     */
    rawAlias: string | null
    label: string
    resolution: LinkResolution
    /**
     * The alias's own phrasing nodes, present only when the alias carried
     * markup and so straddled siblings (`[[Note|the *key* idea]]`). `label` is
     * the same content flattened to plain text, so a builder that wants a
     * string can ignore this.
     */
    children?: MdNode[]
  }) => MdNode | MdNode[] | null
}

/** Split a `[[…]]` fragment into its heading / block-id halves. */
export function splitFragment(fragment: string | undefined): {
  heading?: string
  blockId?: string
} {
  if (!fragment) return {}
  const trimmed = fragment.trim()
  if (!trimmed) return {}
  if (trimmed.startsWith('^')) return { blockId: trimmed.slice(1) }
  return { heading: trimmed }
}

/**
 * Re-stamp a resolution with the link's OWN fragment, replacing whatever the
 * resolver supplied.
 *
 * The two fragment keys are dropped and then re-spread rather than assigned:
 * `splitFragment` already omits the key it has no value for, and spreading
 * preserves that. Assigning from destructured `heading`/`blockId` locals
 * writes explicit `undefined`s instead, which is a different type under
 * exactOptionalPropertyTypes — and spreading over the resolution without
 * dropping first would let a resolver-supplied fragment survive.
 */
export function withFragment(
  resolution: LinkResolution,
  fragment: { heading?: string; blockId?: string },
  display?: string,
): LinkResolution {
  const { heading: _h, blockId: _b, ...base } = resolution
  return { ...base, ...fragment, ...(display !== undefined ? { display } : {}) }
}

/** Label a link falls back to: the alias, else the target's last segment. */
export function defaultDisplay(
  target: string,
  fragment: string | undefined,
  alias: string | undefined,
): string {
  if (alias) return alias
  const bare = target.trim()
  // `||`, not `??`: `Folder/` pops an empty segment, not `undefined`.
  if (bare) return bare.split('/').filter(Boolean).pop() || bare
  // `[[#Heading]]` / `[[#^block]]` — a same-note link shows its fragment.
  return (fragment ?? '').replace(/^\^/, '').trim()
}

/**
 * Resolver used when the host supplies none: everything is a note whose path
 * is the target as written. Useful for tests and for rendering a document with
 * no vault behind it.
 */
export const defaultResolver: WikilinkResolver = (target) => ({
  kind: 'note',
  path: target,
  display: target.split('/').filter(Boolean).pop() || target,
})

/**
 * The anchor properties for one resolved wikilink.
 *
 * Contract: `<a class="wikilink" data-wikilink data-kind [data-path]
 * [data-heading] [data-block-id]>`. A `missing` link deliberately carries no
 * `href` — there is nowhere to navigate — and gains `wikilink-missing`.
 *
 * `path` lands on `href` *and* `data-path`, and only the first of those is
 * protocol-checked downstream, so the scheme is checked here instead — before
 * either is written. A resolution the note steered somewhere the host must not
 * follow (`[[javascript://%0aalert(1)|Home]]` resolves `external` under any
 * scheme-sniffing resolver) renders as an inert anchor rather than as an
 * internal-looking link that opens an attacker's URL on a plain left click.
 *
 * Exported because `remarkMarkdownLinks` builds the same anchor from
 * `[label](Note.md)`: one target shape, so the Vue layer routes both to
 * `WikilinkAnchor` and the host handles them identically.
 */
export function wikilinkProps(target: string, resolution: LinkResolution): Record<string, unknown> {
  const className = ['wikilink']
  if (resolution.kind === 'missing') className.push('wikilink-missing')
  if (resolution.kind === 'external') className.push('wikilink-external')

  const props: Record<string, unknown> = {
    className,
    dataWikilink: target,
    dataKind: resolution.kind,
  }
  if (
    resolution.kind !== 'missing' &&
    resolution.path !== undefined &&
    isSafeLinkPath(resolution.path)
  ) {
    props.href = resolution.path
    props.dataPath = resolution.path
  }
  if (resolution.heading) props.dataHeading = resolution.heading
  if (resolution.blockId) props.dataBlockId = resolution.blockId
  return props
}

/**
 * Build the mdast node for one resolved wikilink.
 *
 * `children` is the alias's own nodes, for an alias that carried markup
 * (`[[Note|the *key* idea]]`); omitted, the anchor holds `label` as plain text.
 */
export function wikilinkNode(
  target: string,
  resolution: LinkResolution,
  label: string,
  children?: MdNode[],
): MdNode {
  return hastNode(
    'wikilink',
    'a',
    wikilinkProps(target, resolution),
    children?.length ? children : [text(label)],
  )
}

/** What {@link spliceStraddling} needs from the plugin's options. */
interface StraddleContext {
  resolve: WikilinkResolver
  build: NonNullable<RemarkWikilinksOptions['buildNode']>
  notePath?: string
}

/** The head of a straddling link: `[[<target>[#<fragment>]|`. */
interface StraddleHead {
  /** Offset of the `[[`. */
  open: number
  /** Offset just past the `|`, where the alias starts. */
  aliasFrom: number
  rawTarget: string
  rawFragment: string | undefined
}

/**
 * Find the head of a `[[…]]` whose alias may run past this text node.
 *
 * Leftmost wins, as {@link WIKILINK_RE} does. A candidate is rejected when it
 * is an embed (`![[…]]`, `remarkEmbeds`' business), when its `]]` is in this
 * same node (the first pass already had its say — including the say of leaving
 * an over-{@link FIELD_MAX} link literal), or when the target/fragment half is
 * not one plain-text run.
 */
function findStraddleHead(value: string): StraddleHead | null {
  let open = value.indexOf('[[')
  for (let tries = 0; open >= 0 && tries < MAX_HEAD_CANDIDATES; tries++) {
    if (value[open - 1] !== '!') {
      const bar = value.indexOf('|', open + 2)
      // No `|` left in the node, so no later opener has an alias here either.
      if (bar < 0) return null
      if (bar - open - 2 <= 2 * FIELD_MAX + 1 && value.indexOf(']]', bar + 1) < 0) {
        const m = STRADDLE_HEAD_RE.exec(value.slice(open + 2, bar))
        if (m) {
          return { open, aliasFrom: bar + 1, rawTarget: m[1] ?? '', rawFragment: m[2] }
        }
      }
    }
    open = value.indexOf('[[', open + 2)
  }
  return null
}

/**
 * Plain text under `node`, or `null` when it holds something an anchor must
 * not wrap or is bigger than an alias plausibly is.
 */
function aliasText(node: MdNode, budget: { nodes: number }, depth = 0): string | null {
  if (depth > MAX_ALIAS_DEPTH || budget.nodes-- <= 0) return null
  if (!ALIAS_TYPES.has(node.type)) return null
  if (typeof node.value === 'string') return node.value
  let out = ''
  for (const child of node.children ?? []) {
    const inner = aliasText(child, budget, depth + 1)
    if (inner === null) return null
    out += inner
  }
  return out
}

/** The alias of one straddling link, gathered across siblings. */
interface StraddleAlias {
  nodes: MdNode[]
  /** Those nodes flattened to plain text, untrimmed. */
  text: string
  /** Index of the sibling holding `]]`, and the offset of it. */
  closeIndex: number
  closeAt: number
}

/**
 * Collect the alias: the head node's text after the `|`, then whole siblings,
 * up to the one holding `]]`. `null` when no closer is in reach, the alias runs
 * past {@link FIELD_MAX}, or a node in it is not an {@link ALIAS_TYPES} one.
 */
function collectAlias(parent: MdParent, i: number, headTail: string): StraddleAlias | null {
  const budget = { nodes: MAX_ALIAS_NODES }
  const nodes: MdNode[] = headTail ? [text(headTail)] : []
  let plain = headTail

  const limit = Math.min(parent.children.length, i + 1 + MAX_STRADDLE_NODES)
  for (let j = i + 1; j < limit; j++) {
    const sibling = parent.children[j]
    if (!sibling) return null
    if (sibling.type === 'text' && typeof sibling.value === 'string') {
      const at = sibling.value.indexOf(']]')
      if (at >= 0) {
        const tail = sibling.value.slice(0, at)
        if (plain.length + tail.length > FIELD_MAX) return null
        if (tail) nodes.push(text(tail))
        return { nodes, text: plain + tail, closeIndex: j, closeAt: at }
      }
    }
    const inner = aliasText(sibling, budget)
    if (inner === null) return null
    plain += inner
    if (plain.length > FIELD_MAX) return null
    nodes.push(sibling)
  }
  return null
}

/**
 * Second pass over one phrasing parent: tokenize a `[[…]]` whose `]]` sits in a
 * later sibling because the alias carried markup.
 *
 * Modelled on `spliceDelimited` in `util.ts`, which does the same straddling
 * scan for `%%` and `==`. It is not reused: those are one symmetric delimiter
 * either side of the span, whereas a wikilink's opener carries the target and
 * `#fragment` with it, and those must NOT straddle.
 *
 * Cheap when there is nothing to do: a parent with one child cannot straddle at
 * all, and a head node with no `|` after its `[[` is dropped on one `indexOf`.
 */
function spliceStraddling(parent: MdParent, ctx: StraddleContext): void {
  let i = 0
  // A straddle needs a later sibling to close in, so the last child is never a
  // head — which is also the whole cost of a single-text-node paragraph.
  while (i + 1 < parent.children.length) {
    const node = parent.children[i]
    if (!node || node.type !== 'text' || typeof node.value !== 'string') {
      i++
      continue
    }
    const value = node.value
    if (!value.includes('[[') || value.length > MAX_SCAN_LENGTH) {
      i++
      continue
    }
    const head = findStraddleHead(value)
    const alias = head && collectAlias(parent, i, value.slice(head.aliasFrom))
    if (!head || !alias) {
      i++
      continue
    }

    const target = head.rawTarget.trim()
    const fragment = splitFragment(head.rawFragment)
    const { heading, blockId } = fragment
    const aliasLabel = alias.text.trim() || undefined
    const label = defaultDisplay(target, head.rawFragment, aliasLabel)
    const resolved: LinkResolution = target
      ? ctx.resolve(unmaskEscaped(target), ctx.notePath)
      : {
          kind: 'note',
          ...(ctx.notePath !== undefined ? { path: ctx.notePath } : {}),
          display: label,
        }

    const built = ctx.build({
      target,
      rawTarget: head.rawTarget,
      heading: heading ?? null,
      blockId: blockId ?? null,
      alias: aliasLabel ?? null,
      rawAlias: alias.text,
      label,
      resolution: withFragment(resolved, fragment, label),
      // A blank alias has no markup worth keeping; the label carries it.
      ...(aliasLabel ? { children: alias.nodes } : {}),
    })
    if (built === null) {
      i++
      continue
    }

    const closeNode = parent.children[alias.closeIndex]
    const before = value.slice(0, head.open)
    const after = String(closeNode?.value ?? '').slice(alias.closeAt + 2)
    const replacement: MdNode[] = []
    if (before) replacement.push(text(before))
    replacement.push(...(Array.isArray(built) ? built : [built]))
    if (after) replacement.push(text(after))

    parent.children.splice(i, alias.closeIndex - i + 1, ...replacement)
    // Resume on the trailing text node — it may open the next link — or just
    // past everything inserted when there is none.
    i += replacement.length - (after ? 1 : 0)
  }
}

/**
 * Put `[[Note]]` back into one text node where remark read it as a reference.
 *
 * With `[Note]: url` anywhere in the document (labels match
 * case-insensitively), remark parses `[[Note]]` as the text `[`, a shortcut
 * `linkReference`, and the text `]`. Neither pass sees `[[` and `]]` in one
 * text node then, so the wikilink became a link to the definition's URL inside
 * literal brackets. Obsidian always reads `[[…]]` as a wikilink, so the three
 * nodes are joined back into their source text — the reference's `label` is
 * its source spelling — and the first pass tokenizes that as usual. `![[Note]]`
 * joins too, which hands it to `remarkEmbeds`.
 *
 * Only a join the tokenizers will accept is made: `[[label]]` must be one whole
 * {@link WIKILINK_RE} match (`EMBED_RE` has the same fields) and the joined
 * text must fit {@link MAX_SCAN_LENGTH}. Otherwise the reference link stays.
 */
function mergeShortcutReferences(tree: MdNode): void {
  visit(tree as never, (node: MdNode) => {
    if (SKIP_SUBTREES.has(node.type)) return SKIP
    if (!isPhrasingParent(node)) return
    const children = node.children
    let i = 0
    while (i + 2 < children.length) {
      const [before, ref, after] = [children[i], children[i + 1], children[i + 2]]
      const head = before?.type === 'text' ? String(before.value ?? '') : ''
      const tail = after?.type === 'text' ? String(after.value ?? '') : ''
      if (
        !before ||
        !after ||
        ref?.type !== 'linkReference' ||
        ref.referenceType !== 'shortcut' ||
        typeof ref.label !== 'string' ||
        !head.endsWith('[') ||
        !tail.startsWith(']')
      ) {
        i++
        continue
      }
      const source = `[${ref.label}]`
      WIKILINK_RE.lastIndex = 0
      const match = WIKILINK_RE.exec(`[${source}]`)
      const value = `${head}${source}${tail}`
      if (
        match?.index !== 0 ||
        match[0].length !== source.length + 2 ||
        value.length > MAX_SCAN_LENGTH
      ) {
        i++
        continue
      }
      const merged = text(value)
      if (before.position && after.position) {
        merged.position = { start: before.position.start, end: after.position.end }
      }
      // Not advanced: the joined node may end in the `[` of the next link.
      children.splice(i, 3, merged)
    }
    return
  })
}

/** Remark plugin: tokenize `[[wikilinks]]` into anchor nodes. */
export function remarkWikilinks(options: RemarkWikilinksOptions = {}) {
  const resolve = options.resolveLink ?? defaultResolver
  const build: NonNullable<RemarkWikilinksOptions['buildNode']> =
    options.buildNode ??
    // `[[]]`, `[[ ]]`, `[[|]]`: no target, fragment or alias, so nothing to link
    // to and nothing to show. The source stays literal rather than becoming an
    // empty anchor to the current note. A host builder still sees the match.
    ((link) =>
      !link.target && !link.heading && !link.blockId && !link.alias
        ? null
        : wikilinkNode(link.target, link.resolution, link.label, link.children))

  return (tree: MdNode) => {
    mergeShortcutReferences(tree)
    visitTextOutside(tree, SKIP_SUBTREES, (node: MdNode, i: number, parent: MdParent) => {
      if (typeof node.value !== 'string') return
      if (!node.value.includes('[[')) return
      if (node.value.length > MAX_SCAN_LENGTH) return

      const value = node.value
      const replacement: MdNode[] = []
      let last = 0
      WIKILINK_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = WIKILINK_RE.exec(value)) !== null) {
        const [whole, rawTarget, rawFragment, rawAlias] = m

        const target = (rawTarget ?? '').trim()
        const fragment = splitFragment(rawFragment)
        const { heading, blockId } = fragment
        const alias = rawAlias?.trim() || undefined
        const label = defaultDisplay(target, rawFragment, alias)

        const resolved: LinkResolution = target
          ? // The resolver is host code: hand it the author's text, not a sentinel.
            resolve(unmaskEscaped(target), options.notePath)
          : // A fragment-only link points at the current note.
            {
              kind: 'note',
              ...(options.notePath !== undefined ? { path: options.notePath } : {}),
              display: label,
            }

        const built = build({
          target,
          rawTarget: rawTarget ?? '',
          heading: heading ?? null,
          blockId: blockId ?? null,
          alias: alias ?? null,
          rawAlias: rawAlias ?? null,
          label,
          resolution: withFragment(resolved, fragment, label),
        })
        // `null` keeps the match literal: leave `last` where it is so the
        // matched text rides along in the next pre-match (or tail) slice.
        if (built === null) continue

        if (m.index > last) replacement.push(text(value.slice(last, m.index)))
        replacement.push(...(Array.isArray(built) ? built : [built]))
        last = m.index + whole.length
      }
      if (!replacement.length) return
      if (last < value.length) replacement.push(text(value.slice(last)))

      parent.children.splice(i, 1, ...replacement)
      return i + replacement.length
    })

    // Second pass, over parents rather than text nodes: a `[[…]]` the first
    // pass could not see because its alias carried markup. Anchors the first
    // pass emitted are `wikilink` nodes, so SKIP_SUBTREES keeps this off them.
    const ctx: StraddleContext = {
      resolve,
      build,
      ...(options.notePath !== undefined ? { notePath: options.notePath } : {}),
    }
    visit(tree as never, (node: MdNode) => {
      if (SKIP_SUBTREES.has(node.type)) return SKIP
      if (isPhrasingParent(node)) spliceStraddling(node, ctx)
      return
    })
  }
}
