---
id: TM-09
type: term
state: accepted
created: 2026-10-20
---

# TM-09: Unresolvable path

## Definition

A path whose [path containment](TM-03-path-containment.md) cannot be proved.
The walk follows more than `MAX_LINK_HOPS` links, as in a link loop, or
spends its resolver-call budget. path-guard reports it as a `PathError` of
kind `unresolvable` (Rust: `PathError::Unresolvable`).

## Contrast

Not an [escape](TM-04-escape.md). An escape is proved outside the root. An
unresolvable path may lie inside or outside; the guard cannot tell.

Not a missing path. A path that does not exist is judged by its deepest
existing ancestor and can still be proved inside.

## Notes

`guard.resolve` throws `unresolvable` and `guard.tryResolve` returns null.
`guard.contains` answers false, which also means "cannot prove".
`guard.realPath` does not fail: it returns the path with `..` folded as text,
as [real path](TM-07-real-path.md) says.
