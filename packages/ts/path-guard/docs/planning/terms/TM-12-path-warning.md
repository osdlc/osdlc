---
id: TM-12
type: term
state: accepted
created: 2026-10-20
---

# TM-12: Path warning

## Definition

A note that a path is fine on this host but means something else on Windows.
It has a kind, `reserved_name` or `alternate_stream`, and the
[segment](TM-06-segment.md) that caused it. In TypeScript it is
`PathWarning { kind, segment }`, sent to an `onWarning` callback. In Rust it
is `PathWarning { kind: PathWarningKind, segment }`.

## Contrast

Not an error. A warning does not stop the call. The same name is an error
only where a [guard](TM-10-guard.md) runs on Windows.

## Notes

`lexical.validateRelative(raw, { onWarning })` calls `onWarning` once per
match, in segment order, on every host. Rust's `lexical::windows_names(raw)`
returns the same list. Input that `validateRelative` refuses gives no
warning.

A guard off Windows sends the warnings to its handler: `onWarning` on
`PathGuard`, or `Guard::with_warning_handler`. The handler is silent by
default. path-guard never writes to the console.

See [reserved name](TM-11-reserved-name.md) and
[alternate data stream](TM-13-alternate-data-stream.md).
