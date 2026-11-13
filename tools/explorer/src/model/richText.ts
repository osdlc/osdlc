/** A piece of a plan paragraph: plain text, inline code, or a markdown link. */
export type TextSegment =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string }

const PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g

/**
 * Splits text on markdown links and inline code, so a template can draw them without v-html. Only
 * http(s) links become links; any other target stays as its label.
 */
export function textSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let last = 0
  const push = (segment: TextSegment) => {
    const previous = segments[segments.length - 1]
    if (segment.type === 'text' && previous?.type === 'text') previous.text += segment.text
    else segments.push(segment)
  }
  for (const match of text.matchAll(PATTERN)) {
    if (match.index > last) push({ type: 'text', text: text.slice(last, match.index) })
    const [, label, url, code] = match
    if (code !== undefined) push({ type: 'code', text: code })
    else if (label !== undefined && url !== undefined && /^https?:\/\//.test(url)) push({ type: 'link', text: label, url })
    else push({ type: 'text', text: label ?? '' })
    last = match.index + match[0].length
  }
  if (last < text.length) push({ type: 'text', text: text.slice(last) })
  return segments
}
