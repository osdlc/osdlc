/**
 * `[[wikilink]]` and `![[transclusion]]` recognition.
 *
 * `parse()` leaves these as ordinary text in the tree. `extractVaultRefs` is a string pass over
 * already-flattened text, such as `SectionView.text('all')`, that finds them and splits each
 * one into its target, alias and fragment.
 */

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
  /** The full matched token, verbatim, e.g. `[[target|alias#anchor]]`. */
  raw: string
}

// Tolerant of remark-stringify's backslash-escaping of `[` (`\[\[…]]`): the `\\*` before
// each bracket lets the construct be recognized after a parse, stringify, re-parse cycle.
const VAULT_REF_RE = /(!?)\\*\[\\*\[([^\]]+)\]\]/g

/**
 * Finds every `[[wikilink]]` and `![[transclusion]]` in already-flattened text, in document
 * order. Each is split out of the `target|alias#fragment` form. A `^` after `#` stays in the
 * fragment, so `[[Note#^block-id]]` gives the fragment `^block-id`. Backslash-escaped brackets,
 * which `remark-stringify` writes, are recognized too. `raw` is the matched token verbatim.
 *
 * @param text The flattened text to search.
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
