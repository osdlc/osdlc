/**
 * Wikilink helpers — the `[[target]]` value form used across entity
 * frontmatter and prose.
 *
 * The scaffolders wrap bare CLI values into `[[...]]` before forwarding them
 * to a create op (the schema stores the wrapped form); readers like the task
 * sorter unwrap `[[...]]` back to the bare target.
 *
 * NOTE: this operates on *runtime values* (`"[[T-0001]]"`), not on schema
 * patterns.
 */

/** A `[[...]]` value whose body is one run of non-`]` characters. */
const WIKILINK_RE = /^\[\[([^\]]+)\]\]$/

/** Wrap a bare target in `[[ ]]`: `T-0001` -> `[[T-0001]]`. */
export function wrapWikilink(target: string): string {
  return `[[${target}]]`
}

/**
 * If `value` is exactly a `[[...]]` wikilink, return its inner target;
 * otherwise return null. `[[A|B]]` and `[[A#h]]` return the raw inner text
 * (`A|B`, `A#h`) — callers that want only the page strip the alias/anchor.
 */
export function unwrapWikilink(value: string): string | null {
  const m = WIKILINK_RE.exec(value)
  return m ? m[1]! : null
}

/** True iff `value` is exactly a single `[[...]]` wikilink. */
export function isWikilink(value: string): boolean {
  return WIKILINK_RE.test(value)
}

/**
 * One wikilink or embed found inside prose: `[[target]]`, `[[target#heading]]`,
 * `[[target|alias]]`, `[[target#heading|alias]]`, each optionally prefixed
 * `!` for an embed. Fields are verbatim (untrimmed); `heading` and `alias` are
 * undefined when absent.
 */
export interface WikilinkMatch {
  embed: boolean
  target: string
  heading: string | undefined
  alias: string | undefined
}

/**
 * Wikilinks and embeds in prose. Groups: 1 the `!` of an embed (or empty), 2
 * the target, 3 the `#heading` including its `#` (or undefined), 4 the alias
 * (or undefined). `matchAll` copies the regex, so its `lastIndex` is never
 * shared between calls.
 */
const WIKILINK_IN_PROSE_RE = /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g

/**
 * Find every wikilink and embed in `text`, in order. Unlike
 * {@link unwrapWikilink} this scans prose. A link may span a line break (the
 * target and alias classes admit newlines), so a caller comparing wrapped text
 * collapses whitespace first or accepts the newline inside a field.
 */
export function findWikilinks(text: string): WikilinkMatch[] {
  return [...text.matchAll(WIKILINK_IN_PROSE_RE)].map((m) => ({
    embed: m[1] === '!',
    target: m[2]!,
    heading: m[3]?.slice(1),
    alias: m[4],
  }))
}
