---
id: D-03
type: decision
state: accepted
created: 2026-11-22
---

# D-03: The API for the first release

## Decision

The first public release keeps the API of the unpublished 0.6.0 with these changes. The owner
confirmed them on 2026-11-24.

| Change | Why |
| --- | --- |
| `DatasetPanel` is removed. | A demo panel that lists sample datasets and imports a file. It is not part of embedding a board, and its props mirror the demo's state. |
| `ContextMenu` is no longer exported. The board still shows it. | Its props are the board's internal state (`visible`, `x`, `y`, `selectedNodes`), and no consumer mounts it. |
| `getAnchorPoint`, `sortNodesForRendering`, `MIN_SCALE`, `MAX_SCALE`, `ZOOM_SPEED`, `SampleDataset` and `validateCanvas` are no longer re-exported. | The first five are the board's own helpers, and a host that needs one imports `@osdlc/json-canvas-core`. `SampleDataset` and `validateCanvas` are gone from the core. Use `validateCanvasData`. |
| `HistoryEntry` is exported. | It appears in the return type of `useCanvasOperations`, so a user needs to name it. |
| `CanvasNode` and `EditPanel` stay exported and are `@experimental`. | A host that replaces the board's chrome needs them, but their props mirror the board's state. |
| The five markdown registry functions that select or change the module-wide registry are `@experimental`. | A per-board `renderer` prop may replace the registry before 1.0 (T-01). |
| The exposed `undo` and `redo` refuse while `readonly` is set. | The README says read-only refuses every edit, and `execute` and `executeBatch` already did. |
| A click on a link node opens only `http:`, `https:` and `mailto:` URLs. | A canvas file is untrusted input. Any other scheme, such as `javascript:`, did run before. |
| The package ships compiled `dist/` and supports Node only. | See [D-05](D-05-build-and-stylesheet.md). |

Every other export stays as it was. The tier of each is in
[D-04](D-04-version-line-and-stability.md).

## Fixes in the same release

- Two boards on one page that hold nodes with the same ids no longer read each other's nodes.
- The exposed `execute` and `executeBatch` redraw the edges, as `undo` and `redo` did.
- An edge that cannot be drawn no longer shifts which edge a later click selects. Each drawn path
  carries its edge's id.
- Replacing the active renderer under its own id re-renders the open nodes.

## Why

- No version was published, so removing an export breaks no installed program. The apps that use
  the package change in the same release.
- Each removal is an item that is not part of embedding a board, or one a caller should not depend
  on.

## Consequences

- A host that imported a removed item changes: `validateCanvas` becomes `validateCanvasData`, and
  the geometry helpers come from `@osdlc/json-canvas-core`.
