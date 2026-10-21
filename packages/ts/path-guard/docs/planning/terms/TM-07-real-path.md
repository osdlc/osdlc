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

`guard.realPath` (Rust: `Guard::real_path`) returns a partial real path. For
a path that does not exist, it takes the real path of the deepest existing
ancestor and appends the rest. It folds any `..` in the rest against that
real path. A dangling symlink is followed. A missing path is not an error.

When the walk gives up, after more than `MAX_LINK_HOPS` links or a spent
call budget, `realPath` returns the path with `..` folded as text. The answer
never holds a `..`. The argument must be absolute; its only error is
`not_absolute`.

[Path containment](TM-03-path-containment.md) compares real paths.
