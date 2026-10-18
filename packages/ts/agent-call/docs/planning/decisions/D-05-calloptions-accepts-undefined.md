---
id: D-05
type: decision
state: accepted
created: 2026-10-18
---

# D-05: CallOptions accepts undefined

## Decision

The optional fields of `CallOptions`, `captureConversation` and `signal`, are
typed `| undefined`, as the fields of the spec types are.

## Why

A caller that compiles with `exactOptionalPropertyTypes` can then pass a value
that may be `undefined`, such as an optional abort signal, without building
the object in two branches. The spec types already allow this, and two shapes
in one package surprise callers.

## Consequences

A test compiles a fixture under `exactOptionalPropertyTypes` to keep it so.
