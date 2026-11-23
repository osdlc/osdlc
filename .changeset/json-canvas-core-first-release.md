---
'@osdlc/json-canvas-core': minor
---

First public release. `@osdlc/json-canvas-core` reads, validates and edits JSON Canvas documents
with no UI framework: the format's types, `validateCanvasData` for untrusted input, an immutable
operation engine (`executeOperation`, `executeBatch`) with `SnapshotHistory` for undo and redo,
geometry helpers, and `CanvasViewModel` for selection, pan and zoom.

- The package ships compiled `dist/` with declarations. It supports Node 22 or later and no longer
  claims to run under Bun.
- **Breaking:** `htmlToMarkdown`, `SampleDataset` and `validateCanvas` are removed. Use
  `validateCanvasData` in place of `validateCanvas`.
- **Breaking:** `success`, `failure` and `generateId` are no longer exported. Operations return their
  results, so a caller does not build them.
- **Breaking:** `getAnchorPoint` takes the structural type `PositionedBox` (exported), not an
  `HTMLElement`. An element with inline `left` and `top` still fits, and the declarations need no
  DOM library.
- **Breaking:** `RESIZE_CURSORS` is typed `Record<NonNullable<ResizeDirection>, string>`, not
  `Record<string, string>`.
- `ErrorCode` and `ValidationErrorCode` may gain values in a minor release, so give a `switch` over
  either a `default` branch.
- Every export has TSDoc. `HistoryEntry`, `SnapshotHistory.getEntries`, `SnapshotHistory.goToEntry`,
  `CanvasViewModel.getResizeDirectionForNode` and `CanvasViewModel.calculateSnapForDrag` are
  experimental; every other export is stable on the 0.x line. A test checks the README's Stability
  section against the `@experimental` tags.
- `validateCanvasData` no longer takes an array for a canvas.
- `normalizeCanvas` returns a canvas that already has both arrays as it is, so a caller can still
  compare it by identity.
- `getResizeDirection` caps the inward resize band at a quarter of the node's size, so a node at low
  zoom keeps a central area that drags.
- An id listed more than once in an operation's `nodeIds` counts once, so `moveNodes` moves a node
  once, `duplicateNodes` copies it once, and the minimum counts of `alignNodes`, `distributeNodes`
  and `matchNodeSize` use distinct ids.
- `SnapshotHistory.revertTo` and `goToEntry` fail with `INVALID_OPERATION` for a value that is not a
  whole number, such as `NaN` or `1.5`.
