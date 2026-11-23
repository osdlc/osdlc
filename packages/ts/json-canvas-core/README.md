# @osdlc/json-canvas-core

Read, validate and edit [JSON Canvas](https://jsoncanvas.org/) documents in
TypeScript, with no UI framework. It holds the format's types, a validator for
untrusted input, an immutable operation engine with undo and redo, geometry
helpers and a view model for selection, pan and zoom.

## Why

A canvas editor needs the same logic whatever draws it: check a file before
trusting it, change the document without breaking its rules (unique ids, edges
that point at real nodes, positive sizes), undo a change, and answer questions
such as which node is under the pointer. This package holds that logic once, so
a renderer only draws and forwards input.

It is for people who build a renderer, an editor or a tool on the format. The
format is the one Obsidian Canvas writes to `.canvas` files. `@osdlc/json-canvas-vue`
is a Vue 3 renderer built on this package; nothing here imports Vue.

When not to use it:

- To draw a canvas, use a renderer. This package computes positions and curves
  but draws nothing.
- To keep a mutable document object you edit in place, use a library built
  around one. Every operation here returns a new canvas and leaves its input
  alone.
- To read a `.canvas` file only, `JSON.parse` and `validateCanvasData` are
  enough; the rest of the package is for editing.

## Install

```sh
npm install @osdlc/json-canvas-core
```

`pnpm add @osdlc/json-canvas-core` and `yarn add @osdlc/json-canvas-core` work
too. The package depends on [immer](https://immerjs.github.io/immer/).

ESM only. Node.js 22 or later.

## Quick start

An operation takes a canvas and returns a result. It does not throw for a bad
request, and it never changes the canvas you pass in.

```ts
import { executeOperation } from '@osdlc/json-canvas-core'

const canvas = { nodes: [], edges: [] }

const result = executeOperation(canvas, {
  type: 'createNode',
  node: { type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hello' },
})
if (result.success) {
  result.canvas.nodes.length // 1
  result.created?.nodeIds.length // 1: the generated id
  canvas.nodes.length // 0: the input is never changed
}
```

A failure carries a code and a message:

```ts
import { executeOperation, type ICanvasContent } from '@osdlc/json-canvas-core'

const canvas: ICanvasContent = { nodes: [], edges: [] }

const result = executeOperation(canvas, { type: 'deleteNodes', nodeIds: ['missing'] })
if (!result.success) {
  result.error.code // 'NODE_NOT_FOUND'
  result.error.message // 'Node with ID "missing" not found'
}
```

## Validate untrusted input

`validateCanvasData` checks a value of unknown shape against the format. The
spec makes `nodes` and `edges` optional, so valid data is not yet an
`ICanvasContent`. Pass it through `normalizeCanvas` to get one.

```ts
import { formatValidationErrors, validateCanvasData } from '@osdlc/json-canvas-core'

const input: unknown = JSON.parse('{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":10}]}')

const result = validateCanvasData(input)
result.valid // false
result.errors[0]?.path // 'nodes[0].height'
result.errors[0]?.code // 'INVALID_TYPE'
formatValidationErrors(result) // ['[nodes[0].height] Node height must be a number', …]
```

```ts
import { isValidCanvas, normalizeCanvas, validateCanvasData } from '@osdlc/json-canvas-core'
import type { ICanvasContent } from '@osdlc/json-canvas-core'

const input: unknown = JSON.parse(
  '{"nodes":[{"id":"a","type":"link","x":0,"y":0,"width":10,"height":10,"url":"https://example.com"}]}',
)

validateCanvasData(input).valid // true: the spec lets `edges` be absent
isValidCanvas(input) // false: ICanvasContent needs both arrays

const canvas: ICanvasContent = normalizeCanvas(input as Partial<ICanvasContent>)
canvas.edges // []
```

Validation reports every problem it finds, not only the first. It rejects
non-finite numbers, non-positive sizes, empty ids, duplicate ids, an edge that
points at a missing node and a colour that is neither a preset (`'1'` to
`'6'`) nor a hex value.

## Operations

`executeOperation` runs one of 13 operation types: `createNode`, `deleteNodes`,
`updateNode`, `moveNodes`, `resizeNodes`, `alignNodes`, `distributeNodes`,
`matchNodeSize`, `duplicateNodes`, `createEdge`, `deleteEdges`, `updateEdge`
and `batch`. An operation that writes geometry refuses a value
`validateCanvasData` would reject, so no operation can make a canvas invalid.

`executeBatch` applies a list of operations as one. If any fails, none applies:

```ts
import { executeBatch, type ICanvasContent } from '@osdlc/json-canvas-core'

const canvas: ICanvasContent = { nodes: [], edges: [] }
const box = { type: 'text', x: 0, y: 0, width: 100, height: 50, text: '' } as const

const ok = executeBatch(canvas, [
  { type: 'createNode', node: { ...box, id: 'a' } },
  { type: 'createNode', node: { ...box, id: 'b', x: 300 } },
  { type: 'createEdge', edge: { fromNode: 'a', toNode: 'b' } },
])
if (ok.success) {
  ok.canvas.nodes.length // 2
  ok.created?.edgeIds?.length // 1
}

// The second operation fails, so the first one is not applied either.
const failed = executeBatch(canvas, [
  { type: 'createNode', node: { ...box, id: 'a' } },
  { type: 'createEdge', edge: { fromNode: 'a', toNode: 'nowhere' } },
])
failed.success // false
```

Deleting a node deletes the edges that touch it. Duplicating nodes copies the
nodes only, not the edges between them.

## Undo and redo

`SnapshotHistory` holds the current canvas and runs operations on it. Each
snapshot shares unchanged objects with the one before, so a long history costs
only what changed. An operation that changes nothing records no step and keeps
the redo stack.

```ts
import { SnapshotHistory } from '@osdlc/json-canvas-core'

const box = { type: 'text', x: 0, y: 0, width: 100, height: 50, text: '' } as const

const history = new SnapshotHistory({ nodes: [], edges: [] })

history.execute({ type: 'createNode', node: { ...box, id: 'a' } })
history.execute({ type: 'moveNodes', nodeIds: ['a'], deltaX: 50, deltaY: 0 })
history.current.nodes[0]?.x // 50

history.undo()
history.current.nodes[0]?.x // 0
history.canRedo() // true

history.redo()
history.current.nodes[0]?.x // 50
```

`checkpoint()` returns an opaque handle for the current state and `revertTo`
goes back to it. Treat the handle as a token: it is not an index. Pruning is
lazy: the undo stack can grow to `floor(1.2 × maxSize)` steps, and once it does
it is cut back to `maxSize` (500 by default). A checkpoint older than the oldest
step kept is refused.

## View model

`CanvasViewModel` holds the state a UI needs between operations: the canvas it
shows, the selection, the zoom scale and the pan offset. It emits
`selectionChange`, `viewportChange` and `canvasChange`. It does not edit the
canvas: run an operation, then pass the result to `setCanvas`.

```ts
import { CanvasViewModel, type ICanvasContent } from '@osdlc/json-canvas-core'

const canvas: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'a' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 100, height: 50, text: 'b' },
  ],
  edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
}

const view = new CanvasViewModel(canvas)
let changes = 0
view.on('selectionChange', () => changes++)

view.selectNode('a')
view.selectNodes(['b'], true) // add to the selection
view.selectedNodeIds // Set { 'a', 'b' }
view.selectNodesInRect({ x: -10, y: -10, width: 120, height: 80 }) // adds 'a' again
view.selectEdge('e') // clears the node selection
view.clearSelection()
```

## API

Each export has TSDoc in the declaration. Your editor shows it. Every export
comes from the package root.

| Area            | Exports                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format types    | `ICanvasContent`, `INode`, `ITextNode`, `IFileNode`, `ILinkNode`, `IGroupNode`, `IBaseNode`, `IEdge`, `NodeType`, `Direction`, `MarkerType`, `BackgroundStyle`, `PresetColor`                                                         |
| Node helpers    | `isTextNode`, `isFileNode`, `isLinkNode`, `isGroupNode`, `sortNodesForRendering`, `Colors`, `resolveColor`                                                                                                                           |
| Validation      | `validateCanvasData`, `isValidCanvas`, `normalizeCanvas`, `formatValidationErrors`, `isValidColor`, `isValidHexColor`, `ValidationResult`, `ValidationError`, `ValidationErrorCode`                                                   |
| Operations      | `executeOperation`, `executeBatch`, `isOperationError`, `CanvasOperation`, `OperationType`, `OperationResult`, `OperationError`, `ErrorCode`, `CreatedIds`, one `...Operation` type per operation, `NewNode`, `NodeUpdate` and friends |
| History         | `SnapshotHistory`, `HistoryOptions`, `HistoryEntry`                                                                                                                                                                                  |
| Geometry        | `getBoundingBoxFromNodes`, `getBoundingBoxFromRects`, `pointInRect`, `rectIntersectsRect`, `nodeIntersectsRect`, `getAnchorPointFromBounds`, `getAnchorPoint`, `bezierPoint`, `bezierMidpoint`, `calculateControlPoints`, `calculateSnap`, `getResizeDirection`, `RESIZE_CURSORS` |
| View model      | `CanvasViewModel`, `DEFAULT_CONFIG`, `mergeConfig`, `MIN_SCALE`, `MAX_SCALE`, `ZOOM_SPEED`, `ViewModelConfig`, `ViewModelEvent`, `ViewportState`, `SelectionState`                                                                   |

`getAnchorPoint` reads a positioned element, such as a browser's `HTMLElement`
with inline `left` and `top`. It takes the structural type `PositionedBox`, so
it needs no DOM types to compile. Outside a browser, use
`getAnchorPointFromBounds`.

```ts
import { getAnchorPoint } from '@osdlc/json-canvas-core'

// In a browser, pass an HTMLElement with inline `left` and `top`. Any object of this shape works.
const element = { style: { left: '100px', top: '50px' }, offsetWidth: 80, offsetHeight: 40 }

getAnchorPoint(element, 'right') // { x: 182, y: 70 }: 2 units outside, so arrowheads show
```

`ErrorCode` and `ValidationErrorCode` may gain values in a minor release.
Give a `switch` over either a `default` branch.

The interfaces keep the `I` prefix (`ICanvasContent`, `INode`, `IEdge`), as the
package has always named them. See
[D-09](docs/planning/decisions/D-09-interface-names-keep-the-i-prefix.md).

## How it compares

- [@trbn/jsoncanvas](https://www.npmjs.com/package/@trbn/jsoncanvas) gives
  the format's types and a mutable document class. It is archived
  since March 2024. This package keeps the document a plain value, validates
  untrusted input and adds an operation engine with history.
- [system-canvas](https://www.npmjs.com/package/system-canvas) is a renderer
  with viewport math. It has no validator, operation engine or history. This
  package draws nothing, so the two answer different questions.
- [json-canvas-viewer](https://www.npmjs.com/package/json-canvas-viewer) is a
  viewer for a canvas. It reads and shows a document; this package edits one.

## Stability

The package is 0.x, so any minor release may break the API. Within that, each
export is stable or experimental. A breaking change to a stable export is
listed in the CHANGELOG under "Breaking". Any release may change or remove an
experimental export or member.

The experimental exports of `@osdlc/json-canvas-core`:

`HistoryEntry`

The experimental members of `@osdlc/json-canvas-core`:

`SnapshotHistory.getEntries`, `SnapshotHistory.goToEntry`,
`CanvasViewModel.getResizeDirectionForNode`, `CanvasViewModel.calculateSnapForDrag`

A test compares these lists with the `@experimental` tags in the source.

```ts
import { CanvasViewModel, type ICanvasContent } from '@osdlc/json-canvas-core'

const canvas: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'a' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 100, height: 50, text: 'b' },
  ],
  edges: [],
}

const view = new CanvasViewModel(canvas).selectNode('a')

view.getResizeDirectionForNode({ x: 99, y: 49 }, canvas.nodes[0]!) // 'se'
// Dragging 'a' 195 right: it snaps 5 further, against the left edge of 'b'.
view.calculateSnapForDrag(195, 0).dx // 200
```

## Runtimes and platforms

Any JavaScript runtime with ES2022, ESM only. The package runs no program and
reads no path, so it runs on any operating system. `getAnchorPoint` needs
positioned elements, such as a browser's. Its tests run on Node.js 22, 24 and
26.

## Licence

`MIT OR Apache-2.0`, at your option. See [MIT](./LICENSE-MIT) and [Apache-2.0](./LICENSE-APACHE).
The anchor-point helper, the canvas types and the zoom constants descend from
vue-json-canvas, under the MIT licence; see
[THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES).
