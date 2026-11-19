---
id: D-05
type: decision
state: accepted
created: 2026-11-07
---

# D-05: The Rust twin and the shared vectors

## Decision

- The `agent-router` crate is the Rust implementation of the package's pure core: references,
  the model catalogue, validity, effort, context and the profile walk.
- The TypeScript package is the reference. It emits JSON vectors to its `fixtures/` folder, and
  both test suites read them. A behaviour change regenerates the vectors in the same change, and
  a check fails when the committed vectors are stale.
- The crate is not published to crates.io until a Rust host needs it. It keeps the shared major
  and minor version all the same.

## Why

- One set of cases, written by one implementation, is the only way two implementations stay in
  step without a person comparing them.
