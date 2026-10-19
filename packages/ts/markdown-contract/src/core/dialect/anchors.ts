/**
 * `^block-id` anchors — the addressing primitive (BASE dialect, always on).
 *
 * A line-terminal `^identifier` token bound to the block it terminates: `BlockNode.anchor`
 * for block-bound ids, `SectionNode.anchors` for section-level ids. Every contract that
 * binds a leaf to an anchor (`byAnchor`, `structure/anchor-missing`) rests on this. Owned
 * in-house — the `^block-id` construct has no maintained npm package,
 * so it is owned here (see `./index.ts`).
 */

/**
 * Match a line-terminal `^block-id` anchor token.
 *
 * Obsidian block ids are a `^` immediately followed by an identifier
 * (`[A-Za-z0-9_-]+`), occurring at the end of a line. We anchor the match to the end of
 * the (trimmed) string so a `^id` mid-line is not mistaken for an anchor.
 */
const ANCHOR_RE = /(?:^|\s)\^([A-Za-z0-9_-]+)\s*$/

/**
 * If `text` ends with a line-terminal `^block-id`, return the id and the text with that
 * token removed; otherwise return `null`. Operates on the *last line* of the text so a
 * multi-line paragraph whose final line is `^summary` binds correctly.
 */
export function extractTrailingAnchor(text: string): { id: string; rest: string } | null {
  // Work line-by-line so only a *line-terminal* anchor on the final non-empty line binds.
  const lines = text.replace(/\s+$/, '').split('\n')
  const lastIdx = lines.length - 1
  const last = lines[lastIdx]
  if (last === undefined) return null
  const m = ANCHOR_RE.exec(last)
  if (!m || m[1] === undefined) return null
  const id = m[1]
  // Strip the matched anchor token from the final line.
  const strippedLast = last.slice(0, m.index).replace(/\s+$/, '')
  if (strippedLast.length === 0) {
    lines.pop()
  } else {
    lines[lastIdx] = strippedLast
  }
  return { id, rest: lines.join('\n').replace(/\s+$/, '') }
}

/** True iff `text`, trimmed, is *only* a `^block-id` token (a standalone anchor paragraph). */
export function isStandaloneAnchor(text: string): string | null {
  const m = /^\^([A-Za-z0-9_-]+)$/.exec(text.trim())
  return m && m[1] !== undefined ? m[1] : null
}
