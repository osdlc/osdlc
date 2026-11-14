---
id: D-02
type: decision
state: accepted
created: 2026-11-07
---

# D-02: Version line and stability

## Decision

- The first public version is 0.4.1. The versions before it were rebuilt from
  the crate's history and are listed in the changelog as unpublished.
- The crate stays on 0.x. A breaking change bumps the minor version.
- Every public item is stable within the 0.5 line except the ones the README
  lists as experimental, which may change in a patch release. Today that is
  `Tokens::with_label`. An experimental item says `**Experimental.**` in its
  docs, and `tests/stability.rs` checks that the README list and those markers
  name the same items.
- The enums and the output structs that may grow (`Listen`, `AccessContext`,
  `Grant`, `DenialReason`, `ServeError`, `RuntimeError`, `Denial`,
  `InterfaceAddr`, `ShareUrls`, `WebAccessStatus`) are `#[non_exhaustive]`.

## Why

- The rebuilt history has three breaking changes in its first twelve days,
  the last on 2026-10-28. That is too recent for 1.0.
- Starting at the rebuilt version keeps the changelog's history honest: each
  earlier version is what the crate would have been, had it been released.
- `#[non_exhaustive]` lets a variant or a field be added without a breaking
  release. Each type it covers gained one before the first release.

## Consequences

- A `match` on one of these enums needs a wildcard arm, and code outside the
  crate builds a `WebAccessStatus` with `WebAccessStatus::stopped` and then
  sets its fields.
- 1.0 needs a history of at least 90 days with no breaking change.
