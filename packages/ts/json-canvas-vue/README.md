# @osdlc/json-canvas-vue

A Vue 3 board for [JSON Canvas](https://jsoncanvas.org/) documents. It draws a
canvas and lets a person edit it: pan and zoom, move and resize nodes, draw
edges, edit text in place, undo and redo. The board holds no files and talks to
your app through one `change` event, so your app decides where a canvas is
loaded from and where it is saved.

## Why

An app that shows or edits `.canvas` files needs a surface that follows the
format, keeps an undo history, and does not trust the file it was given. This
package is that surface. The document model and the operations are in
[`@osdlc/json-canvas-core`](https://github.com/osdlc/osdlc/tree/main/packages/ts/json-canvas-core); this package draws
them in Vue and forwards the user's input.

It is for people who build a Vue 3 app that embeds a canvas, such as a notes
app, a documentation tool or a planning board. The format is the one Obsidian
Canvas writes to `.canvas` files.

When not to use it:

- To only read a canvas, a viewer is lighter. This package carries the editing
  code even when `readonly` is set.
- To edit a general graph that is not a JSON Canvas document, use a graph
  library. The board's model is the format's four node kinds and its edges.
- To draw a canvas outside Vue, use `@osdlc/json-canvas-core` with your own
  renderer.

## Install

```sh
npm install @osdlc/json-canvas-vue
```

`pnpm add @osdlc/json-canvas-vue` and `yarn add @osdlc/json-canvas-vue` work
too. Vue `^3.5` is a peer dependency. The package depends on
`@osdlc/json-canvas-core` and [DOMPurify](https://github.com/cure53/DOMPurify).

ESM only. Node.js 22 or later. The package ships compiled JavaScript and
declarations in `dist/`, so no bundler setting is needed for it.

The built JavaScript does not import CSS. Import the stylesheet once, where
your app starts:

```ts
import '@osdlc/json-canvas-vue/style.css'
```

The board needs it for its layout and its theme variables. In Nuxt, list it
under `css` in `nuxt.config`.

## Quick start

The board takes a canvas in `canvasContent` and emits `change` with the new
canvas after every committed edit. A change is an immutable snapshot: keep
the one you are given, and do not mutate the prop.

```ts
import { type ICanvasContent, JsonCanvas } from '@osdlc/json-canvas-vue'
import { createApp, h, ref } from 'vue'

const canvas: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Hello' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'World' },
  ],
  edges: [],
}

const changes: ICanvasContent[] = []
const board = ref<InstanceType<typeof JsonCanvas> | null>(null)

createApp({
  render: () =>
    h(JsonCanvas, {
      ref: board,
      canvasContent: canvas,
      onChange: (next: ICanvasContent) => changes.push(next),
    }),
}).mount('#app')

// The board edits through operations. Each one that succeeds emits `change`.
board.value!.execute({
  type: 'createNode',
  node: { type: 'text', x: 0, y: 200, width: 200, height: 100, text: 'New' },
})
expect(changes).toHaveLength(1)
expect(changes[0]!.nodes).toHaveLength(3)
```

In a template the same board is

```vue
<JsonCanvas :canvas-content="canvas" @change="save" />
```

The board fills its parent, so give the parent a height.

## The host contract

| Direction | What | Behaviour |
| --- | --- | --- |
| In | `canvasContent` prop | A value that is not the board's own last `change` payload replaces the board and clears its undo history. |
| Out | `change` event | Fires once per committed operation, undo, redo or history jump, with the new immutable canvas. It does not fire for a view change or a failed operation. |

A host that stores each `change` payload and passes it back as
`canvasContent` loops nowhere: the board recognises its own payload and keeps
its history. A payload kept in a `ref`, a `shallowRef` or a property of a
`reactive` object counts as the board's own, even though the host reads it back
as a reactive proxy. A copy of the payload is a different value and replaces
the board. A canvas that omits `nodes` or `edges` is accepted, as the format
allows; the board fills in the missing arrays.

An external replace while a text node is open for editing closes the editor and
keeps the new text. Text typed into that editor and not yet committed is
dropped.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `canvasContent` | `ICanvasContent` | an empty canvas | The document to draw. |
| `nodeComponents` | `NodeComponents` | none | Host components that draw the body of text, file and link nodes. |
| `theme` | `'light' \| 'dark'` | `'light'` | Selects the built-in palette. See Theming. |
| `readonly` | `boolean` | `false` | Draws the board and refuses every edit. |

## Exposed methods

Set a template ref on the board to call these. They are for a host that drives
the board from outside, such as a command palette or a toolbar of its own.

| Method | Does |
| --- | --- |
| `execute(operation)` | Runs one `CanvasOperation`. Returns an `OperationResult`, and emits `change` on success. |
| `executeBatch(operations)` | Runs several operations as one undo step. If one fails, none applies. |
| `undo()`, `redo()` | Step through the history. Each emits `change` when it moves. |
| `fitToView()` | Fits every node into the board. Emits nothing. |

`execute`, `executeBatch`, `undo` and `redo` refuse while `readonly` is set.
`execute` and `executeBatch` return a failed result with the code
`INVALID_OPERATION`; `undo` and `redo` do nothing.

```ts
const failed = board.value!.execute({ type: 'deleteNodes', nodeIds: ['missing'] })
expect(failed.success).toBe(false)
expect(!failed.success && failed.error.code).toBe('NODE_NOT_FOUND')
```

## Node components

`nodeComponents` replaces the body of a node kind with your own component. The
component receives the node as its `node` prop. The board keeps the node's
position, size, border, selection and drag. This is the place to draw a live
preview for a file node, for example.

```ts
import { defineComponent, h, type PropType } from 'vue'
import { type INode, type NodeComponents } from '@osdlc/json-canvas-vue'

// A host component takes the node as its `node` prop and draws the node's body.
// The board keeps the position, size, selection and drag.
const Shout = defineComponent({
  props: { node: { type: Object as PropType<INode>, required: true } },
  render() {
    return h('strong', { class: 'shout' }, this.node.type === 'text' ? this.node.text.toUpperCase() : '')
  },
})

const nodeComponents: NodeComponents = { text: Shout }
```

Pass it as `:node-components="nodeComponents"`. A kind you leave out keeps the
built-in body. Group nodes cannot be replaced.

## Read-only

`readonly` draws the board and refuses every edit. Panning, zooming and
fitting stay on. The editing chrome (toolbar, undo and redo buttons, edit
panel, context menu) is not drawn, and the keyboard shortcuts that edit are
off. The board's shortcuts are bound on `window`, so a board that is only
hidden with CSS would still delete nodes and take those chords from the app
around it.

## Markdown

Text nodes render through a `MarkdownRenderer`. The default is
`plainTextRenderer`: it escapes HTML and keeps whitespace, so a text node never
becomes markup until you ask for it. To render markdown, register a renderer
and make it active:

```ts
import { type MarkdownRenderer, registerMarkdownRenderer, setActiveRenderer } from '@osdlc/json-canvas-vue'

// A renderer turns markdown into HTML. It may return the HTML or a promise of it.
const shout: MarkdownRenderer = {
  id: 'shout',
  name: 'Shout',
  render: async (markdown) => `<p onclick="steal()">${markdown.toUpperCase()}</p>`,
}

registerMarkdownRenderer(shout)
setActiveRenderer('shout')
```

Every renderer's output goes through DOMPurify before it reaches the page,
unless the renderer sets `sanitized: true` to say it already did. The example
above loses its `onclick`. A renderer that sanitizes itself declares it, so the
output is not cleaned twice. DOMPurify needs a DOM: in a server render
`renderedMarkdown` rejects for a renderer that is not `sanitized`, and never
returns its output uncleaned.

A slow render never overwrites a newer one, and a renderer that rejects leaves
the node showing its escaped source. Replacing the active renderer under its
own id, switching renderers, or removing the active one draws the open nodes
again.

The registry is shared by every board on the page. A per-board renderer may
replace it before 1.0, so the registry functions are experimental.

## Untrusted canvas files

A canvas file is input from someone else. The board treats it that way:

- A click on a link node opens only `http:`, `https:` and `mailto:` URLs, in a
  new tab without an opener. Any other URL (`javascript:`, `data:`, a malformed
  URL) does nothing.
- Text goes through the markdown seam above. A renderer that is not marked
  `sanitized` has its output sanitized, and every element that keeps a `target`
  attribute gets `rel="noopener noreferrer"`.
- The default plain-text renderer fetches nothing. With a markdown renderer
  active, a text node can make the browser fetch: the sanitizer keeps images
  (including `srcset`), audio and video (including `poster`), inline styles
  with a `url()`, the `background` attribute of a table or a cell, SVG
  images, `<input type="image">`, links and forms.
  So `![](https://tracker.example/p.png)` requests that URL when the canvas
  opens. A host that must prevent that removes them in its renderer, or sets a
  Content-Security-Policy (`img-src`, `media-src` and `form-action`).
- A group node's background image URL, and the URL of a file node's content if
  your `nodeComponents` loads one, are fetched by the browser. A host that
  opens canvases it does not control should check those URLs first.

`validateCanvasData` checks a value of unknown shape and reports each problem
with a path. Run it before you hand a file to the board.

```ts
const input: unknown = JSON.parse(
  '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":100,"height":50,"text":"hi"}]}',
)

expect(validateCanvasData(input).valid).toBe(true) // the spec makes `edges` optional
expect(isValidCanvas(input)).toBe(false) // ICanvasContent needs both arrays

const canvas: ICanvasContent = normalizeCanvas(input as Partial<ICanvasContent>)
expect(canvas.edges).toEqual([])
```

## Theming

The board declares its colours and fonts as CSS variables on `.vjc-wrapper`.
Override them on that class or on a parent selector to match your app, or pass
`theme="dark"` for the built-in dark palette.

| Variable | Sets |
| --- | --- |
| `--vjc-font-content`, `--vjc-font-mono`, `--vjc-line-height` | Text fonts and line height. |
| `--vjc-color-bg-1`, `--vjc-color-bg-2` | The board surface and the panel surface. |
| `--vjc-color-tx-1`, `--vjc-color-tx-2` | Primary and secondary text. |
| `--vjc-color-ui-1`, `--vjc-color-ui-2`, `--vjc-color-ui-3` | Borders, controls, and the default edge colour. |
| `--vjc-color-ax-1` | The accent: selection outline and handles. |
| `--vjc-color-selection` | The marquee and selection fill. |
| `--vjc-color-node-bg`, `--vjc-color-node-border` | Node surface and border. |
| `--vjc-color-group-bg` | The fill of a group node. |
| `--vjc-z-edges`, `--vjc-z-nodes`, `--vjc-z-controls`, `--vjc-z-toolbar`, `--vjc-z-output`, `--vjc-z-panel`, `--vjc-z-guides`, `--vjc-z-marquee`, `--vjc-z-context-menu` | Stacking order inside the board's own stacking context. |

## The composable

`useCanvasOperations` is the board's state without the board: a reactive
canvas with `execute`, `executeBatch`, `undo`, `redo`, checkpoints and the undo
stack sizes. Use it to drive a canvas in a store, in a test, or beside a
different renderer.

```ts
const { canvas, execute, undo, redo, canUndo, canRedo } = useCanvasOperations({
  nodes: [],
  edges: [],
})

const result = execute({
  type: 'createNode',
  node: { type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hello' },
})
expect(result.success && result.created?.nodeIds?.length).toBe(1) // the generated id
expect(canvas.value.nodes.length).toBe(1)
expect(canUndo.value).toBe(true)

undo()
expect(canvas.value.nodes.length).toBe(0)
expect(canRedo.value).toBe(true)
redo()
```

## API

Each export has TSDoc in the declaration. Your editor shows it. Every export
comes from the package root, and the stylesheet is
`@osdlc/json-canvas-vue/style.css`.

| Area | Exports |
| --- | --- |
| Components | `JsonCanvas`, `CanvasNode`, `EditPanel`, `NodeComponents` |
| Markdown | `MarkdownRenderer`, `plainTextRenderer`, `renderedMarkdown`, `getRenderers`, `useRendererVersion`, `registerMarkdownRenderer`, `unregisterMarkdownRenderer`, `setActiveRenderer`, `getActiveRenderer`, `getActiveRendererId` |
| Composable | `useCanvasOperations`, `UseCanvasOperationsReturn` |
| Core types | `ICanvasContent`, `INode`, `ITextNode`, `IFileNode`, `ILinkNode`, `IGroupNode`, `IBaseNode`, `IEdge`, `NodeType`, `Direction`, `MarkerType`, `BackgroundStyle`, `PresetColor`, `CanvasOperation`, `OperationResult`, `OperationError`, `ErrorCode`, `CreatedIds`, `HistoryOptions`, `HistoryEntry`, `ValidationResult`, `ValidationError`, `ValidationErrorCode` |
| Core helpers | `isTextNode`, `isFileNode`, `isLinkNode`, `isGroupNode`, `Colors`, `resolveColor`, `isValidColor`, `isValidHexColor`, `isValidCanvas`, `normalizeCanvas`, `validateCanvasData`, `formatValidationErrors` |

The core types and helpers are re-exported from `@osdlc/json-canvas-core`, so a
host of the board needs one import. For geometry, the view model or the
operation engine itself, import the core.

## How it compares

- [`@type32/jsoncanvas-editor`](https://www.npmjs.com/package/@type32/jsoncanvas-editor)
  is a Vue and Nuxt editor for the same format, with snapping, alignment,
  undo, clipboard and PNG export. It builds on Nuxt UI and Tailwind (a peer
  dependency on `@nuxt/ui`). This package has no UI-kit requirement, keeps its
  model in a separate framework-free package, and offers `nodeComponents`, a
  sanitizing markdown seam and a `readonly` mode.
- [`@json-canvas-viewer/vue`](https://www.npmjs.com/package/@json-canvas-viewer/vue)
  and `json-canvas-viewer` show a canvas and document no editing. This package
  edits as well as shows.
- [`@osdlc/json-canvas-core`](https://github.com/osdlc/osdlc/tree/main/packages/ts/json-canvas-core) alone holds the
  model, validation and operations with no UI. Use it when you draw the canvas
  yourself. This package is that model with a Vue board on top.

## Stability

The package is 0.x, so any minor release may break the API. Within that, each
export is stable or experimental. A breaking change to a stable export is
listed in the CHANGELOG under "Breaking". Any release may change or remove an
experimental export or member.

The experimental exports of `@osdlc/json-canvas-vue`:

`CanvasNode`, `EditPanel`, `HistoryEntry`, `registerMarkdownRenderer`,
`unregisterMarkdownRenderer`, `setActiveRenderer`, `getActiveRenderer`,
`getActiveRendererId`

The experimental members of `@osdlc/json-canvas-vue`:

`UseCanvasOperationsReturn.historyEntries`, `UseCanvasOperationsReturn.goToHistoryEntry`

A test compares these lists with the `@experimental` tags in the source.
`CanvasNode` and `EditPanel` take props that mirror the board's own state, and
the renderer registry is shared by every board. `HistoryEntry` and the two
members follow the core, where they are experimental too.

In this example `mount` is the helper of `examples/panels.test.ts`: it mounts
the component with `createApp(component, props)` on a new element and returns
that element.

```ts
const host = mount(EditPanel, {
  selectedNodes: [node],
  'onUpdate:node': (next: INode) => updates.push(next),
})
host.querySelector<HTMLButtonElement>('button[title="Red"]')!.click()
// The payload is the whole node, never a patch.
expect(updates).toEqual([{ ...node, color: '1' }])
```

## Runtimes and platforms

The board runs in a browser: current Chromium, Firefox and Safari. The unit
tests run in jsdom on Node.js 22. Touch input and Safari are not tested. The
declarations and the markdown functions load on Node, which is how the package
checks run, but nothing draws without a DOM.

## Licence

`MIT OR Apache-2.0`, at your option. See [MIT](./LICENSE-MIT) and [Apache-2.0](./LICENSE-APACHE).
Parts of the board component, the node component and the stylesheet descend
from vue-json-canvas, under the MIT licence; see
[THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES).
