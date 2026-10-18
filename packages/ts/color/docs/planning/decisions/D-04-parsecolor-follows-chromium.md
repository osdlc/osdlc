---
id: D-04
type: decision
state: accepted
created: 2026-10-18
---

# D-04: parseColor follows Chromium's grammar

## Decision

- `parseColor` is strict. It throws on extra arguments (`rgb(1 2 3 4 5)`), on
  non-numeric text (`rgb(12abc 0 0)`), on commas mixed with spaces or a slash,
  and on the comma form with numbers and percentages mixed.
- It follows Chromium's grammar where Chromium rejects an input. It rejects
  `rgb(1 2 3 4)`, `rgb(100%, 0, 0)` and `color(srgb 1 0 0 0.5)`.
- It clamps channels to 0-255 and alpha to 0-1, for `rgb()`, `rgba()` and
  `color(srgb …)`. `rgb(300 0 0)` and `color(srgb 2 0 0)` both give `r` 255.

## Why

- A typo should not become a wrong contrast number. Reading the leading number
  of `12abc` or dropping extra arguments hides one.
- The tests compare `parseColor` with values recorded from headless Chromium,
  including the inputs it rejects. Matching the browser is the claim the
  package can check.
- A browser clamps `rgb()` when it computes the value. It keeps an
  out-of-range `color(srgb …)` as written, so the clamp there is this
  package's choice. A clamped colour is what the browser paints, which a
  canvas test checks.

## Consequences

An input a newer browser accepts, and that this package rejects, is a
feature request. It is not a bug.
