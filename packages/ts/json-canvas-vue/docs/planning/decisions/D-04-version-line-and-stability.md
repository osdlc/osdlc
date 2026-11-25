---
id: D-04
type: decision
state: accepted
created: 2026-11-22
---

# D-04: Version line and stability

## Decision

- The first public version is `0.7.0`, on the 0.x line.
- The unpublished history reached 0.6.0 under semver, with one bump per merged change and a minor
  bump for each breaking change. The CHANGELOG keeps that history, marked unpublished. The release
  is a minor bump over it because it removes exports and changes the shipped form.
- Every export is stable on the 0.x line, except these, which are experimental and may change in any
  release:
  - `CanvasNode` and `EditPanel`. Their props mirror the board's state. `EditPanel`'s event
    contract changed in 0.6.0.
  - `registerMarkdownRenderer`, `unregisterMarkdownRenderer`, `setActiveRenderer`,
    `getActiveRenderer` and `getActiveRendererId`, while the registry is module-wide.
  - `HistoryEntry`, and `UseCanvasOperationsReturn.historyEntries` and
    `UseCanvasOperationsReturn.goToHistoryEntry`, which follow the core's experimental history
    methods.
- A breaking change to a stable export ships only in a new 0.x minor release, with a CHANGELOG entry
  that starts with `Breaking`.
- The README lists the experimental items, and a test compares the list with the `@experimental`
  tags in the source.

## Why

- Three breaking changes landed in the 90 days before the first release, and the last is recent.
  0.x tells users the API can still move, and tiers tell them which parts are likely to.
- A tier per item, checked by a test, keeps the promise in step with the code.

## Consequences

- A user who depends on stable exports only can upgrade across patch releases and read the CHANGELOG
  for minor ones.
