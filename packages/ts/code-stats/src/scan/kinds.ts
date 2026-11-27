/**
 * What a line of source is. `logic` is everything that is not one of the
 * others; `boilerplate` is imports, module declarations, licence headers and
 * lines of only brackets and separators; `doc` is doc comments, docstrings and
 * prose; `comment` is any other comment.
 */
export const CONTENT_KINDS = ['logic', 'boilerplate', 'comment', 'doc', 'blank'] as const
/** One of {@link CONTENT_KINDS}. */
export type ContentKind = (typeof CONTENT_KINDS)[number]

/** A count of lines for each {@link ContentKind}. */
export type KindCounts = Record<ContentKind, number>

/**
 * A {@link KindCounts} with every count at zero.
 *
 * @experimental
 */
export function emptyKindCounts(): KindCounts {
  return { logic: 0, boilerplate: 0, comment: 0, doc: 0, blank: 0 }
}

/** Counts lines per kind. */
export function countKinds(kinds: readonly ContentKind[]): KindCounts {
  const counts = emptyKindCounts()
  for (const k of kinds) counts[k] += 1
  return counts
}

/**
 * Adds the counts of `from` into `into`, in place.
 *
 * @experimental
 */
export function addKindCounts(into: KindCounts, from: KindCounts): void {
  for (const k of CONTENT_KINDS) into[k] += from[k]
}

/**
 * The lines of a text as git counts them: split on `\n`, a final newline ends
 * the last line rather than starting another, and a trailing `\r` and a
 * leading byte-order mark are dropped.
 */
export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = stripBom(text).split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
}

/**
 * Whether a file's lines, as {@link splitLines} reads them, are the diff's
 * `lines` at their line numbers. A diff line keeps a byte-order mark the
 * file's lines do not.
 */
export function linesMatch(
  fileLines: readonly string[],
  lines: readonly { at: number; text: string }[],
): boolean {
  return lines.every((l) => fileLines[l.at - 1] === (l.at === 1 ? stripBom(l.text) : l.text))
}

/** A text's first line, as {@link splitLines} reads it, for a `#!` line's language. */
export function firstLine(text: string): string | undefined {
  const end = text.indexOf('\n')
  return splitLines(end < 0 ? text : text.slice(0, end + 1))[0]
}

/**
 * The text without a leading byte-order mark.
 *
 * @experimental
 */
export function stripBom(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text
}

/** A Markdown code fence: up to three spaces, then three or more backticks or tildes (CommonMark; a tab indents code). */
export const FENCE = /^ {0,3}(`{3,}|~{3,})/
