/**
 * Finds `[[wikilinks]]` and `![[embeds]]` in the parse and puts them in the
 * mdast.
 *
 * Where a link starts and ends is decided by `@osdlc/markdown-link`'s
 * `scanBodyWith`, which reads the source once, with CommonMark's code rules.
 * The scan reports UTF-16 offsets into that source, and remark's own `text`
 * nodes carry offsets into the same source, so a link is placed by offset
 * rather than by running a pattern over each node's text. Placing by offset is
 * also what lets a link whose alias holds markup (`[[Note|the *key* idea]]`)
 * cross sibling nodes: the offsets say which siblings it covers.
 *
 * A node's value is not always its source. Escapes, entities, a blockquote's
 * `>` and the escape sentinels of `escapes.ts` change the text, so the source
 * range is aligned with the value ({@link align}) to turn a source offset into
 * a value index. When a node has no source range, or its value cannot be
 * aligned with it (`remarkComments` cut part of it out), the node's own value
 * is scanned instead and only links inside that one node are found.
 */

import { visit, SKIP } from 'unist-util-visit'
import { type BodyLink, type BodyScan, scanBodyWith } from '@osdlc/markdown-link'
import { SENTINEL } from './escapes.ts'
import { isPhrasingParent, text, type MdNode, type MdParent } from './util.ts'

/** What the scanner counts as a link: the dialect reads `[[#Heading]]` as a link to the note it is in. */
const SCAN_OPTIONS = { selfLinks: true, codeRules: 'commonmark' } as const

/** Scans `source` for links the way both link plugins read them. */
export function scanLinks(source: string): BodyScan {
  return scanBodyWith(source, SCAN_OPTIONS)
}

/** A link the scanner found, as offsets into the frame it scanned. */
interface Span {
  start: number
  end: number
}

/** The spans of one source, by kind, in order. */
interface Spans {
  wikilinks: Span[]
  embeds: Span[]
}

/**
 * The spans of a scan. A `[[` closed with an empty target is kept among the
 * wikilinks: `[[|alias]]` is a visible link to the note it is in, and the
 * scanner reports it as abandoned.
 */
function spansOf(scan: BodyScan, source: string): Spans {
  const wikilinks: Span[] = []
  const embeds: Span[] = []
  for (const link of scan.links as BodyLink[]) {
    if (link.kind === 'wikilink') wikilinks.push({ start: link.start, end: link.end })
    else if (link.kind === 'embed') embeds.push({ start: link.start, end: link.end })
  }
  for (const gone of scan.abandoned) {
    // The plugin decides what an empty target is worth (`[[|alias]]` is a link
    // to the note itself; `[[]]` stays text), and a host builder sees the match.
    if (
      gone.reason === 'empty-target' &&
      !gone.embed &&
      !source.slice(gone.start + 2, gone.end - 2).includes('[')
    ) {
      wikilinks.push({ start: gone.start, end: gone.end })
    }
  }
  wikilinks.sort((a, b) => a.start - b.start)
  return { wikilinks, embeds }
}

/** The document being rendered: its source, scanned once for both plugins. */
interface Doc {
  source: string
  spans: Spans
}

const docs = new WeakMap<object, Doc | null>()

function docOf(file: unknown): Doc | null {
  if (typeof file !== 'object' || file === null) return null
  const known = docs.get(file)
  if (known !== undefined) return known
  const value = (file as { value?: unknown }).value
  const source =
    typeof value === 'string'
      ? value
      : value instanceof Uint8Array
        ? new TextDecoder().decode(value)
        : null
  const doc =
    source === null
      ? null
      : {
          source,
          // Neither plugin has anything to do in a source without a `[[`.
          spans: source.includes('[[')
            ? spansOf(scanLinks(source), source)
            : { wikilinks: [], embeds: [] },
        }
  docs.set(file, doc)
  return doc
}

/**
 * The source range `[start, end)` of a node a plugin split out of a text node.
 * A node that came from the parse has its own `position`.
 */
const pieceRanges = new WeakMap<MdNode, [number, number]>()

function rangeOf(node: MdNode): [number, number] | null {
  const piece = pieceRanges.get(node)
  if (piece) return piece
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  return typeof start === 'number' && typeof end === 'number' ? [start, end] : null
}

/** Is `char` a code unit the parser may drop between source and value, outside the cases `align` names? */
const isSpace = (code: number): boolean => code === 32 || code === 9 || code === 13

const ENTITY = /&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/y

/**
 * Align `source[from, to)` with a text node's `value`: for each source offset
 * in the range, the index in `value` it came to. `null` when the two do not
 * line up, which a caller reads as "do not place links by offset here".
 *
 * The differences it allows are the ones the parse makes in a paragraph's
 * text: a backslash before an escaped character, a character reference
 * (`&amp;`), the sentinels of `escapes.ts` in the value, spaces and tabs
 * dropped at a line's start or end, and a blockquote's `>` markers.
 */
function align(source: string, from: number, to: number, value: string): Int32Array | null {
  const map = new Int32Array(to - from + 1)
  let si = from
  let vi = 0
  let lineStart = false
  while (si < to) {
    const sc = source.charCodeAt(si)
    const vc = vi < value.length ? value.charCodeAt(vi) : -1
    if (vc === SENTINEL.charCodeAt(0) && sc !== vc) {
      vi++
      continue
    }
    if (sc === 38) {
      ENTITY.lastIndex = si
      const reference = ENTITY.exec(source)
      // Text that spells a reference out (`\&amp;`) is not decoded.
      if (reference && si + reference[0].length <= to && !value.startsWith(reference[0], vi)) {
        const next = si + reference[0].length
        // A reference decodes to one or two UTF-16 units; the unit after it
        // says which.
        let width = 0
        for (const candidate of [1, 2]) {
          const fits =
            next >= to
              ? vi + candidate === value.length
              : vi + candidate < value.length &&
                value.charCodeAt(vi + candidate) === source.charCodeAt(next)
          if (fits) {
            width = candidate
            break
          }
        }
        if (width === 0) return null
        for (let k = si; k < next; k++) map[k - from] = vi
        si = next
        vi += width
        lineStart = false
        continue
      }
    }
    if (vc === sc) {
      map[si - from] = vi
      si++
      vi++
      lineStart = sc === 10
      continue
    }
    if (sc === 92) {
      map[si - from] = vi
      si++
      continue
    }
    if (isSpace(sc) || (lineStart && sc === 62)) {
      map[si - from] = vi
      si++
      continue
    }
    return null
  }
  while (vi < value.length && value.charCodeAt(vi) === SENTINEL.charCodeAt(0)) vi++
  if (vi !== value.length) return null
  map[to - from] = value.length
  return map
}

/** Where a node's value sits in the frame its spans were found in. */
interface View {
  value: string
  /** Whether the frame is the document's source, so pieces cut from it have a source range. */
  inSource: boolean
  /** The frame offsets this node covers. */
  from: number
  to: number
  spans: Span[]
  /** The index in `value` of a frame offset in `[from, to]`. */
  toValue(offset: number): number
}

/**
 * A text node's view in the document's source, or `null` when it cannot be
 * aligned there. A node that no link starts in gets no spans unless it is the
 * `closing` node of a link that started earlier.
 */
function sourceView(node: MdNode, doc: Doc, kind: Kind, closing = false): View | null {
  const range = rangeOf(node)
  if (!range) return null
  const [from, to] = range
  const value = node.value as string
  if (from < 0 || to > doc.source.length || from > to) return null
  const spans = kind === 'embed' ? doc.spans.embeds : doc.spans.wikilinks
  const first = firstFrom(spans, from)
  // No link starts in this node, so there is nothing to place and nothing to align.
  if (!closing && (first >= spans.length || (spans[first] as Span).start >= to)) {
    return { value, inSource: true, from, to, spans: [], toValue: () => -1 }
  }
  if (to - from === value.length && doc.source.startsWith(value, from)) {
    return { value, inSource: true, from, to, spans, toValue: (offset) => offset - from }
  }
  const map = align(doc.source, from, to, value)
  return map
    ? { value, inSource: true, from, to, spans, toValue: (offset) => map[offset - from] ?? -1 }
    : null
}

/** A text node's view of its own value. */
function valueView(node: MdNode, kind: Kind): View {
  const value = node.value as string
  const spans = spansOf(scanLinks(value), value)
  return {
    value,
    inSource: false,
    from: 0,
    to: value.length,
    spans: kind === 'embed' ? spans.embeds : spans.wikilinks,
    toValue: (offset) => offset,
  }
}

/** Index of the first span that starts at or after `offset`. */
function firstFrom(spans: Span[], offset: number): number {
  let lo = 0
  let hi = spans.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((spans[mid] as Span).start < offset) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Phrasing a link's alias may carry. A whitelist: another link must never get in, since an anchor inside an anchor is split by `rehype-raw`. */
const ALIAS_TYPES = new Set(['text', 'emphasis', 'strong', 'delete', 'inlineCode', 'break'])

/** How deep an alias is read before it counts as implausible. Bounds the recursion on a hostile tree. */
const MAX_ALIAS_DEPTH = 6

/** Plain text under `node`, or `null` when it holds something an anchor must not wrap. */
function aliasText(node: MdNode, depth = 0): string | null {
  if (depth > MAX_ALIAS_DEPTH || !ALIAS_TYPES.has(node.type)) return null
  if (typeof node.value === 'string') return node.value
  let out = ''
  for (const child of node.children ?? []) {
    const inner = aliasText(child, depth + 1)
    if (inner === null) return null
    out += inner
  }
  return out
}

type Kind = 'wikilink' | 'embed'

/** One link found: the text between its brackets, and the nodes of an alias that carried markup. */
export interface FoundLink {
  /** The text between the brackets, as the parse left it. */
  inner: string
  /**
   * Present only for a link whose alias carried markup and so crossed sibling
   * nodes: the alias's own phrasing, for the node the plugin builds.
   */
  aliasNodes?: MdNode[]
}

export interface TokenizeOptions {
  kind: Kind
  /** Node types whose subtree is left alone. */
  skip?: ReadonlySet<string>
  /** Build the node(s) for one link, or `null` to leave its text as it is. */
  build(link: FoundLink): MdNode | MdNode[] | null
}

/** Does `value` hold a link opened at `at`, closed at `end` (exclusive)? */
function shaped(value: string, at: number, end: number, open: string): boolean {
  return (
    at >= 0 &&
    end >= at + open.length + 2 &&
    value.startsWith(open, at) &&
    value.startsWith(']]', end - 2)
  )
}

/**
 * Replace every link of `options.kind` in `tree` with what `options.build`
 * makes of it. `file` is the file being processed; its source is what offsets
 * are read against.
 */
export function tokenizeLinks(tree: MdNode, file: unknown, options: TokenizeOptions): void {
  const doc = docOf(file)
  const { kind } = options
  const open = kind === 'embed' ? '![[' : '[['

  /** Tokenize the text children of one parent. */
  const tokenize = (parent: MdParent): void => {
    let i = 0
    while (i < parent.children.length) {
      const node = parent.children[i] as MdNode
      if (node.type !== 'text' || typeof node.value !== 'string' || !node.value.includes('[[')) {
        i++
        continue
      }
      const view = (doc && sourceView(node, doc, kind)) || valueView(node, kind)
      const out: MdNode[] = []
      let consumed = view.from
      let valueAt = 0
      let replaced = false
      /** A text piece of this node, with the source range it was cut from. */
      const piece = (a: number, b: number, fromOffset: number, toOffset: number): void => {
        if (b <= a) return
        const t = text(view.value.slice(a, b))
        if (view.inSource) pieceRanges.set(t, [fromOffset, toOffset])
        out.push(t)
      }

      let resume = -1
      for (let k = firstFrom(view.spans, view.from); k < view.spans.length; k++) {
        const span = view.spans[k] as Span
        if (span.start >= view.to) break
        if (span.start < consumed) continue
        let start = view.toValue(span.start)
        // `\![[Note]]` is a literal `!` and a wikilink: the scanner reads the
        // embed, the escape sentinel between the two shows it is not one.
        const escapedBang =
          kind === 'wikilink' &&
          view.value.startsWith('!', start) &&
          view.value.charCodeAt(start + 1) === SENTINEL.charCodeAt(0)
        if (escapedBang) start += 2
        const wanted = escapedBang ? '[[' : open
        if (start < valueAt) continue

        if (span.end <= view.to) {
          const end = view.toValue(span.end)
          if (!shaped(view.value, start, end, wanted)) continue
          const built = options.build({ inner: view.value.slice(start + wanted.length, end - 2) })
          if (built === null) continue
          piece(valueAt, start, consumed, span.start)
          out.push(...(Array.isArray(built) ? built : [built]))
          valueAt = end
          consumed = span.end
          replaced = true
          continue
        }

        if (kind !== 'wikilink' || !view.inSource || !doc) continue
        const crossing = crossNodes(parent, i, view, span, start, doc)
        if (!crossing) continue
        const built = options.build({ inner: crossing.inner, aliasNodes: crossing.aliasNodes })
        if (built === null) continue
        piece(valueAt, start, consumed, span.start)
        out.push(...(Array.isArray(built) ? built : [built]))
        const tail = crossing.tail
        if (tail.value) {
          const t = text(tail.value)
          pieceRanges.set(t, [span.end, tail.to])
          out.push(t)
        }
        parent.children.splice(i, crossing.last - i + 1, ...out)
        resume = i + out.length - (tail.value ? 1 : 0)
        replaced = true
        break
      }

      if (resume >= 0) {
        i = resume
        continue
      }
      if (!replaced) {
        i++
        continue
      }
      piece(valueAt, view.value.length, consumed, view.to)
      parent.children.splice(i, 1, ...out)
      i += out.length
    }
  }

  visit(tree as never, (node: MdNode) => {
    if (options.skip?.has(node.type)) return SKIP
    if (isPhrasingParent(node)) tokenize(node)
    return
  })
}

/** What a link crossing sibling nodes covers. */
interface Crossing {
  /** Text between the brackets, with the alias's markup flattened to plain text. */
  inner: string
  aliasNodes: MdNode[]
  /** Index of the sibling holding the closing `]]`. */
  last: number
  /** What follows the `]]` in that sibling, and the source offset it ends at. */
  tail: { value: string; to: number }
}

/**
 * Resolve a wikilink whose `]]` is past the end of the text node at `i`: the
 * alias carries markup, so the link runs over the siblings between. `null`
 * unless the head holds a `|` (only the alias may carry markup), every sibling
 * between is plain phrasing, and the closer is in a text node of its own.
 */
function crossNodes(
  parent: MdParent,
  i: number,
  view: View,
  span: Span,
  start: number,
  doc: Doc,
): Crossing | null {
  if (!view.value.startsWith('[[', start)) return null
  const head = view.value.slice(start + 2)
  const pipe = head.indexOf('|')
  if (pipe < 0) return null

  const middle: MdNode[] = []
  let flat = head
  for (let j = i + 1; j < parent.children.length; j++) {
    const sibling = parent.children[j] as MdNode
    const range = rangeOf(sibling)
    if (!range || range[0] >= span.end) return null
    if (sibling.type === 'text' && typeof sibling.value === 'string' && span.end <= range[1]) {
      const closer = sourceView(sibling, doc, 'wikilink', true)
      if (!closer) return null
      const end = closer.toValue(span.end)
      if (end < 2 || !closer.value.startsWith(']]', end - 2)) return null
      const tailText = closer.value.slice(0, end - 2)
      const aliasNodes: MdNode[] = []
      const headAlias = head.slice(pipe + 1)
      if (headAlias) aliasNodes.push(text(headAlias))
      aliasNodes.push(...middle)
      if (tailText) aliasNodes.push(text(tailText))
      return {
        inner: flat + tailText,
        aliasNodes,
        last: j,
        tail: { value: closer.value.slice(end), to: range[1] },
      }
    }
    const plain = aliasText(sibling)
    if (plain === null) return null
    flat += plain
    middle.push(sibling)
  }
  return null
}
