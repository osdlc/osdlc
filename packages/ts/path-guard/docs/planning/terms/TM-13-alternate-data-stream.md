---
id: TM-13
type: term
state: accepted
created: 2026-10-20
---

# TM-13: Alternate data stream

## Definition

A `name:stream` [segment](TM-06-segment.md), which on Windows names a stream
of the file `name`, not a file of its own. A segment with a `:` whose base
name is not a [reserved name](TM-11-reserved-name.md) is one. The kind is
`alternate_stream` (Rust: `PathError::AlternateStream`).

## Contrast

Not a drive letter. Input that starts with a drive, such as `C:x`, is refused
earlier as `windows_path` on every platform.

Not a reserved name. `CON:` and `NUL:x` are reserved names, because that
rule wins.

## Notes

`file.txt:stream` and `a/b:c.txt` are alternate data streams.

A [guard](TM-10-guard.md) on Windows refuses one. Elsewhere it accepts it and
sends a [path warning](TM-12-path-warning.md). The
[lexical](TM-02-lexical.md) code only warns, on every host.
