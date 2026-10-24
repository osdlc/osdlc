/**
 * The Obsidian dialect: `^block-id` anchors, which contracts use to bind a leaf to a block
 * (`byAnchor`, `structure/anchor-missing`). `parse()` applies them. It does not recognize
 * `[[wikilinks]]` or `![[transclusions]]`. Those stay as plain text in the tree.
 *
 * A byte-exact round trip (parse, render, then an empty `git diff`) is not possible.
 * `remark-stringify` normalizes whitespace, list markers, table column padding and emphasis
 * delimiters. The anchors, wikilinks and transclusions do survive a parse, stringify and
 * re-parse: an anchor still binds to its block. `tests/core/projection.test.ts` ("dialect
 * round-trip") checks this.
 */

export { extractTrailingAnchor, isStandaloneAnchor } from './anchors.js'
