---
id: D-07
type: decision
state: accepted
created: 2026-10-17
---

# D-07: The conformance corpus

## Decision

- The package and the `frontmatter-lossless` Rust crate share one
  conformance corpus: notes with the expected `split` and `splitLenient`
  results. Both test suites run every fixture, and a round trip must give back
  the source byte for byte.
- The crate will move into this repository at `packages/rust/frontmatter-lossless`,
  in separate work. Until then the package carries its own copy,
  `tests/fixtures/conformance.json`.
- The copy is the crate's corpus as of 2026-10-05: 24 fixtures, sha256
  `02b7468385e8d743e1a3d4388c3a9f04eb97732d375e901ae99f653764d849c3`. A test
  checks that hash, so the copy cannot drift by accident.
- When the crate moves, both suites read the crate's file and the copy is
  deleted.

## Why

One corpus keeps the two implementations identical: a framing change made in
only one of them fails the other's suite. The package must build and test on
its own in this repository before the crate arrives, so it needs the
fixtures here now.

## Consequences

- A change to how notes are split is made in both implementations and the
  corpus together. Until the crate moves, the copy here is updated with the
  crate's corpus, and the hash in `tests/index.test.ts` and this note are
  updated with it.
- Cases the copy does not cover are hand-written tests in
  `tests/index.test.ts`. A case that both implementations should pin goes
  into the crate's corpus first, then into the copy.
- The TypeScript package fixed `compose` writing new YAML into a shape taken
  from an empty block before its first release. The crate still has that
  bug; its fix and a corpus fixture for it come with the crate.
