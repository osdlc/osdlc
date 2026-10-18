---
id: D-06
type: decision
state: accepted
created: 2026-10-18
---

# D-06: compositeOver and alpha rounding

## Decision

`compositeOver(src, ground)` blends in source-over with straight alpha and
rounds each channel to 8 bits. It does not round the alpha to 8 bits before
blending. Its result stays within one step per channel of what a Chromium
canvas paints.

## Why

- Chromium rounds the alpha to 8 bits and blends in integers, so some channels
  land one step away from an exact blend. Matching that exactly would copy an
  implementation detail of one browser.
- The contract test records canvas pixels and checks the difference is at most
  one step per channel.

## Consequences

A caller that needs the exact pixel of one browser reads it from a canvas.
Contrast checks are not sensitive to one step.
