import { type ICanvasContent, JsonCanvas } from '@osdlc/json-canvas-vue'
import { afterEach, expect, test } from 'vitest'
import { type App, createApp, h, nextTick, ref, shallowRef } from 'vue'

// Edges are left out of these canvases: the board sizes an edge label from SVG
// layout, which jsdom does not implement.
const canvas: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Hello' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'World' },
  ],
  edges: [],
}

const mounted: { app: App; host: HTMLElement }[] = []

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
})

/** Mount a root component into the document and return the element it renders into. */
function mount(root: Parameters<typeof createApp>[0]): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(root)
  app.mount(host)
  mounted.push({ app, host })
  return host
}

const nodes = (host: HTMLElement) => host.querySelectorAll('.vjc-nodes .node')

test('the board renders the canvas it is given and reports each committed change', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)

  // #region quick-start
  const changes: ICanvasContent[] = []
  const board = ref<InstanceType<typeof JsonCanvas> | null>(null)

  createApp({
    render: () =>
      h(JsonCanvas, {
        ref: board,
        canvasContent: canvas,
        onChange: (next: ICanvasContent) => changes.push(next),
      }),
  }).mount(host)

  // The board edits through operations. Each one that succeeds emits `change`.
  board.value!.execute({
    type: 'createNode',
    node: { type: 'text', x: 0, y: 200, width: 200, height: 100, text: 'New' },
  })
  expect(changes).toHaveLength(1)
  expect(changes[0]!.nodes).toHaveLength(3)
  // #endregion quick-start

  await nextTick()
  expect(host.querySelectorAll('.vjc-nodes .node')).toHaveLength(3)
  host.remove()
})

test('a host that stores the change payload and passes it back loses no history', async () => {
  const content = shallowRef(canvas)
  const board = ref<InstanceType<typeof JsonCanvas> | null>(null)

  const host = mount({
    render: () =>
      h(JsonCanvas, {
        ref: board,
        canvasContent: content.value,
        onChange: (next: ICanvasContent) => {
          content.value = next
        },
      }),
  })
  await nextTick()

  board.value!.execute({ type: 'moveNodes', nodeIds: ['a'], deltaX: 50, deltaY: 0 })
  await nextTick()
  expect(content.value.nodes[0]!.x).toBe(50)

  // The echoed payload is recognised as the board's own, so undo still works.
  board.value!.undo()
  await nextTick()
  expect(content.value.nodes[0]!.x).toBe(0)
  expect(nodes(host)).toHaveLength(2)
})

test('a different canvas value replaces the board and clears its history', async () => {
  const content = shallowRef(canvas)
  const changes: ICanvasContent[] = []
  const board = ref<InstanceType<typeof JsonCanvas> | null>(null)
  const host = mount({
    render: () =>
      h(JsonCanvas, {
        ref: board,
        canvasContent: content.value,
        onChange: (next: ICanvasContent) => changes.push(next),
      }),
  })
  await nextTick()
  board.value!.execute({ type: 'moveNodes', nodeIds: ['a'], deltaX: 5, deltaY: 0 })
  expect(changes).toHaveLength(1)

  content.value = { nodes: [canvas.nodes[0]!], edges: [] }
  await nextTick()
  expect(nodes(host)).toHaveLength(1)

  // The move belongs to the old document: there is nothing left to undo.
  board.value!.undo()
  expect(changes).toHaveLength(1)
})

test('a canvas that omits nodes or edges is accepted', async () => {
  const host = mount({
    render: () => h(JsonCanvas, { canvasContent: { nodes: [canvas.nodes[0]!] } as ICanvasContent }),
  })
  await nextTick()
  expect(nodes(host)).toHaveLength(1)
})

test('the exposed methods run operations, step through history and refit the view', async () => {
  const changes: ICanvasContent[] = []
  const board = ref<InstanceType<typeof JsonCanvas> | null>(null)
  mount({
    render: () =>
      h(JsonCanvas, {
        ref: board,
        canvasContent: canvas,
        onChange: (next: ICanvasContent) => changes.push(next),
      }),
  })
  await nextTick()
  const exposed = board.value!

  // A failed operation returns its error, emits nothing and changes nothing.
  // #region failed-operation
  const failed = exposed.execute({ type: 'deleteNodes', nodeIds: ['missing'] })
  expect(failed.success).toBe(false)
  expect(!failed.success && failed.error.code).toBe('NODE_NOT_FOUND')
  // #endregion failed-operation
  expect(changes).toHaveLength(0)

  // A batch is one undo step.
  const batch = exposed.executeBatch([
    { type: 'moveNodes', nodeIds: ['a'], deltaX: 10, deltaY: 0 },
    { type: 'moveNodes', nodeIds: ['b'], deltaX: 10, deltaY: 0 },
  ])
  expect(batch.success).toBe(true)
  expect(changes).toHaveLength(1)

  exposed.undo()
  expect(changes).toHaveLength(2)
  expect(changes[1]!.nodes.map((n) => n.x)).toEqual([0, 300])

  exposed.redo()
  expect(changes).toHaveLength(3)
  expect(changes[2]!.nodes.map((n) => n.x)).toEqual([10, 310])

  // Fitting the view changes no content, so it emits nothing.
  exposed.fitToView()
  expect(changes).toHaveLength(3)
})

test('readonly: the board stays navigable, and every edit is refused', async () => {
  const changes: ICanvasContent[] = []
  const board = ref<InstanceType<typeof JsonCanvas> | null>(null)
  const host = mount({
    render: () =>
      h(JsonCanvas, {
        ref: board,
        canvasContent: canvas,
        readonly: true,
        onChange: (next: ICanvasContent) => changes.push(next),
      }),
  })
  await nextTick()

  const refused = board.value!.execute({ type: 'deleteNodes', nodeIds: ['a'] })
  expect(refused.success).toBe(false)
  expect(!refused.success && refused.error.code).toBe('INVALID_OPERATION')
  expect(changes).toHaveLength(0)
  expect(nodes(host)).toHaveLength(2)
  // No editing chrome: the toolbar and the undo and redo buttons are not drawn.
  expect(host.querySelector('.vjc-toolbar')).toBeNull()
  expect(host.querySelector('.vjc-undo-btn')).toBeNull()
})

test('theme="dark" applies the dark palette', async () => {
  const host = mount({ render: () => h(JsonCanvas, { canvasContent: canvas, theme: 'dark' }) })
  await nextTick()
  expect(host.querySelector('.vjc-wrapper')!.classList.contains('vjc-theme-dark')).toBe(true)
})
