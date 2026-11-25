# @osdlc/json-canvas-vue

## 0.7.0

### Minor Changes

- 1a9e22a: First public release. `@osdlc/json-canvas-vue` is a Vue 3 board for JSON Canvas documents. It draws a
  canvas and edits it with pan and zoom, drag and resize, edge drawing, in-place text editing and undo
  and redo, over `@osdlc/json-canvas-core`. A host passes the document in `canvasContent` and stores
  what the `change` event reports. It can replace a node's body with its own component through
  `nodeComponents`, draw text through a sanitized markdown renderer, and set the board `readonly`.
  
  - The package ships compiled `dist/` with declarations. It supports Node 22 or later and no longer
    claims to run under Bun. The built JavaScript does not import CSS: import
    `@osdlc/json-canvas-vue/style.css` once. A Nuxt host no longer needs a `transpile` entry.
  - **Breaking:** `DatasetPanel` is removed. `ContextMenu` is no longer exported (the board still uses
    it).
  - **Breaking:** `getAnchorPoint`, `sortNodesForRendering`, `MIN_SCALE`, `MAX_SCALE`, `ZOOM_SPEED`,
    `SampleDataset` and `validateCanvas` are no longer re-exported. Import the first five from
    `@osdlc/json-canvas-core`, and use `validateCanvasData` in place of `validateCanvas`.
  - `HistoryEntry` is exported.
  - `CanvasNode`, `EditPanel`, `HistoryEntry`, `registerMarkdownRenderer`,
    `unregisterMarkdownRenderer`, `setActiveRenderer`, `getActiveRenderer`, `getActiveRendererId`,
    `UseCanvasOperationsReturn.historyEntries` and `UseCanvasOperationsReturn.goToHistoryEntry` are
    experimental; every other export is stable on the 0.x line. A test checks the README's Stability
    section against the `@experimental` tags. Every export has TSDoc.
  - **Breaking:** the exposed `undo` and `redo` refuse while `readonly` is set, as `execute` and
    `executeBatch` already did.
  - **Breaking:** a click on a link node opens only `http:`, `https:` and `mailto:` URLs. Any other URL
    does nothing.
  - Two boards on one page that hold nodes with the same ids no longer read each other's nodes.
  - The exposed `execute` and `executeBatch` redraw the edges.
  - An edge that cannot be drawn no longer shifts which edge a click selects.
  - Replacing the active markdown renderer under its own id re-renders the open nodes.
  - The README lists what a canvas file's group background, file URLs and rendered text make the
    browser fetch, for a host that opens canvases it does not control.
  - Markdown that the board sanitizes itself (a renderer not marked `sanitized`) gives every element
    that keeps a `target` attribute `rel="noopener noreferrer"`, the way a click on a link node opens
    its tab.
  - A `change` payload that the host keeps in a `ref` or a `reactive` object and passes back as
    `canvasContent` is still recognised as the board's own, so the history survives.
  - `renderedMarkdown` rejects when DOMPurify has no DOM to sanitize with and the renderer is not
    `sanitized`. In a window without the DOM that DOMPurify needs, it returned the renderer's output
    uncleaned.

### Patch Changes

- Updated dependencies [1a9e22a]
  - @osdlc/json-canvas-core@0.4.0

## History before the first public release

These versions were never published. They are rebuilt from the git history. The first public
release is 0.7.0, which follows 0.6.0.

### [0.6.0] - 2026-11-22 (unpublished)

A Vue 3 board for the [JSON Canvas](https://jsoncanvas.org/)
format: it renders and edits `.canvas` documents over `@osdlc/json-canvas-core`, with undo and
redo, a host contract (`change` out, `canvasContent` in), host-supplied node components, a
read-only mode and a pluggable markdown renderer.

#### Added

- `HistoryEntry` is exported, as the return type of `useCanvasOperations` names it.
- Every export has TSDoc. `CanvasNode`, `EditPanel`, `HistoryEntry`, the five markdown registry
  functions that select or change the registry, and the two history members of
  `UseCanvasOperationsReturn` are experimental. A test checks the README's Stability section
  against the `@experimental` tags.

#### Changed

- **Breaking:** the package ships compiled `dist/` with declarations, and `dist/style.css` as a
  stylesheet export. The built JavaScript does not import CSS: the host imports
  `@osdlc/json-canvas-vue/style.css` once. It supports Node 22 or later and no longer claims to run
  under Bun.
- **Breaking:** the package no longer exports `ContextMenu` (the board still uses it) or
  `DatasetPanel`, the demo panel for sample datasets and file import. It no longer re-exports
  `getAnchorPoint`, `sortNodesForRendering`, `MIN_SCALE`, `MAX_SCALE`, `ZOOM_SPEED`,
  `SampleDataset` or `validateCanvas`. Import the first five from `@osdlc/json-canvas-core`, and use
  `validateCanvasData` in place of `validateCanvas`.
- **Breaking:** the exposed `undo` and `redo` refuse while `readonly` is set, as `execute` and
  `executeBatch` already did.
- **Breaking:** a click on a link node opens only `http:`, `https:` and `mailto:` URLs. Any other
  URL does nothing.
- **Breaking for direct `EditPanel` users:** a colour click on a multi-selection now emits one
  `update:nodes` with every node, instead of one `update:node` per node. `JsonCanvas` commits it as
  one undo step and one `change`. A host that mounts `EditPanel` itself and listens only to
  `update:node` must also handle `update:nodes`. A single node still emits `update:node`.
- An external `canvasContent` replace during an in-place edit closes the editor and keeps the
  host's new text. Text typed into that editor and not yet committed is dropped.
- `vue` is a peer dependency at `^3.5`.

#### Fixed

- Two boards on one page that hold nodes with the same ids no longer read each other's nodes.
- The exposed `execute` and `executeBatch` redraw the edges.
- An edge that cannot be drawn no longer shifts which edge a click selects.
- Replacing the active markdown renderer under its own id re-renders the open nodes.
- The board keeps its shortcuts and wheel-pan after a click on its own buttons, and after a focused
  button of its own is removed or disabled. The wheel still scrolls the in-place editor, other text
  fields, and the History and JSON panels.
- Shortcuts leave a focused form field, editable content, or (for Space) a focused button inside
  the board alone.
- Ctrl+Shift+Z redoes, and letter chords work with Caps Lock on.
- `JsonCanvas` accepts a canvas that omits `nodes` or `edges`, as the spec allows.
- An external `canvasContent` replace re-fits an untouched viewport, and no longer writes an open
  in-place edit's stale draft back over the new text.
- Clicking the current history entry no longer emits `change`.
- Shift-marquee selection is the starting selection plus the current rectangle.
- Clicking an edge selects it, and a drag or Shift-drag that starts on an edge still pans or draws
  a marquee; an SVG icon in a node or the chrome is no longer the background; a right-click keeps
  the selection for the context menu, which now opens at the click, and a right-click on an
  unselected node selects it first. The middle button still pans, and a middle click no longer
  clears the selection.
- Fit centres a board that needs the minimum scale.
- Arrowheads and labels take their edge's colour, and a selected edge stays highlighted through a
  redraw.
- Edit panel: edits apply to the current node or edge rather than a stale copy; the expanded panel
  survives a pan and edits to the same selection, and collapses only when the selection changes.
- Group tint works with 3-digit hex colours; group background URLs with spaces or parentheses
  render.
- Drop import accepts upper-case `.CANVAS` and `.JSON` extensions.

### [0.5.1] - 2026-10-30 (unpublished)

#### Added

- `normalizeCanvas` is re-exported from `@osdlc/json-canvas-core`.

#### Fixed

- Clearing a colour, an edge label or a group background from the edit panel works.
- A Ctrl-press that deselects a node no longer drags it.
- `selectedNodes` and `selectedEdge` recompute after a content change, so a second edit panel edit
  no longer writes stale values back.
- `pointercancel` and window blur commit an open drag or resize.
- Group drags snap without the group's own children, and every selected group carries its
  children.
- Each board on a page uses its own arrowhead markers, and uncoloured arrowheads follow the theme.
- `DatasetPanel` imports a canvas that omits `nodes` or `edges` with both arrays filled in.

### [0.5.0] - 2026-10-22 (unpublished)

#### Changed

- **Breaking:** the package is named `@osdlc/json-canvas-vue`. Imports that used the earlier scope
  must change.

### [0.4.2] - 2026-09-06 (unpublished)

#### Fixed

- `selectedNodeIds` returns a fresh `ReadonlySet` on each selection change, so Vue observes the
  change.
- `readonly` is honoured when toggled after mount: the editing-gesture listeners check it per
  event.

### [0.4.1] - 2026-09-06 (unpublished)

#### Fixed

- `useCanvasOperations` internals simplified; no API change.

### [0.4.0] - 2026-09-03 (unpublished)

#### Added

- `MarkdownRenderer.render` may return a `string` or a `Promise<string>`, so an async pipeline can
  plug in; a slow earlier render never overwrites a newer one.
- New exports: `getActiveRenderer`, `plainTextRenderer`, `unregisterMarkdownRenderer`.

#### Changed

- **Breaking:** text nodes render as escaped plain text by default instead of through `marked`
  (default renderer id `plaintext`); register a renderer to get markdown.

#### Removed

- The `marked` dependency.

### [0.3.3] - 2026-09-02 (unpublished)

#### Fixed

- Resizing a node on a committed board no longer throws on every pointer move; hit tests follow
  paint order, so groups no longer capture clicks meant for nodes above them.

### [0.3.2] - 2026-08-26 (unpublished)

#### Fixed

- Dragging a group persists the new positions of its child nodes.

### [0.3.1] - 2026-08-23 (unpublished)

#### Fixed

- Edit panel: guards against a missing node or edge; no API change.

### [0.3.0] - 2026-08-22 (unpublished)

#### Added

- `JsonCanvas` emits `change` with the new immutable snapshot after every committed operation, and
  exposes `execute`, `executeBatch`, `undo`, `redo` and `fitToView`.
- A new `canvasContent` value replaces the board; the component's own `change` payload echoed back
  is recognised and ignored.
- In-place text editing (double-click a text node), and edge creation by dragging a node's side
  anchor onto another node.
- The `nodeComponents` prop: host components replace the built-in body per node type.
- `renderedMarkdown` sanitizes a renderer's output unless the renderer declares `sanitized: true`.
- The `theme` prop (`light` or `dark`) and `--vjc-color-node-bg`, `--vjc-color-node-border` and
  `--vjc-color-group-bg` variables.
- The board re-fits when its container resizes, while the viewport is untouched.

#### Removed

- **Breaking:** the `htmlToMarkdown` re-export.

### [0.2.0] - 2026-08-22 (unpublished)

#### Changed

- **Breaking:** the package ships its TypeScript and Vue source, with `exports` pointing at
  `src/`, instead of a bundled `dist/`; the UMD and CommonJS entries are gone.

### [0.1.1] - 2026-08-22 (unpublished)

#### Added

- The `readonly` prop: the board stays navigable but offers no editing.

### [0.1.0] - 2026-07-18 (unpublished)

#### Added

- Initial version: the `JsonCanvas`, `CanvasNode`, `ContextMenu`, `DatasetPanel` and `EditPanel`
  components, the markdown renderer registry, and the `useCanvasOperations` composable.
