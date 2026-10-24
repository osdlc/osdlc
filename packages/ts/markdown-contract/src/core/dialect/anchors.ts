/**
 * `^block-id` anchors. They are always on.
 *
 * A `^identifier` token at the end of a line binds to the block it ends. The id is stored on
 * `BlockNode.anchor` for a block, or on `SectionNode.anchors` for a section. Contracts that
 * bind a leaf to an anchor (`byAnchor`, `structure/anchor-missing`) depend on this. No
 * maintained npm package parses `^block-id`, so the code lives here.
 */

/**
 * Matches a `^block-id` token at the end of a line.
 *
 * An Obsidian block id is a `^` followed by an identifier (`[A-Za-z0-9_-]+`) at the end of a
 * line. The match is tied to the end of the string so a `^id` mid-line is not taken as an
 * anchor.
 */
const ANCHOR_RE = /(?:^|\s)\^([A-Za-z0-9_-]+)\s*$/

/**
 * If the last line of `text` ends with a `^block-id`, returns the id and the text without that
 * token. Otherwise returns `null`. Only the last line counts, so a multi-line paragraph whose
 * final line is `^summary` binds.
 */
export function extractTrailingAnchor(text: string): { id: string; rest: string } | null {
  const lines = text.replace(/\s+$/, '').split('\n')
  const lastIdx = lines.length - 1
  const last = lines[lastIdx]
  if (last === undefined) return null
  const m = ANCHOR_RE.exec(last)
  if (!m || m[1] === undefined) return null
  const id = m[1]
  const strippedLast = last.slice(0, m.index).replace(/\s+$/, '')
  if (strippedLast.length === 0) {
    lines.pop()
  } else {
    lines[lastIdx] = strippedLast
  }
  return { id, rest: lines.join('\n').replace(/\s+$/, '') }
}

/**
 * Returns the id when `text`, trimmed, is only a `^block-id` token (a standalone anchor
 * paragraph). Otherwise returns `null`.
 */
export function isStandaloneAnchor(text: string): string | null {
  const m = /^\^([A-Za-z0-9_-]+)$/.exec(text.trim())
  return m && m[1] !== undefined ? m[1] : null
}
