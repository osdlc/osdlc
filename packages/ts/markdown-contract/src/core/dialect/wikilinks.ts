/**
 * `[[wikilink]]` / `![[transclusion]]` recognition (BUNDLED dialect, default-on).
 *
 * Recognized so they survive projection intact and their targets are extractable.
 * Implemented as a post-parse string recognition pass over already-flattened text (NOT a
 * micromark syntax extension): remark already parses these as ordinary text, so a
 * recognition pass is sufficient and avoids owning a micromark `syntax` + `mdast-util` pair
 * for a construct the projection only needs to recognize (see `./index.ts`). The validation corpus does not exercise these, so this is
 * deliberately a recognition pass, not a full grammar.
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
// each bracket lets the *construct* be recognized after a parse→stringify→re-parse cycle,
// even though remark-stringify escapes the literal brackets. See the round-trip note in
// `./index.ts`.
const VAULT_REF_RE = /(!?)\\*\[\\*\[([^\]]+)\]\]/g

/**
 * Recognize every `[[wikilink]]` / `![[transclusion]]` in already-flattened text. Light,
 * correct recognition (BUNDLED dialect) — the targets are parsed out of the
 * `target|alias#fragment` form, tolerating remark-stringify's backslash escaping.
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
