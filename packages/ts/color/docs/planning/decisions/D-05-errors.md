---
id: D-05
type: decision
state: accepted
created: 2026-10-18
---

# D-05: Errors

## Decision

- There is no error class. Every message starts with `color:`.
- A parse failure is a plain `Error`. That covers `parseColor`,
  `contrastRatio` for a string side, and `fromPixel` for fewer than 4 entries.
- `mixColors` throws a `RangeError` when `amount` is `NaN` or infinite, and
  `withAlpha` does the same for `alpha`. A finite value outside 0-1 is
  clamped.
- `compositeOver` throws a `RangeError` when `ground.a` is below 1, or when
  `src.a` is `NaN` or infinite. A finite `src.a` outside 0-1 is clamped.
- Each function's TSDoc says when it throws, with `@throws`.

## Why

- A caller has one thing to do with a parse error: report it. A class adds an
  export that every caller must import to catch.
- `NaN` passed through to the result and became a wrong colour later. A
  throw at the call is easier to find.
- A translucent ground has no single painted pixel. The caller composites the
  ground over its own background first.

## Consequences

Adding an error class later is possible without a break, because the plain
`Error` and `RangeError` types stay valid.
