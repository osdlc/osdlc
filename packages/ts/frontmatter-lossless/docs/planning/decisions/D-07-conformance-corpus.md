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
- The crate's corpus, `packages/rust/frontmatter-lossless/tests/fixtures/conformance.json`,
  is the one corpus. The crate now lives in this repository, and both suites
  read that file in place. The package's earlier pinned copy
  (`tests/fixtures/conformance.json`, sha256-checked) is deleted.

## Why

One corpus keeps the two implementations identical. Because both suites read
one file, a framing change made in only one of them fails the other's suite.
The copy the package carried before the crate moved only pinned the crate's
results as of one date: a change to the crate's corpus did not reach this
suite, and a change made only to the copy failed nothing in the crate.

## Consequences

- A change to how notes are split is made in both implementations and the
  corpus together.
- Cases the corpus does not cover are hand-written tests in
  `tests/index.test.ts`. A case that both implementations should pin goes
  into the crate's corpus.
- The package's tests need the repository checkout (they read
  `../../rust/frontmatter-lossless/...`). The fixtures are not part of the
  published package.
- Before the first release, `compose` was fixed in both implementations for
  two shapes: new YAML written into a shape taken from an empty block, and a
  new body written into a shape taken from a note that ended at its closing
  fence. The corpus has LF and CRLF `edit` cases for both. The crate carries the
  same fix.
