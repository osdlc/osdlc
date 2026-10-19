/**
 * `[[wikilink]]` / `![[transclusion]]` recognition, as a test helper. `parse()` leaves these as
 * ordinary text; the tests use this string pass over flattened text to extract their targets,
 * for example to check that a wikilink survives a parse, stringify, re-parse cycle. It is not
 * part of the package.
 */

/** A recognized `[[wikilink]]` or `![[transclusion]]` reference, extracted from flattened text. */
interface VaultRef {
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
 * Recognize every `[[wikilink]]` / `![[transclusion]]` in already-flattened text. The targets are
 * parsed out of the `target|alias#fragment` form, tolerating remark-stringify's backslash
 * escaping.
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
