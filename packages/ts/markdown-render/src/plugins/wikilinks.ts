/**
 * `[[wikilink]]` tokenizer.
 *
 * Where a link is comes from `@osdlc/markdown-link`'s body scanner, which reads
 * the source once and reports offsets; `link-scan.ts` places each link in the
 * mdast by those offsets, including the one shape a per-node scan cannot see,
 * an alias carrying markup (`[[Note|the *key* idea]]`), which remark has
 * already parsed into an `emphasis` node. Resolution is injected rather than
 * baked against any content source, so the same tokenizer serves the live
 * vault, a build, and tests. `@osdlc/markdown-vault-astro`'s build-time plugin
 * delegates to it with an Astro-collection resolver.
 *
 * Before the scan, {@link mergeShortcutReferences} undoes the one parse that
 * splits `[[Note]]` before any pass sees it: a reference definition whose label
 * matches the target.
 */

import { visit, SKIP } from 'unist-util-visit'
import type { LinkResolution, WikilinkResolver } from '../types.ts'
import { isSafeLinkPath } from '../url.ts'
import { unmaskEscaped } from './escapes.ts'
import { scanLinks, tokenizeLinks, type FoundLink } from './link-scan.ts'
import { hastNode, isPhrasingParent, text, type MdNode } from './util.ts'

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
   * renders from. `rawTarget`/`rawAlias` are the text as written, before any
   * trimming — for hosts reproducing a legacy emission exactly.
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
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
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

/** The `[[target#fragment|alias]]` between the brackets, split at the first `#` and the first `|`. */
function splitInner(inner: string): {
  rawTarget: string
  rawFragment: string | undefined
  rawAlias: string | null
} {
  const pipe = inner.indexOf('|')
  let before = pipe < 0 ? inner : inner.slice(0, pipe)
  // `[[Note\|alias]]`, the way a table cell spells the pipe.
  if (pipe >= 0 && before.endsWith('\\')) before = before.slice(0, -1)
  const hash = before.indexOf('#')
  return {
    rawTarget: hash < 0 ? before : before.slice(0, hash),
    rawFragment: hash < 0 ? undefined : before.slice(hash + 1),
    rawAlias: pipe < 0 ? null : inner.slice(pipe + 1),
  }
}

/**
 * Does `[[label]]` read as one whole wikilink? The join of a reference is made
 * only when the scanner would accept it, so a label the dialect rejects keeps
 * its reference link.
 */
function isWholeWikilink(label: string): boolean {
  // `[[#]]` and `[[|]]` scan as links but name nothing: the plugin leaves them
  // as text, which would lose the reference.
  if (!Array.from(label).some((char) => !'#|^ \t\n'.includes(char))) return false
  const body = `[[${label}]]`
  const scan = scanLinks(body)
  const found = scan.links[0] ?? scan.abandoned.find((a) => a.reason === 'empty-target')
  return (
    scan.links.length + scan.abandoned.length === 1 &&
    found?.start === 0 &&
    found.end === body.length
  )
}

/**
 * Put `[[Note]]` back into one text node where remark read it as a reference.
 *
 * With `[Note]: url` anywhere in the document (labels match
 * case-insensitively), remark parses `[[Note]]` as the text `[`, a shortcut
 * `linkReference`, and the text `]`. The link's brackets are then in three
 * nodes. Obsidian always reads `[[…]]` as a wikilink, so the three nodes are
 * joined back into their source text — the reference's `label` is its source
 * spelling — and the scan places the link in that as usual. `![[Note]]` joins
 * too, which hands it to `remarkEmbeds`.
 *
 * Only a join the scanner accepts is made: `[[label]]` must be one whole link.
 * Otherwise the reference link stays.
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
        !tail.startsWith(']') ||
        !isWholeWikilink(ref.label)
      ) {
        i++
        continue
      }
      const merged = text(`${head}[${ref.label}]${tail}`)
      if (before.position && after.position) {
        merged.position = { start: before.position.start, end: after.position.end }
      }
      // Not advanced: the joined node may end in the `[` of the next link.
      children.splice(i, 3, merged)
    }
    return
  })
}

/** What the default builder emits for one link, or `null` to keep the text. */
type Build = NonNullable<RemarkWikilinksOptions['buildNode']>

/** Remark plugin: tokenize `[[wikilinks]]` into anchor nodes. */
export function remarkWikilinks(options: RemarkWikilinksOptions = {}) {
  const resolve = options.resolveLink ?? defaultResolver
  const build: Build =
    options.buildNode ??
    // `[[]]`, `[[ ]]`, `[[|]]`: no target, fragment or alias, so nothing to link
    // to and nothing to show. The source stays literal rather than becoming an
    // empty anchor to the current note. A host builder still sees the match.
    ((link) =>
      !link.target && !link.heading && !link.blockId && !link.alias
        ? null
        : wikilinkNode(link.target, link.resolution, link.label, link.children))

  /** One link: what the plugin builds for the text between its brackets. */
  const buildLink = ({ inner, aliasNodes }: FoundLink): MdNode | MdNode[] | null => {
    const { rawTarget, rawFragment, rawAlias } = splitInner(inner)
    const target = rawTarget.trim()
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

    return build({
      target,
      rawTarget,
      heading: heading ?? null,
      blockId: blockId ?? null,
      alias: alias ?? null,
      rawAlias,
      label,
      resolution: withFragment(resolved, fragment, label),
      // A blank alias has no markup worth keeping; the label carries it.
      ...(aliasNodes && alias ? { children: aliasNodes } : {}),
    })
  }

  return (tree: MdNode, file?: unknown) => {
    mergeShortcutReferences(tree)
    tokenizeLinks(tree, file, { kind: 'wikilink', skip: SKIP_SUBTREES, build: buildLink })
  }
}
