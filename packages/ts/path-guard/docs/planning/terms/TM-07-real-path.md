---
id: TM-07
type: term
state: accepted
created: 2026-10-19
---

# TM-07: Real path

## Definition

The path with every symlink resolved. A
[path resolver](TM-08-path-resolver.md) returns it from `realpath` (Rust:
`canonicalize`). The call fails when the path does not exist.

## Contrast

Not the spelling. `link/file` and the file it points to are two spellings of
one real path.

Not an absolute path. An absolute path can still pass through symlinks.

## Notes

For a path that does not exist, path-guard uses the real path of its deepest
existing ancestor and appends the rest. It folds any `..` in the rest against
that real path. This is `canonicalExistingPrefix` (Rust:
`canonical_existing_prefix`). A dangling symlink is followed.
[Path containment](TM-03-path-containment.md) compares real paths.
