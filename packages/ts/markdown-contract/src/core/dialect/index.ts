/**
 * The Obsidian dialect: `^block-id` anchors, the addressing primitive that contracts bind a leaf
 * to (`byAnchor`, `structure/anchor-missing`). `parse()` applies them. It does not recognize
 * `[[wikilinks]]` or `![[transclusions]]`; those stay as plain text in the tree.
 *
 * A byte-exact `parse`, render, `git diff` round trip is not possible on this stack:
 * `remark-stringify` normalizes whitespace, list markers, table column padding and emphasis
 * delimiters whatever the dialect does. The anchors, wikilinks and transclusions themselves
 * survive a parse, stringify, re-parse cycle (see `src/core/projection.test.ts`, "round-trip"):
 * an anchor still binds to its block.
 */

export { extractTrailingAnchor, isStandaloneAnchor } from './anchors.js'
