# @osdlc/json-canvas-core

## 0.4.0

### Minor Changes

- 1a9e22a: First public release. `@osdlc/json-canvas-core` reads, validates and edits JSON Canvas documents
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
    whole number, such as `NaN` or `1.5`, or for a negative value.

## History before the first public release

These versions were never published. They are rebuilt from the git history. The first public
release is 0.4.0, which follows 0.3.1.

### [0.3.1] - 2026-11-22 (unpublished)

#### Fixed

- `validateCanvasData` no longer takes an array for a canvas.
- `normalizeCanvas` returns a canvas that already has both arrays as it is, so a caller can still
  compare it by identity.
- `getResizeDirection` caps the inward resize band at a quarter of the node's size, so a node at low
  zoom keeps a central area that drags.

### [0.3.0] - 2026-10-30 (unpublished)

#### Added

- `normalizeCanvas` fills in absent `nodes` and `edges`, which the JSON Canvas spec allows and
  `validateCanvasData` accepts, but `ICanvasContent` and every operation require.
- `CanvasViewModel` emits `canvasChange` when `setCanvas` swaps in a different canvas, so a listener
  can refresh `selectedNodes` and `selectedEdge` when the selected ids stay the same.

#### Changed

- Breaking: validation is stricter. `validateCanvasData` rejects non-finite `x`, `y`, `width` and
  `height` (such as JSON `1e999`) and `color: ""`, and `isValidColor("")` is false. `isValidCanvas`
  is false unless `nodes` and `edges` are both arrays, since it narrows to `ICanvasContent`, so
  `isValidCanvas({})` is now false. `validateCanvasData` still accepts them missing, as the spec
  allows.

#### Fixed

- `selectNode` and `selectNodes` with `addToSelection` now clear the selected edge.
- History skips operations that leave the canvas unchanged, so a no-op records no undo step and no
  longer clears redo.
- `getAnchorPoint` keeps fractional positions instead of truncating them.

### [0.2.0] - 2026-09-06 (unpublished)

#### Changed

- Breaking: operation validation is stricter and shared. `createNode` rejects non-finite or
  non-positive `x`, `y`, `width` and `height` that the model validator would reject, and `updateNode`
  derives the required fields from the node validator, so switching a node's type without supplying
  the new type's required field fails.

#### Fixed

- `updateNode` and `resizeNodes` accepted `NaN` and `Infinity` dimensions, and `updateNode` let an
  explicitly undefined field remove a property its node type requires.
- History `checkpoint()` and `revertTo` indices were invalidated by pruning; a checkpoint is now an
  opaque handle that keeps naming the same state.
- `SnapshotHistory.executeBatch` dropped all but the last operation's created ids.

### [0.1.5] - 2026-09-05 (unpublished)

#### Fixed

- An operation result carries `created` only when ids were created, instead of `created: undefined`.

### [0.1.4] - 2026-09-03 (unpublished)

#### Fixed

- `calculateSnap` returned guides for every matching target while the delta reflected only the last
  one.
- `CanvasViewModel.setCanvas` now reconciles the selection, so `selectedNodeIds` no longer exposes
  ids the new canvas does not contain.

### [0.1.3] - 2026-08-26 (unpublished)

#### Fixed

- `validateCanvasData` checks edges even when the canvas omits `nodes`.

### [0.1.2] - 2026-08-23 (unpublished)

#### Fixed

- Hardened the operation handlers against reading past the end of a node list. No change to the
  public API.

### [0.1.1] - 2026-08-22 (unpublished)

#### Changed

- The package entry pointed at TypeScript source instead of a built `dist/`.

### [0.1.0] - 2026-07-18 (unpublished)

#### Added

- Initial version: JSON Canvas types, validation, geometry and snapping, operations with snapshot
  history, and a view model.
