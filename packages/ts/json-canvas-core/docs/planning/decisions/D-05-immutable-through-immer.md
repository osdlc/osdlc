---
id: D-05
type: decision
state: accepted
created: 2026-11-22
---

# D-05: Canvases are immutable through immer

## Decision

An operation never changes the canvas it is given. Each handler edits a draft inside immer's
`produce`, and the result is a new canvas that shares every unchanged object with the old one. A
batch runs all its handlers inside one `produce`, so a failure part way leaves nothing applied.

## Alternatives

- Copy the whole canvas on each operation. Simple, but history then costs a full copy per step.
- Hand-written updates that spread each level. No dependency, but every handler repeats the
  bookkeeping and a missed copy is a silent bug.
- A mutable document class. The caller must copy to keep an undo state.

## Why

- Structural sharing makes snapshot history cheap: a step costs only what changed.
- Handlers read like plain mutation, and the guarantee that the input is untouched comes from one
  place.
- An operation that changes nothing returns the same canvas, which history uses to skip a no-op.

## Consequences

- `immer` is a runtime dependency.
- A canvas that comes out of an operation is frozen by immer. Copy it to edit it by hand.
