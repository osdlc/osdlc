---
id: D-04
type: decision
state: accepted
created: 2026-11-07
---

# D-04: The `Result` type

## Decision

- Functions that can fail on their input return a `Result` from `@osdlc/result`
  (`{ ok: true, value } | { ok: false, error }`) with a typed error, and do not throw.
- The package re-exports the `Result` type, so a caller can name it without a second import. It
  does not re-export `ok` or `err`; a caller that builds results imports them from
  `@osdlc/result`.

## Why

- The package kept a copy of the same shape. One shared type lets a host pass results between
  `@osdlc` libraries without conversion.
