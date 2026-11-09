---
id: D-08
type: decision
state: accepted
created: 2026-11-08
---

# D-08: Claim, update and release are exported helpers

## Decision

`claim`, `updateWithRetry` and `release` are exported functions. They were guide recipes that each
caller copied. They are built from the five operations (D-01) and add only the bounded retry that
re-reads after a lost swap.

Every payload rule is a callback: `claim` takes `build`, `isLive` and `isMine`, and
`updateWithRetry` takes `change`. The library still never reads a payload (D-04). It passes the
caller's decoded value to the caller's functions and writes what they return. A payload that cannot
be read counts as not live, and `change` sees it as `null`.

This amends D-01 only above the five operations: each operation stays one attempt and reports a
lost swap as `CasFailed`. The helpers retry by calling them again, a bounded number of times, and
throw `CasFailed` when every pass lost. A caller that wants another policy uses the operations.

`renew`, listing and release-with-archive stay recipes: they are one call, or depend on policy.

## Why

Two callers (a lock and a record store) wrote the same read, decide, swap, read-again loop, and the
loop is where the mistakes are: an unpinned delete, a retry that does not re-read, no bound.
Callbacks keep the payload the caller's while the loop is shared and tested once.
