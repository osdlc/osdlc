---
id: D-07
type: decision
state: accepted
created: 2026-10-17
---

# D-07: The conformance corpus

## Decision

- The package and the `frontmatter-lossless` Rust crate share one
  conformance suite: notes with the expected strict split (with its offsets)
  and lenient split, edits composed into a note's shape with the expected
  output, and the shapes made for new notes. Both test suites run every case,
  and a round trip must give back the source byte for byte.
- The suite is the family's, at
  `packages/conformance/frontmatter-lossless/suite.json`, in the format of
  [S-conformance-suites](../../../../../../docs/planning/standards/S-conformance-suites.md).
  The crate is the family's reference: its generator,
  `cargo run -p frontmatter-lossless --example conformance-write`, writes
  every expected value. Inputs are written by hand.
- The suite's offsets are UTF-8 bytes. This package's are UTF-16 string
  indices, and its runner, `tests/conformance.ts`, converts them before
  comparing.
- History: the package first carried a pinned copy of the crate's corpus
  (`tests/fixtures/conformance.json`, sha256-checked). When the crate moved
  into this repository both suites read the crate's
  `tests/fixtures/conformance.json` in place. That file moved to
  `packages/conformance/frontmatter-lossless/suite.json`, and is gone.

## Why

One suite keeps the two implementations identical. Because both run one
file, a framing change made in only one of them fails the other's tests. The
copy the package carried before the crate moved only pinned the crate's
results as of one date: a change to the crate's corpus did not reach this
suite, and a change made only to the copy failed nothing in the crate. A
family directory outside either implementation, with its expected values
written only by the reference, makes it plain which side is right when the
two disagree.

## Consequences

- A change to how notes are split is made in both implementations and the
  suite together, and the generator is run again.
- Cases the suite does not cover are hand-written tests in
  `tests/index.test.ts`. A case that both implementations should pin goes
  into the suite.
- The package's tests need the repository checkout (they read
  `../../conformance/frontmatter-lossless/suite.json`). The suite is not part
  of the published package.
- Before the first release, `compose` was fixed in both implementations for
  two shapes: new YAML written into a shape taken from an empty block, and a
  new body written into a shape taken from a note that ended at its closing
  fence. The suite's `compose_edit` section has LF and CRLF cases for both.
  The crate carries the same fix.
