/**
 * The Obsidian dialect.
 *
 * This directory is a **barrel** over two functional modules:
 *   - `./anchors`   — `^block-id` anchors (BASE, always on): the addressing primitive.
 *   - `./wikilinks` — `[[wikilink]]` / `![[transclusion]]` recognition (BUNDLED, default-on).
 *
 * ## Built in-house, with no external dialect dependency
 *
 * The other choice was to adopt an existing `remark-wiki-link` / OFM plugin plus an in-house
 * `^block-id` extension. The in-house build wins:
 *
 *   - The `^block-id` anchor (`./anchors`) — the addressing primitive every contract binds
 *     a leaf to (`byAnchor`, `structure/anchor-missing`) — has *no* maintained npm package,
 *     so it is owned regardless. Building the anchor in-house is
 *     non-negotiable.
 *   - The projection needs only *recognition* of `[[wikilink]]` / `![[transclusion]]`
 *     (`./wikilinks`): they must survive a parse without corrupting the tree; the validation
 *     corpus does not exercise them. Adopting a second parser to reconcile two node shapes —
 *     for a construct the projection only needs to recognize — is more dependency surface
 *     and bus-factor risk than a small, owned recognition pass. So the lower-risk choice for
 *     what the projection actually needs is in-house.
 *
 * This keeps **one owned dialect unit, one dependency surface** (no `remark-wiki-link` /
 * OFM dependency adopted), and the `^block-id` anchor first-class from day one.
 *
 * ### Round-trip fidelity status (honest)
 *
 * A **byte-exact** `parse → render → git diff --exit-code` round-trip is NOT achievable on
 * this substrate, and we do not claim it: `remark-stringify` normalizes whitespace, list
 * markers, table column padding, and emphasis delimiters (`_` vs `*`) regardless of the
 * dialect. That normalization is a property of remark-stringify, not of this dialect.
 *
 * What we *do* prove (see `src/core/projection.test.ts`, "round-trip"): the dialect
 * **constructs** — `^anchor`, `[[wikilink]]`, and `![[transclusion]]` — **survive a
 * parse → stringify → re-parse cycle**. After a round-trip the anchor still binds to its
 * block and the wikilink / transclusion targets are still recognized. This is the
 * fidelity guarantee the projection contract needs: the addressing and vault-reference
 * constructs are stable across the cycle, even though surrounding markdown is normalized.
 */

export { extractTrailingAnchor, isStandaloneAnchor } from './anchors.js'
export { extractVaultRefs } from './wikilinks.js'
