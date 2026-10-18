---
id: D-03
type: decision
state: accepted
created: 2026-10-18
---

# D-03: Rgba is readonly

## Decision

The fields `r`, `g`, `b` and `a` of `Rgba` are `readonly`. No function changes
its arguments. Each returns a new plain object, except that `compositeOver`
returns an opaque `src` as is.

## Why

A function that only reads its input should accept a frozen object or an
`as const` literal. Making the fields mutable would reject both.

## Consequences

A caller that wrote to a field of an `Rgba` gets a type error and builds a new
colour instead.
