/**
 * Edits a dotted key path in a config YAML document (shaped like
 * `tooly.yaml`) and keeps every byte outside the edited value. A tool's
 * `config set|unset` writes through this module.
 *
 * `@osdlc/yaml-splice` edits top-level fields only, and keeps every byte
 * outside the edited span. A nested path (`server.limits.timeout`) is reduced
 * to that by recursion. Find the parent key's block-mapping value with the
 * `yaml` package's source ranges. Cut exactly those lines out. Strip their
 * common indent so they form a top-level mapping of their own. Edit that
 * sub-document (recursing for deeper paths), re-indent it, and put the lines
 * back. Every byte outside the innermost edited field is left unchanged:
 * comments, blank lines, key order, and quoting in sibling sections.
 *
 * Fallbacks, each of which rewrites only the one section involved:
 *   - The parent key is absent: `Set` it to a new nested value.
 *   - The parent value is not a block mapping (a flow map `{a: 1}`, a bare
 *     `key:` null, a scalar), or its lines cannot be dedented (a comment
 *     indented less than the block): `Set` the top-level section to its
 *     merged plain value, which re-renders that section alone.
 *
 * Pure: text in, text out. The caller validates against the config schema.
 *
 * Imports the `yaml` package directly. It needs its node helpers (`isAlias`,
 * `isMap`, `isScalar`, `parseDocument`, `visit`) to find and cut an exact
 * range out of the source text.
 */

import { editYaml, type EditValue, type FieldEdit } from '@osdlc/yaml-splice'
import { isAlias, isMap, isScalar, parseDocument, visit, type Pair, type YAMLMap } from 'yaml'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Apply a batch of top-level yaml-splice edits to `text`. */
function splice(text: string, edits: FieldEdit[]): string {
  return decoder.decode(editYaml(encoder.encode(text), edits).bytes)
}

type Op = { kind: 'set'; value: unknown } | { kind: 'unset' }

/**
 * Set `path` (one segment per mapping level) to `value` in `text`, creating
 * missing parents. `value` must be JSON-shaped (what a YAML flow scalar or
 * collection parses to).
 *
 * Replacing a block value with a block list or mapping moves the old value's
 * trailing comment to the key's own line: `check:   # the gate`, then the new
 * items beneath it. A comment on a line of its own, and every byte outside
 * the edited value, stay where they were. `@osdlc/yaml-splice` defines this
 * placement.
 * @experimental
 */
export function setPath(text: string, path: readonly string[], value: unknown): string {
  assertPath(path)
  return edit(text, path, { kind: 'set', value })
}

/**
 * Remove `path` from `text`. When the path was never set, the text comes back
 * unchanged. That covers an absent key, and a middle segment that is not a
 * mapping (a scalar, a sequence). A parent mapping left with no keys is
 * removed too, so the result never has a bare `key:` (which reads back as
 * `null`).
 *
 * The edit ignores comments. A comment block just before the removed key (or
 * before the whole section, when the parent is removed too) is not part of the
 * key's span, so it stays. It then describes a setting that is no longer
 * there. A caller that cares removes that comment itself.
 * @experimental
 */
export function unsetPath(text: string, path: readonly string[]): string {
  assertPath(path)
  return edit(text, path, { kind: 'unset' })
}

function assertPath(path: readonly string[]): void {
  if (path.length === 0 || path.some((s) => s === '')) {
    throw new Error(`invalid key path: '${path.join('.')}'`)
  }
}

function edit(text: string, path: readonly string[], op: Op): string {
  const [head, ...rest] = path as [string, ...string[]]
  if (rest.length === 0) {
    return op.kind === 'set'
      ? splice(text, [{ Set: { key: head, value: op.value as EditValue } }])
      : splice(text, [{ Remove: { key: head } }])
  }

  const doc = parseDocument(text)
  if (doc.errors.length > 0) {
    throw new Error(`YAML parse error: ${doc.errors.map((e) => e.message).join('; ')}`)
  }
  const root = doc.contents
  const pair = isMap(root) ? findPair(root, head) : undefined

  if (pair === undefined) {
    if (op.kind === 'unset') return text
    return splice(text, [{ Set: { key: head, value: nest(rest, op.value) as EditValue } }])
  }

  const node = pair.value
  if (isMap(node) && node.flow !== true && node.range) {
    const externalAnchor = externalAliasIn(node)
    if (externalAnchor !== null) {
      throw new Error(
        `cannot edit nested key under '${head}': '<<: *${externalAnchor}' inside it refers to ` +
          `an anchor defined outside that block, which a byte-preserving nested edit cannot ` +
          `carry along; edit '${head}' as a whole (or the anchor's own section) instead`,
      )
    }
    const spliced = spliceBlock(text, node.range[0], node.range[1], (sub) => edit(sub, rest, op))
    if (spliced !== null) {
      if (op.kind === 'unset' && isEmptyMapping(spliced.inner)) {
        return splice(text, [{ Remove: { key: head } }])
      }
      return spliced.text
    }
  }

  // Fallback: re-render the whole top-level section from its merged value.
  const current: unknown = node === null || node === undefined ? undefined : doc.toJS()[head]
  if (op.kind === 'unset' && !isPlainRecord(current)) {
    // Nothing to descend into (a scalar, sequence, or absent value), so the
    // nested path was never set. Recursing through `applyPlain` here would
    // build a new `{}`, find no keys left, and delete `head` itself: a plain
    // `a: 1` would lose `a` when unsetting `a.x`. Return the text unchanged.
    return text
  }
  const next = applyPlain(current, rest, op)
  if (next === undefined) return splice(text, [{ Remove: { key: head } }])
  return splice(text, [{ Set: { key: head, value: next as EditValue } }])
}

/** `current` is something a nested path can actually be set/unset inside: a plain mapping. */
function isPlainRecord(current: unknown): current is Record<string, unknown> {
  return current !== null && typeof current === 'object' && !Array.isArray(current)
}

/**
 * The name of an anchor that an alias or merge key (`<<: *anchor`) inside
 * `node`'s subtree points to, when that anchor is defined outside the
 * subtree. `null` when every alias in the subtree resolves inside it.
 * `spliceBlock` dedents a node's lines into a standalone document to edit it.
 * An alias whose anchor is outside that range would then point at nothing.
 * The YAML parser rejects that with an unclear message (or `doc.toJS()` throws
 * a `ReferenceError`). Checking here, before any splicing, lets `edit` fail
 * with a clear message. Nothing has been spliced yet, so the source text is
 * never changed.
 */
function externalAliasIn(node: object): string | null {
  const local = new Set<string>()
  const referenced = new Set<string>()
  visit(node as never, {
    Node(_key: unknown, n: unknown) {
      const anchor = (n as { anchor?: string }).anchor
      if (anchor) local.add(anchor)
      if (isAlias(n)) referenced.add(n.source)
    },
  })
  for (const name of referenced) if (!local.has(name)) return name
  return null
}

function findPair(map: YAMLMap, key: string): Pair | undefined {
  return map.items.find((p) => (isScalar(p.key) ? String(p.key.value) : String(p.key)) === key) as
    Pair | undefined
}

/** `['a','b']`, v → `{ a: { b: v } }`. */
function nest(path: readonly string[], value: unknown): unknown {
  return path.reduceRight<unknown>((acc, seg) => ({ [seg]: acc }), value)
}

/** Set/unset `path` on a plain value; `undefined` when nothing is left. */
function applyPlain(current: unknown, path: readonly string[], op: Op): unknown {
  const [head, ...rest] = path as [string, ...string[]]
  const base =
    current !== null && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {}
  if (rest.length === 0) {
    if (op.kind === 'set') base[head] = op.value
    else delete base[head]
  } else {
    const child = applyPlain(base[head], rest, op)
    if (child === undefined) delete base[head]
    else base[head] = child
  }
  return Object.keys(base).length === 0 ? undefined : base
}

function isEmptyMapping(text: string): boolean {
  const doc = parseDocument(text)
  const v = doc.contents
  return v === null || (isMap(v) && v.items.length === 0)
}

/**
 * Cut the whole lines spanning `[start, end)` out of `text`, dedent them by
 * the column of `start`, hand the dedented sub-document to `transform`, then
 * re-indent its result and splice it back. `null` when the lines cannot be
 * dedented cleanly (the caller falls back to re-rendering the section).
 */
function spliceBlock(
  text: string,
  start: number,
  end: number,
  transform: (sub: string) => string,
): { text: string; inner: string } | null {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const indent = start - lineStart
  if (indent === 0 || !/^ *$/.test(text.slice(lineStart, start))) return null
  // `end` is the value end: just past the last value's newline for a block
  // map, or mid-line when the document has no trailing newline.
  let lineEnd = end
  if (lineEnd > 0 && text[lineEnd - 1] !== '\n') {
    const nl = text.indexOf('\n', lineEnd)
    lineEnd = nl === -1 ? text.length : nl + 1
  }
  const pad = ' '.repeat(indent)
  const block = text.slice(lineStart, lineEnd)

  const dedented: string[] = []
  for (const line of splitLines(block)) {
    if (line.startsWith(pad)) dedented.push(line.slice(indent))
    else if (line.trim() === '') dedented.push(line.replace(/^ +/, ''))
    else return null
  }
  const inner = transform(dedented.join(''))
  const reindented = splitLines(inner)
    .map((line) => (line.trim() === '' ? line : pad + line))
    .join('')
  // Keep the block newline-terminated when it was, so the next key stays on
  // its own line.
  const tail = block.endsWith('\n') && reindented !== '' && !reindented.endsWith('\n') ? '\n' : ''
  return { text: text.slice(0, lineStart) + reindented + tail + text.slice(lineEnd), inner }
}

/** Split into lines, each keeping its terminator (the last may have none). */
function splitLines(text: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const nl = text.indexOf('\n', i)
    if (nl === -1) {
      out.push(text.slice(i))
      break
    }
    out.push(text.slice(i, nl + 1))
    i = nl + 1
  }
  return out
}
