---
id: D-10
type: decision
state: proposed
created: 2026-11-19
---

# D-10: The 0.2.4 API is signed off

## Decision

The public API of `@osdlc/ref-lease` as first published in 0.2.4 stands, including the changes made
when it was extracted.

Status: proposed. The owner signs this off by changing `state` to `accepted`, or names the change
they want.

## Recommendation

Accept. The audit asked this as owner question 2, and it settles the API gate (Q4).

## The extraction changes being signed off

- The payload's type comes from the caller, through `fetchRef`'s `decode` option (D-04).
- Every error class takes one init object (D-05).
- `GitFailed` and `PayloadUnreadable` are split out from the base class (D-05).
- `checkNamespaceConflict` takes the namespace as an argument and keeps no cache (D-06).
- `onMirrorSkip` replaces a line printed to stderr.
- The default identity is a neutral `ref-lease <ref-lease@local>`.
- The push and fetch classifiers are exported, marked experimental.

## Why

Each change removes a choice that belonged to the first caller: a payload type, an error shape, a
cache, a stderr line, an identity. The experimental marking keeps the classifiers free to change.

## Since 0.2.4

The sign-off covers 0.2.4. Later releases added `claim`, `updateWithRetry`, `release`, `refKey` and
`refStore` (D-08, 0.3.0). They are additive and not part of this sign-off.

## What would reopen it

A breaking change to any of the listed surfaces.

## Source

The publish-readiness audit in sksizer/dev, "Owner questions". Tracked in osdlc/osdlc#685.
