import { FENCE } from '../scan/kinds.ts'

/** A generated block's markers, and the heading it goes under when a body lacks it. */
export interface MarkedSection {
  start: string
  end: string
  heading: string
}

/**
 * The markers and heading of the statistics block of a PR description.
 */
export const STATS_SECTION: MarkedSection = {
  start: '<!-- code-stats:start -->',
  end: '<!-- code-stats:end -->',
  heading: '## Change statistics',
}
/** A whole-line HTML comment, the shape tools use for machine-read footers. */
const COMMENT_LINE = /^<!--.*-->\s*$/

/**
 * Offsets of lines that are exactly `marker` (a trailing `\r` allowed) outside
 * fenced code, and the fence still open at the end, if any.
 */
function markerLines(body: string, marker: string): { at: number[]; openFence: string } {
  const at: number[] = []
  let fence = ''
  let offset = 0
  for (const line of body.split('\n')) {
    const open = FENCE.exec(line)?.[1]
    if (fence === '') {
      if (open !== undefined) fence = open
      else if (line.replace(/\r$/, '') === marker) at.push(offset)
    } else if (
      open !== undefined &&
      open[0] === fence[0] &&
      open.length >= fence.length &&
      line.trim() === open
    ) {
      fence = ''
    }
    offset += line.length + 1
  }
  return { at, openFence: fence }
}

/** A line this package writes: one of its block markers. Never a footer to keep below a new block. */
const OWN_MARKER = /^<!-- code-stats:/

/**
 * Puts a rendered block into a PR body and touches nothing else.
 *
 * A marked block already there is replaced in place: an end marker on its
 * own line paired with the nearest start marker above it, outside fenced
 * code, so a quoted marker or an orphaned start is never paired. A body with
 * the section's heading but no block gets the block under that heading.
 * Otherwise the heading and the block go before any trailing HTML-comment
 * lines (footers other tools read, but not this package's own markers), which
 * stay last byte for byte, or at the end. A body that ends inside an unclosed
 * fence has the fence closed first, so the section renders and is found
 * again. A body written with CRLF line ends keeps them. Splicing the same
 * block twice gives the same body.
 */
export function spliceSection(body: string, block: string, section: MarkedSection): string {
  if (body.includes('\r\n')) {
    return spliceLf(body.replace(/\r\n/g, '\n'), block, section).replace(/\n/g, '\r\n')
  }
  return spliceLf(body, block, section)
}

function spliceLf(body: string, block: string, section: MarkedSection): string {
  const starts = markerLines(body, section.start).at
  const ends = markerLines(body, section.end)
  for (const end of ends.at) {
    const start = starts.filter((s) => s < end).at(-1)
    if (start !== undefined) {
      return body.slice(0, start) + block + body.slice(end + section.end.length)
    }
  }
  const heading = markerLines(body, section.heading).at[0]
  if (heading !== undefined) {
    const lineEnd = body.indexOf('\n', heading)
    const at = lineEnd < 0 ? body.length : lineEnd
    return `${body.slice(0, at)}\n\n${block}${lineEnd < 0 ? '\n' : body.slice(at)}`
  }

  const text = `${section.heading}\n\n${block}`
  if (ends.openFence !== '') return `${body.trimEnd()}\n${ends.openFence}\n\n${text}\n`
  const lines = body.split('\n')
  let last = lines.length - 1
  while (last >= 0 && lines[last]!.trim() === '') last -= 1
  let footer = last + 1
  while (
    footer > 0 &&
    COMMENT_LINE.test(lines[footer - 1]!) &&
    !OWN_MARKER.test(lines[footer - 1]!)
  ) {
    footer -= 1
  }
  if (footer <= last) {
    const head = lines.slice(0, footer).join('\n').trimEnd()
    const tail = lines.slice(footer).join('\n')
    return head === '' ? `${text}\n\n${tail}` : `${head}\n\n${text}\n\n${tail}`
  }
  const trimmed = body.trimEnd()
  return trimmed === '' ? `${text}\n` : `${trimmed}\n\n${text}\n`
}
