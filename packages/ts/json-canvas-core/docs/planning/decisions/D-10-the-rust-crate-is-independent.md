---
id: D-10
type: decision
state: accepted
created: 2026-11-22
---

# D-10: A Rust crate for the format is independent

## Decision

The author also has a Rust crate for JSON Canvas, in the private repository this package began in (sksizer/dev). It is not
a twin of this package. The two share no conformance suite, and their versions are not aligned.

## Why

- The crate is a different design: strict parsing, mutation helpers and graph and spatial queries.
  This package is an immutable operation engine with history and a view model.
- A twin implies the same behaviour and a shared suite, which would cost work neither package needs.

## Consequences

- A change here does not wait for the crate, and the other way round.
- If the crate is published and the two grow together, reopen this decision and add a shared suite
  then.
