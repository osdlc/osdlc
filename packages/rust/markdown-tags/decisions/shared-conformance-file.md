# One conformance suite shared with the twin

## Decision

The rules live in one language-neutral suite,
`packages/conformance/markdown-tags/suite.json`. Both packages' tests (this crate in `tests/conformance.rs`, the TypeScript package in `tests/conformance.test.ts`) read that same file. There is one copy, not two.

## Why

The TypeScript package and the Rust crate run in places the other cannot. If
the two drift, a tag found by one is missed by the other. Tests written
separately in each language drift too. One file of cases, read by both, keeps
them in step.

The Rust crate is the reference. A case's inputs are written by hand, and its
expected values are written by the crate's generator
(`cargo run -p markdown-tags --example conformance-write`), never by hand.

## What it covers

- `inline_tags`: the tags in a body under all three dialects.
- `tag_at`: the tag at an offset, with offsets in UTF-8 bytes. The TypeScript
  package converts to its UTF-16 index.
- `renderer_only`: tags a renderer that reads the syntax tree shows and a
  source scan cannot, such as a tag right after bold text. The Rust crate and
  the TypeScript package skip this section by name; a renderer runs it.

## Consequences

- A change to a rule adds or changes a case, and the generator rewrites the
  expected values. Both suites then have to pass.
- The suite lives in the repository, not in either package, so a renderer can
  read it too.
