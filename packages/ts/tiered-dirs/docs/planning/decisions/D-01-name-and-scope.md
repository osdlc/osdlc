---
id: D-01
type: decision
state: accepted
created: 2026-10-18
---

# D-01: Name and scope

## Decision

- The package is `@osdlc/tiered-dirs`, published to npm from this repository,
  `packages/ts/tiered-dirs`. It is the twin of the Rust crate `tiered-dirs`,
  in `packages/rust/tiered-dirs`.
- It does one job: it names the machine-local directories for a vendor's
  products, on two axes.
  - The tier says who shares the state: `vendor()`, `suite(key)` or
    `standalone(tool)`.
  - The home says how long the state must last: `durable`, `config`, `cache`,
    `state`, `logs` or `runtime`.
- `scratch()` sits outside both axes. It is the platform temp directory.
- The package computes paths only. It creates, reads and deletes nothing on
  disk, and it has no dependencies.
- The product tier, one product's own directory keyed by bundle identifier, is
  out of scope. An app framework usually resolves it.
  `isVendorBundleId` lets a layer above check that a bundle id sits under the
  vendor.
- Creating directories, and the directories of an app framework such as
  Tauri, are out of scope.

## Why

- A vendor with several programs must decide which state they share and which
  they keep apart. Packages such as `env-paths` and `xdg-app-paths` cover one
  tool. None has shared vendor and suite tiers, separate `state` and
  `runtime` homes that are never the cache, or a scratch root for tests.
- Both twins must give the same relative path for the same input, or a Rust
  program and a TypeScript program over the same state would split it. A
  parity fixture, `packages/rust/tiered-dirs/tests/fixtures/parity.json`, is
  read by both test suites.

## Consequences

- A request to create directories, or for a product tier, belongs in a
  different package.
- A path shape added to one twin must be added to the other.
