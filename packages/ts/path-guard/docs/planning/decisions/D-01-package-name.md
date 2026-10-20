---
id: D-01
type: decision
state: accepted
created: 2026-10-19
---

# D-01: Package name

## Decision

- The package is `@osdlc/path-guard` on npm, published from this repository,
  `packages/ts/path-guard`. It is the twin of the Rust crate `path-guard`, in
  `packages/rust/path-guard`.
- The name stays. There is no alias and no second name.

## Why

- `path-guard` says what the package does: it guards a root against a path
  that would leave it.
- The twins share the name, so a reader who knows one finds the other.
- `@osdlc` is the scope of every library this repository publishes.
- A rename on npm is a new package. Every consumer would have to change its
  imports.

## Consequences

- The crate and the package keep one name between them. Renaming one renames
  both.
