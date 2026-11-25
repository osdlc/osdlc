---
id: D-03
type: decision
state: accepted
created: 2026-11-22
---

# D-03: Version line and stability

## Decision

- The first public version is `0.4.0`, on the 0.x line.
- The unpublished history reached 0.3.1 under semver, with one bump per merged change and a minor
  bump for each breaking change. The CHANGELOG keeps that history, marked unpublished. The release
  is a minor bump over it because it removes exports and changes the shipped form.
- Every export is stable on the 0.x line, except these, which are experimental and may change in any
  release:
  - `HistoryEntry` and the history methods that return or take one, `SnapshotHistory.getEntries` and
    `SnapshotHistory.goToEntry`. The list is shaped for one panel, and the index scheme may change.
  - `CanvasViewModel.getResizeDirectionForNode` and `CanvasViewModel.calculateSnapForDrag`. They read
    configuration, and the snap rules are still being tuned.
- A breaking change to a stable export ships only in a new 0.x minor release, with a CHANGELOG entry
  that starts with `Breaking:`.
- The README lists the experimental items, and a test compares the list with the `@experimental`
  tags in the source.

## Why

- The package is young, and its last breaking change is recent. 0.x tells users the API can still
  move, and tiers tell them which parts are likely to.
- A tier per item, checked by a test, keeps the promise in step with the code.

## Consequences

- A user who depends on stable exports only can upgrade across patch releases and read the CHANGELOG
  for minor ones.
