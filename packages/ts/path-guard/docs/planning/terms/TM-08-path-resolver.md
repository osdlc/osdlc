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

Not a [lexical](TM-02-lexical.md) step.

Not a [guard](TM-10-guard.md). The resolver only answers filesystem
questions. The guard holds one resolver and runs the checks.

## Notes

`nodeResolver`, from `@osdlc/path-guard/node`, is the real-filesystem one. In
Rust it is `StdResolver`. No function takes a resolver as an optional
argument. A caller binds one to a guard: `new PathGuard(resolver)` or
`Guard::new(resolver)`. An in-memory resolver runs the same
[path containment](TM-03-path-containment.md) algorithm over a different
filesystem. The [real path](TM-07-real-path.md) it returns is what
containment compares.
