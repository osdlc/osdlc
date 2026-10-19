---
id: D-03
type: decision
state: accepted
created: 2026-10-18
---

# D-03: Dir and Tier are types only, and BaseDirs is readonly

## Decision

- `Dir` and `Tier` are exported as types only. Their constructors are not
  part of the package.
- A value comes from a checked method: `TieredDirs.vendor()`, `suite()`,
  `standalone()` and `scratch()`, `Tier.home()` and the home methods, and
  `Dir.scoped()` and `Dir.app()`.
- `Dir` has a private field, so a plain object does not type-check as a
  `Dir`.
- Every `BaseDirs` field is `readonly`. `TieredDirs` copies and freezes the
  object it is given, so a later change to the caller's object has no effect.

## Why

- The constructors skip the segment checks. No consumer calls them.
- The private field makes the type nominal. Without it, an object literal
  with the right shape would pass as a `Dir` without being checked.
- Every consumer only reads `BaseDirs`.

## Consequences

- `instanceof Dir` and `new Dir()` do not work for a caller.
- To change a root, build a new object, for example
  `{ ...bases, cache: '/srv/other' }`.
