/** `[[wikilink]]` and `![[transclusion]]` recognition. */

/**
 * A recognized `[[wikilink]]` or `![[transclusion]]` reference, extracted from flattened text.
 */
export interface VaultRef {
  /** `"wikilink"` for `[[…]]`, `"transclusion"` for `![[…]]`. */
  kind: 'wikilink' | 'transclusion'
  /** The link target: the part before any `|alias`, `#heading`, or `#^block` suffix. */
  target: string
  /** The display alias after `|`, if present. */
  alias?: string
  /** The heading or `^block` fragment after `#`, if present. */
  fragment?: string
  /** The full matched token, verbatim, e.g. `[[target#fragment|alias]]`. */
  raw: string
}

// Tolerant of remark-stringify's backslash-escaping of `[` (`\[\[…]]`): the optional `\` before
// each bracket lets the construct be recognized after a parse, stringify, re-parse cycle.
// The inner text excludes `[` and the backslash count is at most one, so a failed match scans
// no further than the next `[` and the pass is linear in the input.
const VAULT_REF_RE = /(!?)\\?\[\\?\[([^\][]+)\]\]/g

/**
 * Finds every `[[wikilink]]` and `![[transclusion]]` in already-flattened text, in document
 * order. Each is split out of the `target#fragment|alias` form: the alias is everything after
 * the first `|`, and the fragment is everything after the first `#` in what is left. So
 * `[[Note#Part|alias]]` has a fragment, and `[[Note|alias#Part]]` has the alias `alias#Part` and
 * no fragment. A `^` after `#` stays in the fragment, so `[[Note#^block-id]]` gives the fragment
 * `^block-id`. The text between the brackets cannot contain `[`. One backslash before either
 * bracket, as `remark-stringify` writes, is recognized and kept in `raw`.
 *
 * @param text The flattened text to search, for example `SectionView.text('all')`.
 * @returns One `VaultRef` per reference, or an empty array when there are none.
 * @example
 * ```ts
 * extractVaultRefs("see [[Note#^id|the note]] and ![[Diagram]]");
 * // [
 * //   { kind: "wikilink", target: "Note", alias: "the note", fragment: "^id", raw: "[[Note#^id|the note]]" },
 * //   { kind: "transclusion", target: "Diagram", raw: "![[Diagram]]" },
 * // ]
 * ```
 */
export function extractVaultRefs(text: string): VaultRef[] {
  const refs: VaultRef[] = []
  for (const m of text.matchAll(VAULT_REF_RE)) {
    const bang = m[1] === '!'
    const inner = m[2]
    if (inner === undefined) continue
    // Split off the alias (after `|`) and the fragment (after `#`).
    let target = inner
    let alias: string | undefined
    let fragment: string | undefined
    const pipe = target.indexOf('|')
    if (pipe >= 0) {
      alias = target.slice(pipe + 1).trim()
      target = target.slice(0, pipe)
    }
    const hash = target.indexOf('#')
    if (hash >= 0) {
      fragment = target.slice(hash + 1).trim()
      target = target.slice(0, hash)
    }
    refs.push({
      kind: bang ? 'transclusion' : 'wikilink',
      target: target.trim(),
      ...(alias !== undefined ? { alias } : {}),
      ...(fragment !== undefined ? { fragment } : {}),
      raw: m[0],
    })
  }
  return refs
}
