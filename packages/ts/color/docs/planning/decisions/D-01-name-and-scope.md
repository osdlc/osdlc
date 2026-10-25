---
id: D-01
type: decision
state: accepted
created: 2026-10-18
---

# D-01: Name and scope

## Decision

- The package is `@osdlc/color`, published to npm from this repository,
  `packages/ts/color`.
- It does one job: colour arithmetic in sRGB for checking contrast. It reads
  hex, `rgb()`, `rgba()` and `color(srgb …)` strings, mixes and composites
  colours, and gives WCAG 2 relative luminance and contrast. It also gives the
  sRGB distance between two colours, so a tool can pick the nearest colour of
  a fixed palette without its own colour arithmetic. It does not read
  named colours, `hsl()` or other colour spaces, and it does not convert
  between spaces.

## Why

- The inputs are what a browser reports for a computed colour, so the
  package reads those and nothing more. A small closed scope is easy to test
  against a real browser.
- Libraries such as culori cover far more. This package exists for the 8-bit
  painted pixel, 0-255 channels, and errors on bad input.

## Consequences

- A request for named colours, `hsl()` or another colour space belongs in a
  different package.
- APCA and other contrast models are out of scope.
