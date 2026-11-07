---
id: D-05
type: decision
state: accepted
created: 2026-11-07
---

# D-05: Errors are classes with a stable `kind`

## Decision

Every error extends `RefLeaseError` and carries a `kind` string: `cas-failed`, `ref-not-found`,
`namespace-conflict`, `git-failed`, `payload-unreadable`, or `other` for the base class. Each
subclass takes one init object, so a field can be added without breaking callers.

A lost compare-and-swap is `CasFailed`; any other git failure is `GitFailed`. The split is read off
the rejection kind `@osdlc/typed-git`'s `push` reports for the ref, run in the C locale; the
mapping is data in `tests/conformance/push.json`. A `GitFailed` keeps typed-git's classified
failure as its `cause`.

## Why

A caller retries a lost race and reports everything else, so the two must never be confused.
`kind` keeps one spelling across implementations of the protocol, so an implementation in another
language is checked against the same cases by comparing `kind`, never a message.
