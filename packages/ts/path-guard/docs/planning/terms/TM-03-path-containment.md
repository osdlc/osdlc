---
id: TM-03
type: term
state: accepted
created: 2026-10-19
---

# TM-03: Path containment

## Definition

After symlinks are resolved, a path is the root or beneath it, compared by
whole components. A [guard](TM-10-guard.md) tests it with `guard.resolve`,
`guard.tryResolve` and `guard.contains`. Rust: `Guard::resolve` and
`Guard::contains`.

## Contrast

Not a [lexical](TM-02-lexical.md) check. A path with no `..` in it can still
leave the root through a symlink. The text check is `lexical.isUnder`, a
different name so a caller cannot swap one for the other by mistake.

Not a string prefix test. `/vault-bee` is not inside `/vault-b`, because the
comparison is by whole components.

## Notes

Neither the path nor the root has to exist. Each is judged by the
[real path](TM-07-real-path.md) of its deepest existing ancestor, so a call
that creates a new file uses the same guard as a read.

The root and every other path argument must be absolute. An empty root is
refused as `empty_root`, and any other relative argument as `not_absolute`.

A path proved outside the root is an [escape](TM-04-escape.md). A path the
guard cannot judge is an [unresolvable path](TM-09-unresolvable-path.md).
`guard.contains` answers false for both.

The race-checked helpers in `@osdlc/path-guard/node` (`realPathInside`,
`existingPathInside`, `openContainedFile`, `readContainedFile`) need the path
to exist.
