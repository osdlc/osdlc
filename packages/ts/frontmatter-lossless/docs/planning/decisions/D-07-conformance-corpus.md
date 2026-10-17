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
  results, and for some notes an `edit`: new YAML and body composed into the
  note's shape, with the expected output. Both test suites run every fixture,
  and a round trip must give back the source byte for byte.
- The crate will move into this repository at `packages/rust/frontmatter-lossless`,
  in separate work. Until then the package carries its own copy,
  `tests/fixtures/conformance.json`.
- The copy is the crate's corpus as of 2026-10-17: 24 fixtures, four with an
  `edit`, sha256
  `75f48441a439f578b1f5207e273454c4ca9e298c91179c3a23d9c1c3958e606d`. A test
  checks that hash, so the copy cannot change by accident.
- When the crate moves (sksizer/dev task T-ACAH), both suites read the crate's
  file and the copy is deleted.

## Why

One corpus keeps the two implementations identical. Once both suites read one
file, a framing change made in only one of them fails the other's suite. Until
then the copy only pins the crate's results as of the date above: a change to
the crate's corpus does not reach this suite, and a change made only here fails
nothing in the crate. The package must build and test on its own in this
repository before the crate arrives, so it needs the fixtures here now.

## Consequences

- A change to how notes are split is made in both implementations and the
  corpus together. Until the crate moves, the copy here must be re-synced with
  the crate's corpus by hand, and the hash in `tests/index.test.ts` and this
  note are updated with it.
- Cases the copy does not cover are hand-written tests in
  `tests/index.test.ts`. A case that both implementations should pin goes
  into the crate's corpus first, then into the copy.
- Before the first release, `compose` was fixed in both implementations for
  two shapes: new YAML written into a shape taken from an empty block, and a
  new body written into a shape taken from a note that ended at its closing
  fence. The corpus has LF and CRLF `edit` cases for both. The crate's fix is
  in sksizer/dev and reaches this repository when the crate moves.
