---
id: TM-04
type: term
state: accepted
created: 2026-10-19
---

# TM-04: Escape

## Definition

A path proved to resolve outside its root. path-guard reports it as a
`PathError` of kind `escapes` (Rust: `PathError::Escapes`).

## Contrast

Not a [lexical](TM-02-lexical.md) fault. A `..` [segment](TM-06-segment.md) is
refused earlier, as `parent_segment` (Rust: `PathError::ParentSegment`), even
when it would stay inside the root. An escape is found only after symlinks are
resolved: `link/file` escapes when `link` points out of the root.

Not an [unresolvable path](TM-09-unresolvable-path.md). When the guard cannot
prove where a path lands, the kind is `unresolvable`, not `escapes`.

Not character escaping, such as a backslash or quote escape in a string.

## Notes

An escape is a failure of [path containment](TM-03-path-containment.md). The
test compares the [real path](TM-07-real-path.md) of the joined path with the
real path of the root.

Other refusals have their own kinds: `empty_root` for an empty root,
`not_absolute` for a relative argument, and `not_under_root` when
`toRelative` gets a path that is not under the root as text. In 0.2 these
were all `escapes`.
