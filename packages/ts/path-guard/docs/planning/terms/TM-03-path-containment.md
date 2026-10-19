---
id: TM-03
type: term
state: accepted
created: 2026-10-19
---

# TM-03: Path containment

## Definition

After symlinks are resolved, a path is the root or beneath it, compared by
whole components. `contains` and `resolveInside` test it. Rust: `contains`,
`contains_with`, `resolve` and `resolve_with`.

## Contrast

Not a [lexical](TM-02-lexical.md) check. A path with no `..` in it can still
leave the root through a symlink.

Not a string prefix test. `/vault-bee` is not inside `/vault-b`, because the
comparison is by whole components.

## Notes

For the resolver-based checks (`resolveInside`, `tryResolveInside`, `contains`;
Rust: `resolve`, `resolve_with`, `contains`, `contains_with`), neither the path
nor the root has to exist. Each is judged by the
[real path](TM-07-real-path.md) of its deepest existing ancestor, so a call
that creates a new file uses the same guard as a read. A path that fails the
test is an [escape](TM-04-escape.md).

The helpers in `contained.ts` (`realPathInside`, `existingPathInside`,
`openContainedFile`, `readContainedFile`) need the path to exist.
