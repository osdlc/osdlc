---
id: D-05
type: decision
state: accepted
created: 2026-11-08
---

# D-05: Links are found by the scanner and placed by offset

## Decision

The wikilink and embed plugins find links with `@osdlc/markdown-link`'s `scanBodyWith` (`selfLinks`, CommonMark code rules) and place each in the mdast by the source offsets of the text nodes. A text node that cannot be aligned with its source, or a tree with no source, is scanned on its own value.

## Why

The first tokenizer was a regular expression over each text node, bounded by a 512-character field cap and a 100 000-character skip to stop catastrophic backtracking. Both bounds were public constants, and the pattern needed a second pass for an alias that carries markup. The scanner is linear, follows the same rules as the Rust crate and every other tool built on it, and reports where each link sits, so no bound is needed and an alias that crosses nodes is just a longer span.

## Consequences

- No field cap and no skipped node: a long target, alias or heading links, and a very large node is scanned like any other.
- The renderer and any tool built on the scanner agree on every link. `tests/link-conformance.test.ts` runs the scanner's shared body cases through the plugins.
- A host that runs `createMarkdownProcessor` by hand passes the source to `run` so offsets are available.
- The ReDoS regression tests keep their payloads and assert the shape of the cost, not milliseconds.
