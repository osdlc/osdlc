---
id: D-08
type: decision
state: accepted
created: 2026-11-24
---

# D-08: Placement of `./parley-capture`

## Decision

- `./parley-capture` stays in this package, and every export of it is
  experimental.
- It moves to a [parley](https://github.com/osdlc/parley) package if parley
  gets an npm home.

## Why

- The builders turn walk records and screenshots into review pages, and the
  walk is the only caller today.
- It is a generic toolkit for parley documents, wider than the one job in
  [D-01](D-01-name-and-scope.md), so it is not a stable part of this
  package's API.

## Consequences

- It may change in a patch release, and may be removed from here in a later
  minor.
