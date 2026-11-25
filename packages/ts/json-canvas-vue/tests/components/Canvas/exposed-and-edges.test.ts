import type { CanvasOperation, ICanvasContent, OperationResult } from '@osdlc/json-canvas-core'
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest'
import { type App, createApp, h, nextTick, reactive, ref } from 'vue'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

/**
 * Edges are painted by hand into the board's SVG, from the nodes' DOM boxes.
 * These cases pin what keeps that painting honest: the exposed methods redraw
 * it, a path is matched to its edge by id, and boards never read each other's
 * nodes. The exposed `undo` and `redo` obey `readonly`.
 */

interface Board {
  execute(operation: CanvasOperation): OperationResult
  executeBatch(operations: CanvasOperation[]): OperationResult
  undo(): void
  redo(): void
  fitToView(): void
}

const mounted: { app: App; host: HTMLElement }[] = []

beforeAll(() => {
  // jsdom implements no SVG layout; edge labels size their background from this.
  ;(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    ({ x: 0, y: 0, width: 40, height: 12 }) as DOMRect
})

afterAll(() => {
  delete (SVGElement.prototype as unknown as { getBBox?: unknown }).getBBox
})

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
})

const text = (id: string, x: number, y: number) =>
  ({ id, type: 'text', x, y, width: 200, height: 100, text: id }) as const

/** Mount a board, with a reactive `readonly` the test can flip. */
function mount(canvasContent: ICanvasContent) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const changes: ICanvasContent[] = []
  const board = ref<Board | null>(null)
  const props = reactive({ readonly: false })
  // One object, so a re-render that only flips `readonly` does not replace the board's content.
  const initial = structuredClone(canvasContent)
  const app = createApp({
    render: () =>
      h(JsonCanvas, {
        ref: board,
        canvasContent: initial,
        readonly: props.readonly,
        onChange: (next: ICanvasContent) => changes.push(next),
      }),
  })
  app.mount(host)
  mounted.push({ app, host })
  return { host, changes, props, board: () => board.value! }
}

const paths = (host: HTMLElement) => [
  ...host.querySelectorAll<SVGPathElement>('.vjc-edge-paths path'),
]

describe('the exposed execute and executeBatch', () => {
  it('redraw the edges after an edit made from outside', async () => {
    const { host, board } = mount({
      nodes: [text('a', 0, 0), text('b', 300, 0)],
      edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
    })
    await nextTick()
    const before = paths(host)[0]!.getAttribute('d')

    board().execute({ type: 'moveNodes', nodeIds: ['b'], deltaX: 0, deltaY: 400 })
    await nextTick()
    await nextTick()

    expect(paths(host)[0]!.getAttribute('d')).not.toBe(before)
  })

  it('draw an edge that the call creates', async () => {
    const { host, board } = mount({ nodes: [text('a', 0, 0), text('b', 300, 0)], edges: [] })
    await nextTick()
    expect(paths(host)).toHaveLength(0)

    board().executeBatch([{ type: 'createEdge', edge: { id: 'e', fromNode: 'a', toNode: 'b' } }])
    await nextTick()
    await nextTick()

    expect(paths(host)).toHaveLength(1)
  })

  it('leave the edges alone when the call fails', async () => {
    const { host, board, changes } = mount({
      nodes: [text('a', 0, 0), text('b', 300, 0)],
      edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
    })
    await nextTick()
    const [path] = paths(host)

    const result = board().execute({ type: 'deleteNodes', nodeIds: ['missing'] })
    await nextTick()

    expect(result.success).toBe(false)
    expect(changes).toEqual([])
    expect(paths(host)[0]).toBe(path)
  })
})

describe('the exposed undo and redo', () => {
  it('refuse while the board is read-only, and work again when it is not', async () => {
    const { host, board, changes, props } = mount({ nodes: [text('a', 0, 0)], edges: [] })
    await nextTick()
    board().execute({
      type: 'createNode',
      node: { type: 'text', x: 500, y: 0, width: 50, height: 50, text: '' },
    })
    await nextTick()
    expect(host.querySelectorAll('.vjc-nodes .node')).toHaveLength(2)
    expect(changes).toHaveLength(1)

    props.readonly = true
    await nextTick()
    board().undo()
    await nextTick()
    expect(host.querySelectorAll('.vjc-nodes .node')).toHaveLength(2)
    expect(changes).toHaveLength(1)

    props.readonly = false
    await nextTick()
    board().undo()
    await nextTick()
    expect(host.querySelectorAll('.vjc-nodes .node')).toHaveLength(1)
    expect(changes).toHaveLength(2)

    props.readonly = true
    await nextTick()
    board().redo()
    await nextTick()
    expect(host.querySelectorAll('.vjc-nodes .node')).toHaveLength(1)
    expect(changes).toHaveLength(2)

    props.readonly = false
    await nextTick()
    board().redo()
    await nextTick()
    expect(host.querySelectorAll('.vjc-nodes .node')).toHaveLength(2)
    expect(changes).toHaveLength(3)
  })
})

describe('an edge that cannot be drawn', () => {
  it('does not shift the edge a click selects', async () => {
    // `dangling` points at a node that is not there, so it has no path. The
    // one path on the board belongs to `real`, and a click must select that.
    const { host, changes } = mount({
      nodes: [text('a', 0, 0), text('b', 300, 0)],
      edges: [
        { id: 'dangling', fromNode: 'a', toNode: 'nowhere' },
        { id: 'real', fromNode: 'a', toNode: 'b' },
      ],
    })
    await nextTick()
    expect(paths(host)).toHaveLength(1)

    paths(host)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(paths(host)[0]!.classList.contains('is-selected')).toBe(true)

    host.querySelector<HTMLButtonElement>('.edit-panel button[title="Red"]')!.click()
    await nextTick()

    const edges = changes[0]!.edges
    expect(edges.find((e) => e.id === 'real')!.color).toBe('1')
    expect(edges.find((e) => e.id === 'dangling')!.color).toBeUndefined()
  })
})

describe('two boards on one page that share node ids', () => {
  const content = (dy: number): ICanvasContent => ({
    nodes: [text('a', 0, dy), text('b', 300, dy)],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
  })

  /** The edit panel's inline position after selecting the board's one edge. */
  async function panelPosition(host: HTMLElement): Promise<string> {
    paths(host)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    const panel = host.querySelector<HTMLElement>('.edit-panel')!
    return `${panel.style.left} ${panel.style.top}`
  }

  it('place the edit panel from their own nodes', async () => {
    const alone = mount(content(700))
    await nextTick()
    const expected = await panelPosition(alone.host)
    mounted.pop()!.app.unmount()
    alone.host.remove()

    // The first board holds same-id nodes somewhere else entirely.
    mount(content(0))
    const second = mount(content(700))
    await nextTick()

    expect(await panelPosition(second.host)).toBe(expected)
  })

  it('align the nodes of the board the menu belongs to', async () => {
    const first = mount({
      nodes: [text('a', 0, 0), text('b', 300, 200)],
      edges: [],
    })
    const second = mount({
      nodes: [text('a', 0, 0), text('b', 300, 200)],
      edges: [],
    })
    await nextTick()

    // Select both nodes of the second board, then align them left from its menu.
    const container = second.host.querySelector<HTMLElement>('.vjc-canvas-container')!
    container.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }))
    await nextTick()
    container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await nextTick()
    second.host
      .querySelector<HTMLButtonElement>('.context-menu button[title="Align left"]')!
      .click()
    await nextTick()

    const left = (host: HTMLElement, id: string) =>
      host.querySelector<HTMLElement>(`[id="${id}"]`)!.style.left
    expect(second.changes).toHaveLength(1)
    expect(left(second.host, 'b')).toBe('0px')
    expect(left(first.host, 'b')).toBe('300px')
    expect(first.changes).toEqual([])
  })
})
