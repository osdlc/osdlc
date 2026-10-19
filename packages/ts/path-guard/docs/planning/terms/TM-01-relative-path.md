---
id: TM-01
type: term
state: accepted
created: 2026-10-19
---

# TM-01: Relative path

## Definition

A path with no leading `/`, drive letter, UNC prefix or `~`, meant to be
joined onto a root. It is the input of `validateRelative` (Rust:
`validate_relative`).

## Contrast

Not an absolute path. A relative path has no root of its own. The caller
supplies one.

Not a safe path. A relative path can still hold a `..`
[segment](TM-06-segment.md), or pass through a symlink that leads out of the
root. The [lexical](TM-02-lexical.md) check refuses the first.
[Path containment](TM-03-path-containment.md) catches the second.
