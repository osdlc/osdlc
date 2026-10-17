---
id: D-05
type: decision
state: accepted
created: 2026-10-17
---

# D-05: `splitLenient` returns `null` for no block

## Decision

`splitLenient(content)` keeps its signature. It returns a `LenientSplit`, or
`null` when the note has no block. Its TSDoc says how this differs from
`split`, which returns a result with `yaml: null`.

## Why

- `split` must return a `shape` and offsets even when there is no block, so
  that `compose` can add one. `splitLenient` keeps no framing and is for
  reading only, so `null` is the simplest "nothing here" for a reader.
- Many callers already use it as it is. Renaming the parameter or changing
  the result would cost them and gain little.

## Consequences

The two functions differ in how they report "no block". The README and the
TSDoc say so next to each other.
