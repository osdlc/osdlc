---
id: D-04
type: decision
state: accepted
created: 2026-11-07
---

# D-04: The payload is the caller's

## Decision

The library stores, reads and swaps a payload; it never interprets one. `buildLeaseCommit` takes
any value `canonicalJson` can encode. `fetchRef<T>` returns the parsed JSON as `unknown`, or as
`T` through a `decode` function the caller passes, such as a schema's `parse`. A `decode` error
propagates unchanged.

Expiry, renewal, ownership and phases are payload rules, so they live with the caller. The
payload file's name (`lease.json`) and the commit identity have defaults the caller can change.

## Why

Every lease scheme puts different fields in its payload. A library that fixed them would fit one
caller. Taking a decode function instead of a schema library keeps the package free of a
validation dependency and works with any of them.
