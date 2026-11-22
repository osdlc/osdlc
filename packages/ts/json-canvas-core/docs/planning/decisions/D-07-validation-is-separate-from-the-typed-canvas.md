---
id: D-07
type: decision
state: accepted
created: 2026-11-22
---

# D-07: Validation is separate from the typed canvas

## Decision

- `validateCanvasData(unknown)` checks untrusted input against the JSON Canvas spec and reports every
  problem with a path and a code. It accepts a canvas with no `nodes` or no `edges`, as the spec
  does.
- `ICanvasContent` requires both arrays, and every operation takes one.
- `normalizeCanvas` joins the two: it fills in a missing array and returns a canvas that already has
  both as it is, so a caller can still compare it by identity.
- `isValidCanvas` is the type guard. It is stricter than `validateCanvasData`: it narrows only when
  both arrays are present.

## Why

- Input and the typed canvas have different promises. Input may be anything. The typed canvas lets
  every handler skip a check.
- Making the arrays optional in `ICanvasContent` would put a check in every handler and every
  caller. One function at the boundary costs less.

## Consequences

- A caller reads a file with `validateCanvasData`, passes the result through `normalizeCanvas` and
  then holds an `ICanvasContent`. The operations also refuse values the validator would reject, so a
  valid canvas stays valid.
