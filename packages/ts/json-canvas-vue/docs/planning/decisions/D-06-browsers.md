---
id: D-06
type: decision
state: accepted
created: 2026-11-22
---

# D-06: Supported browsers

## Decision

The board supports current Chromium, Firefox and Safari. The unit tests run in jsdom on Node 22.
Touch input and Safari are not tested.

## Why

- The package uses pointer events, `ResizeObserver` and SVG, which these browsers have shipped for
  years. It runs no program outside a browser.
- jsdom has no layout and no SVG measurement, so the tests stub the few calls that need them.
  Claiming a browser the suite never ran would be a promise nothing backs.

## Consequences

- A bug that appears only in Safari or with touch is in scope, and nothing prevents it from
  regressing. T-02 tracks a suite in a real browser.
- The declarations and the markdown functions load on Node. Nothing draws without a DOM.
