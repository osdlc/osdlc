---
id: D-04
type: decision
state: accepted
created: 2026-10-19
---

# D-04: How `PathErrorKind` grows

## Decision

- A new `PathErrorKind` comes only in a new minor version, such as 0.3.0,
  never in a patch. It comes in both twins in the same minor version, with a
  fixture case, and the CHANGELOG names it.
- Every kind, present and future, means the path was refused.
- A caller that branches on `kind` gives the branch a default that refuses
  the path. In Rust, `PathError` is `#[non_exhaustive]`, so a `match` needs a
  `_` arm.
- A kind that exists in one twin only, such as Rust's `NotUtf8`, is named in
  that twin's docs.

## Why

- In TypeScript a new member of a union breaks a `switch` that checks it is
  exhaustive, so it is a breaking change there. In 0.x that belongs in a
  minor version.
- Rust's `#[non_exhaustive]` would let the crate add a variant in a patch.
  Holding both twins to the minor version keeps the fixture's kinds the same
  on both sides.
- A default that refuses keeps an older caller safe when a newer kind
  arrives.

## Consequences

- The README's Stability section states the rule for callers.
