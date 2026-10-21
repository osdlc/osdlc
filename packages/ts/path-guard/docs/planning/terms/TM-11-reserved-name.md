---
id: TM-11
type: term
state: accepted
created: 2026-10-20
---

# TM-11: Reserved name

## Definition

A [segment](TM-06-segment.md) whose base name is a Windows device name, such
as `NUL`, `CON` or `COM1`. The base name is the text up to the first `.` or
`:`, with trailing spaces removed, compared case insensitive. So `nul`,
`NUL.txt` and `CON:` are reserved names. The kind is `reserved_name` (Rust:
`PathError::ReservedName`).

## Contrast

Not a name that only starts like one. `console`, `nul-x` and `COM10` are
ordinary names.

Not an [alternate data stream](TM-13-alternate-data-stream.md). When a
segment could be both, such as `NUL:x`, it is a reserved name.

## Notes

The list is Microsoft's documented one, plus `COM0`, `LPT0`, `CONIN$` and
`CONOUT$`. `CLOCK$` is not on it.

A [guard](TM-10-guard.md) on Windows refuses a reserved name. Elsewhere it
accepts it and sends a [path warning](TM-12-path-warning.md). The
[lexical](TM-02-lexical.md) code only warns, on every host.
