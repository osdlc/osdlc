---
'@osdlc/json-canvas-vue': minor
---

First public release. `@osdlc/json-canvas-vue` is a Vue 3 board for JSON Canvas documents. It draws a
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
