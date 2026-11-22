---
id: D-04
type: decision
state: accepted
created: 2026-11-22
---

# D-04: The planned corpus model

## Decision

- The package is published now, under its own name, on the 0.x line.
- A planned corpus model, `markdown-corpus`, is expected to absorb it. Today `markdown-corpus` is a
  Rust crate in this repository, and it is not this package's twin: there is no shared
  conformance suite, the versions are not aligned, and the crate resolves links by its own rule.
- The README says so in one sentence, and does not claim parity.

## Alternatives

| Choice                                  | Why not                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Wait for the TypeScript corpus model    | The package already has consumers and works. Waiting leaves them on an unpublished name. |
| Publish it as `markdown-corpus`         | The name would promise a model that matches the Rust crate, which this API does not. |
| Declare it the crate's twin now         | There is no conformance suite to hold the two together.                         |

## Consequences

- When a TypeScript corpus model exists, this package either becomes a thin layer over it or
  retires. See [T-03](../tasks/T-03-fold-into-the-corpus-model.md).
