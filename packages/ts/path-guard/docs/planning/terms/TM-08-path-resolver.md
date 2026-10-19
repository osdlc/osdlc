---
id: TM-08
type: term
state: accepted
created: 2026-10-19
---

# TM-08: Path resolver

## Definition

The interface that reads `realpath` and `readlink`, backed by the real
filesystem or an in-memory one. It is the `Resolver` type in TypeScript, and
the `Resolver` trait in Rust, whose methods are `canonicalize` and `read_link`.

## Contrast

Not a [lexical](TM-02-lexical.md) step. The lexical check never calls a
resolver.

## Notes

Also called Resolver.

`nodeResolver` is the real-filesystem one and the default for `resolveInside`
and `contains`. In Rust it is `StdResolver`, used by `resolve` and `contains`,
and `resolve_with` and `contains_with` take any other. A caller can pass an
in-memory table to run the same
[path containment](TM-03-path-containment.md) algorithm over a different
filesystem. The [real path](TM-07-real-path.md) it returns is what containment
compares.
