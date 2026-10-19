---
id: TM-04
type: term
state: accepted
created: 2026-10-19
---

# TM-04: Escape

## Definition

A path that resolves outside its root. path-guard reports it as a `PathError`
of kind `escapes` (Rust: `PathError::Escapes`).

## Contrast

Not a [lexical](TM-02-lexical.md) fault. A `..` [segment](TM-06-segment.md) is
refused earlier, as `parent_segment`, even when it would stay inside the root.
An escape is found only after symlinks are resolved: `link/file` escapes when
`link` points out of the root.

Not character escaping, such as a backslash or quote escape in a string.

## Notes

An escape is a failure of [path containment](TM-03-path-containment.md). The
test compares the [real path](TM-07-real-path.md) of the joined path with the
real path of the root.

The `escapes` kind also covers cases where no answer can be trusted: an empty
root, more than `MAX_LINK_HOPS` links, or a spent resolver-call budget.

One exception to "only after symlinks are resolved": `toRelative`
(`to_relative`) reads no filesystem and throws `escapes` when the path does
not start with the root as text.
