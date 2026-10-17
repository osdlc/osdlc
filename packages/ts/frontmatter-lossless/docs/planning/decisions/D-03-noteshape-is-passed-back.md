---
id: D-03
type: decision
state: accepted
created: 2026-10-17
---

# D-03: `NoteShape` is passed back, not built

## Decision

- `NoteShape` stays as it is: `bom`, `openEol`, `closeEol` and `closeSep`.
- It is documented as a value a caller takes from `split` and passes back to
  `compose`, not one a caller builds. Its TSDoc and the README say so.
- A minor release may add a field to it.

## Why

`compose` takes a `NoteShape` as input. If callers built one as an object
literal, adding a field would break them, and the type could never grow in
1.x. Every known caller passes back the value `split` returned. Saying so in
the docs keeps room to record more framing later without a major release.

## Consequences

- Code that builds a `NoteShape` by hand may fail to compile after a minor
  release. That is documented, not a breaking change.
- To write a new note with no source, call `split('')` and use its shape.
