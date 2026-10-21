---
id: TM-02
type: term
state: accepted
created: 2026-10-19
---

# TM-02: Lexical

## Definition

Judged from the spelling alone, with no filesystem call, no symlink read and
no ambient state such as cwd. The `lexical` namespace (Rust: the `lexical`
module) holds these checks: `validateRelative`, `isUnder`, `absolute` and
`toRelative` (Rust: `validate_relative`, `is_under`, `absolute` and
`to_relative`).

## Contrast

Not [path containment](TM-03-path-containment.md). A lexical check cannot see
a symlink, so it cannot tell where a path ends up. Containment compares
[real paths](TM-07-real-path.md), which a [guard](TM-10-guard.md) reads
through its [path resolver](TM-08-path-resolver.md). `isUnder` compares
spellings, so a symlink can still lead out.

Not a weaker form of containment. The two catch different faults. The lexical
check refuses an empty path, a NUL byte, `~`, a drive or UNC prefix, an
absolute path, and degenerate or parent [segments](TM-06-segment.md).

## Notes

The lexical code reads no platform. It takes POSIX paths and reads `/` only,
on every host. It never refuses a [reserved name](TM-11-reserved-name.md) or
an [alternate data stream](TM-13-alternate-data-stream.md). It reports each
as a [path warning](TM-12-path-warning.md).

What the 0.2 code read from cwd is now an argument: `absolute(path, cwd)`.
`isUnder` and `toRelative` refuse a relative argument as `not_absolute`.
