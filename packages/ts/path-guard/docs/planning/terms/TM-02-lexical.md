---
id: TM-02
type: term
state: accepted
created: 2026-10-19
---

# TM-02: Lexical

## Definition

Judged from the spelling alone, with no filesystem call and no symlink read.
`validateRelative` (Rust: `validate_relative`) is a lexical check. So is
`isInside`, which only the TypeScript package has.

## Contrast

Not [path containment](TM-03-path-containment.md). A lexical check cannot see
a symlink, so it cannot tell where a path ends up. Containment compares
[real paths](TM-07-real-path.md), which it reads through a
[path resolver](TM-08-path-resolver.md). `isInside` compares spellings, so a
symlink can still lead out.

Not a weaker form of containment. The two catch different faults. The lexical
check refuses an empty path, a NUL byte, `~`, a drive or UNC prefix, an
absolute path, and degenerate or parent [segments](TM-06-segment.md). It does
so the same way on every machine.
