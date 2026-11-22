---
id: T-02
type: task
state: open
created: 2026-11-22
---

# T-02: Test in a real browser

## Goal

The board's pointer, touch and layout behaviour is tested in Chromium, Firefox and WebKit.

## Today

The unit tests run in jsdom (see [D-06](../decisions/D-06-browsers.md)). jsdom has no layout and no
SVG measurement, so the tests stub `getBBox`, and they dispatch pointer events by hand. Touch input
and Safari are not tested.

## Approach

- [ ] Add a small page that mounts the board, and a browser test runner that drives it in the three
      engines.
- [ ] Cover drag, resize, edge drawing, in-place editing, zoom and fit, and a touch drag.
- [ ] Decide whether it runs in this repository's CI or on demand.

## Acceptance criteria

- [ ] The three engines pass the same suite.
- [ ] The README's browser statement says which engines the suite covers.
