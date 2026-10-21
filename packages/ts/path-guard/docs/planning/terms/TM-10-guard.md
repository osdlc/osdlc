---
id: TM-10
type: term
state: accepted
created: 2026-10-20
---

# TM-10: Guard

## Definition

An object bound to one [path resolver](TM-08-path-resolver.md) that runs the
filesystem checks. In TypeScript it is `PathGuard`, made with
`new PathGuard(resolver)`. In Rust it is `Guard`, made with
`Guard::new(resolver)` or `Guard::std()`. Its methods are `resolve`,
`tryResolve` (TypeScript only), `contains` and `realPath` (Rust:
`real_path`).

## Contrast

Not a [lexical](TM-02-lexical.md) check. The `lexical` code takes no
filesystem. A guard always works against the filesystem it was given.

Not the race-checked file helpers. `openContainedFile`, `readContainedFile`,
`realPathInside` and `existingPathInside` live in `@osdlc/path-guard/node`
and call the real disk directly.

## Notes

The call site names its guard, such as `nodeGuard.contains(a, b)`, so a
reader can see which filesystem it uses. `nodeGuard` (Rust: `Guard::std()`)
is the guard on the real disk.

Every path argument must be absolute. The guard reads no cwd.

The guard knows its platform. On Windows it refuses a
[reserved name](TM-11-reserved-name.md) or an
[alternate data stream](TM-13-alternate-data-stream.md). Elsewhere it accepts
them and sends a [path warning](TM-12-path-warning.md) to its handler.
