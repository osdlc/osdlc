import type { ICanvasContent } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, defineComponent, h, nextTick } from 'vue'
import { canvasToClient } from './_test-helpers.ts'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

/**
 * Pointer gestures that have to agree with the two things the board is made
 * of — the committed snapshot and what is actually painted:
 *
 * - Resize — every committed operation comes back from the core executor as
 *   a deeply frozen Immer snapshot, so the live resize preview may only
 *   touch the DOM. A write to the snapshot throws mid-gesture and the edges
 *   stop following the node.
 * - Hit testing — the template paints `sortNodesForRendering`, which hoists
 *   groups to the bottom. A gesture landing on a point must pick the node
 *   the user sees on top, not the last one in the raw array.
 */

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

function mount(canvasContent: ICanvasContent) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const changes: ICanvasContent[] = []
  const app = createApp(JsonCanvas, {
    canvasContent: structuredClone(canvasContent),
    onChange: (content: ICanvasContent) => changes.push(content),
  })
  app.mount(host)
  mounted = { app, host }
  return { host, changes }
}

describe('resizing a node on a committed board', () => {
  const TWO_NODES_ONE_EDGE: ICanvasContent = {
    nodes: [
      { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'A' },
      {
        id: 'b',
        type: 'text',
        x: 300,
        y: 0,
        width: 200,
        height: 100,
        text: 'B',
      },
    ],
    // Unlabeled: labels render through SVG `getBBox`, which jsdom lacks.
    edges: [{ id: 'e', fromNode: 'a', fromSide: 'left', toNode: 'b' }],
  }

  /** Commit one operation, so the board becomes a frozen Immer snapshot. */
  async function commitAnEdit(host: HTMLElement) {
    host.querySelector('#a')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextTick()
    const editor = host.querySelector<HTMLTextAreaElement>('[data-canvas-node-editor]')!
    editor.value = 'A, rewritten'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    editor.dispatchEvent(new FocusEvent('blur'))
    await nextTick()
  }

  it('drags the west edge without writing to the frozen snapshot, and the edges follow', async () => {
    const { host, changes } = mount(TWO_NODES_ONE_EDGE)
    await nextTick()
    await commitAnEdit(host)
    expect(changes.length).toBe(1)

    const edgePath = () =>
      host.querySelector<SVGPathElement>('.vjc-edge-paths path')!.getAttribute('d')
    const before = edgePath()

    // jsdom reports a listener exception as an `error` event on window;
    // cancelling it keeps the runner from re-reporting it as unhandled.
    const errors: string[] = []
    const onError = (e: ErrorEvent) => {
      errors.push(e.message)
      e.preventDefault()
    }
    window.addEventListener('error', onError)
    try {
      // Press the left edge of `a` (inside the resize boundary) and pull it
      // left — a west resize moves the node's origin, so its anchors move.
      const start = canvasToClient(host, 0, 50)
      host
        .querySelector<HTMLElement>('#a')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...start }))
      const end = canvasToClient(host, -60, 50)
      window.dispatchEvent(new MouseEvent('pointermove', { ...end }))
      await nextTick()
    } finally {
      window.removeEventListener('error', onError)
    }

    expect(errors).toEqual([])
    // `drawEdges()` runs at the tail of the resize branch: a throw before it
    // leaves the edge hanging where the node used to be.
    expect(edgePath()).not.toBe(before)
  })
})

describe('hit testing against paint order', () => {
  const GROUP_UNDER_NOTE: ICanvasContent = {
    nodes: [
      {
        id: 'src',
        type: 'text',
        x: 500,
        y: 0,
        width: 200,
        height: 100,
        text: 'Source',
      },
      {
        id: 'note',
        type: 'text',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        text: 'Note',
      },
      // Last in the array, but groups paint below everything else.
      { id: 'grp', type: 'group', x: -50, y: -50, width: 400, height: 300 },
    ],
    edges: [],
  }

  it('drops an edge on the node painted on top, not on the group beneath it', async () => {
    const { host, changes } = mount(GROUP_UNDER_NOTE)
    // Let the mount-time fit flush to the DOM before reading pan/scale.
    await nextTick()

    host
      .querySelector<HTMLElement>('#src [data-anchor-side="left"]')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

    // Dead centre of `note`, which sits over the group.
    const over = canvasToClient(host, 100, 50)
    window.dispatchEvent(new MouseEvent('pointermove', { ...over }))
    await nextTick()
    window.dispatchEvent(new MouseEvent('pointerup', { ...over }))
    await nextTick()

    expect(changes.length).toBe(1)
    expect(changes[0]!.edges[0]!.toNode).toBe('note')
  })
})

// ── Gesture helpers ─────────────────────────────────────────────────────────

/** Poll rather than count ticks: what we wait on is the condition. */
async function waitFor(predicate: () => boolean, what: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** Press `el` at a canvas point. */
function press(host: HTMLElement, el: Element, x: number, y: number, init: MouseEventInit = {}) {
  el.dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, ...canvasToClient(host, x, y), ...init }),
  )
}

function move(host: HTMLElement, x: number, y: number, init: MouseEventInit = {}) {
  window.dispatchEvent(new MouseEvent('pointermove', { ...canvasToClient(host, x, y), ...init }))
}

function release(host: HTMLElement, x: number, y: number, init: MouseEventInit = {}) {
  window.dispatchEvent(new MouseEvent('pointerup', { ...canvasToClient(host, x, y), ...init }))
}

/** Press and release on a node, which selects it. */
async function clickNode(
  host: HTMLElement,
  id: string,
  x: number,
  y: number,
  init: MouseEventInit = {},
) {
  press(host, host.querySelector(`#${id}`)!, x, y, init)
  release(host, x, y, init)
  await nextTick()
}

function selectedIds(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('.node.is-selected')].map((n) => n.id).sort()
}

function wrapperVar(host: HTMLElement, name: string): number {
  const style = host.querySelector<HTMLElement>('.vjc-wrapper')!.getAttribute('style')!
  const match = style.match(new RegExp(`${name}:\\s*(-?[\\d.]+)`))
  if (!match) throw new Error(`${name} not found in wrapper style: ${style}`)
  return parseFloat(match[1]!)
}

const panX = (host: HTMLElement) => wrapperVar(host, '--pan-x')
const scaleOf = (host: HTMLElement) => wrapperVar(host, '--scale')

function nodeIn(content: ICanvasContent, id: string) {
  return content.nodes.find((n) => n.id === id)!
}

/**
 * jsdom has no pointer capture. Record it on the container instead, so a test
 * can send the click where a browser would: to the capturing element when the
 * press captured, to the pressed element when it did not.
 */
function stubCapture(container: HTMLElement) {
  const state = { captured: false }
  Object.assign(container, {
    setPointerCapture: () => {
      state.captured = true
    },
    releasePointerCapture: () => {},
  })
  return state
}

/** A full click on `el`, routed the way pointer capture routes it. */
function browserClick(container: HTMLElement, el: Element) {
  const capture = stubCapture(container)
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
  const target = capture.captured ? container : el
  target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }))
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
}

const TEXT = (id: string, x: number, y: number, w = 200, h = 100) => ({
  id,
  type: 'text' as const,
  x,
  y,
  width: w,
  height: h,
  text: id,
})

describe('dragging a node', () => {
  it('moves slowly along an axis it is already aligned on', async () => {
    const { host, changes } = mount({ nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0)], edges: [] })
    await nextTick()

    press(host, host.querySelector('#a')!, 100, 50)
    for (let y = 53; y <= 170; y += 3) move(host, 100, y)
    await nextTick()
    release(host, 100, 170)
    await nextTick()

    expect(changes.length).toBe(1)
    expect(nodeIn(changes[0]!, 'a').y).toBe(120)
    expect(nodeIn(changes[0]!, 'a').x).toBe(0)
  })

  it('a group never snaps to its own children', async () => {
    const { host, changes } = mount({
      nodes: [
        { id: 'g', type: 'group', x: 0, y: 0, width: 400, height: 300 },
        TEXT('c', 100, 100, 200, 100),
      ],
      edges: [],
    })
    await nextTick()

    // 105 down puts the group's top 5px from the child's stale top.
    press(host, host.querySelector('#g')!, 350, 250)
    move(host, 350, 355)
    await nextTick()
    release(host, 350, 355)
    await nextTick()

    expect(changes.length).toBe(1)
    expect(nodeIn(changes[0]!, 'g').y).toBe(105)
    expect(nodeIn(changes[0]!, 'c').y).toBe(205)
  })

  it('a Ctrl-press that deselects the node does not drag it', async () => {
    const { host, changes } = mount({ nodes: [TEXT('a', 0, 0)], edges: [] })
    await nextTick()
    await clickNode(host, 'a', 100, 50)
    expect(selectedIds(host)).toEqual(['a'])

    press(host, host.querySelector('#a')!, 100, 50, { ctrlKey: true })
    move(host, 160, 50, { ctrlKey: true })
    await nextTick()
    release(host, 160, 50, { ctrlKey: true })
    await nextTick()

    expect(selectedIds(host)).toEqual([])
    expect(host.querySelector<HTMLElement>('#a')!.style.left).toBe('0px')
    expect(changes.length).toBe(0)
  })

  it('a Ctrl-press that deselects one node of several drags none of them', async () => {
    const { host, changes } = mount({ nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0)], edges: [] })
    await nextTick()
    await clickNode(host, 'a', 100, 50)
    await clickNode(host, 'b', 400, 50, { shiftKey: true })
    expect(selectedIds(host)).toEqual(['a', 'b'])

    press(host, host.querySelector('#a')!, 100, 50, { ctrlKey: true })
    move(host, 100, 110, { ctrlKey: true })
    await nextTick()
    release(host, 100, 110, { ctrlKey: true })
    await nextTick()

    expect(selectedIds(host)).toEqual(['b'])
    expect(host.querySelector<HTMLElement>('#b')!.style.top).toBe('0px')
    expect(changes.length).toBe(0)
  })

  it("takes a selected group's children along when another selected node is grabbed", async () => {
    const { host, changes } = mount({
      nodes: [
        { id: 'g', type: 'group', x: 0, y: 0, width: 400, height: 300 },
        TEXT('c', 100, 100, 200, 100),
        TEXT('n', 600, 0),
      ],
      edges: [],
    })
    await nextTick()
    await clickNode(host, 'g', 350, 250)
    press(host, host.querySelector('#n')!, 700, 50, { shiftKey: true })
    move(host, 700, 250)
    await nextTick()
    release(host, 700, 250)
    await nextTick()

    expect(changes.length).toBe(1)
    expect(nodeIn(changes[0]!, 'g').y).toBe(200)
    expect(nodeIn(changes[0]!, 'n').y).toBe(200)
    expect(nodeIn(changes[0]!, 'c').y).toBe(300)
  })

  it('a pointercancel mid-drag commits what the screen shows', async () => {
    const { host, changes } = mount({ nodes: [TEXT('a', 0, 0)], edges: [] })
    await nextTick()

    press(host, host.querySelector('#a')!, 100, 50)
    move(host, 400, 50)
    await nextTick()
    window.dispatchEvent(new MouseEvent('pointercancel'))
    await nextTick()

    expect(changes.length).toBe(1)
    expect(nodeIn(changes[0]!, 'a').x).toBe(300)
  })

  it('a pointercancel mid-resize commits what the screen shows', async () => {
    const { host, changes } = mount({ nodes: [TEXT('a', 0, 0)], edges: [] })
    // The text renders asynchronously, and that re-render rewrites the
    // node's inline geometry: let it land before the resize preview.
    await waitFor(() => host.querySelector('#a .node-text')!.innerHTML !== '', 'the text to render')

    // Press the east edge, inside the resize boundary. A browser renders
    // the selection the press made before the first move arrives.
    press(host, host.querySelector('#a')!, 199, 50)
    await nextTick()
    move(host, 299, 50)
    await nextTick()
    window.dispatchEvent(new MouseEvent('pointercancel'))
    await nextTick()

    expect(changes.length).toBe(1)
    expect(nodeIn(changes[0]!, 'a').width).toBe(300)
  })
})

describe('marquee selection', () => {
  it('drops a node the rectangle swept and then left', async () => {
    const { host } = mount({ nodes: [TEXT('a', 0, 0), TEXT('c', 500, 300)], edges: [] })
    await nextTick()
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!

    press(host, container, -50, -50, { shiftKey: true })
    move(host, 750, 450, { shiftKey: true })
    expect(selectedIds(host)).toEqual(['a', 'c'])
    move(host, 250, 150, { shiftKey: true })
    release(host, 250, 150, { shiftKey: true })
    await nextTick()

    expect(selectedIds(host)).toEqual(['a'])
  })

  it('keeps the selection that existed before the marquee began', async () => {
    const { host } = mount({
      nodes: [TEXT('a', 0, 0), TEXT('c', 500, 300), TEXT('d', 1000, 0)],
      edges: [],
    })
    await nextTick()
    await clickNode(host, 'd', 1100, 50)
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!

    press(host, container, -50, -50, { shiftKey: true })
    move(host, 750, 450, { shiftKey: true })
    move(host, 250, 150, { shiftKey: true })
    release(host, 250, 150, { shiftKey: true })
    await nextTick()

    expect(selectedIds(host)).toEqual(['a', 'd'])
  })
})

describe('what counts as the background', () => {
  const WITH_EDGE: ICanvasContent = {
    nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0)],
    edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left' }],
  }

  it('a click on an edge selects it', async () => {
    const { host } = mount(WITH_EDGE)
    await nextTick()
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!

    browserClick(container, host.querySelector('.vjc-edge-paths path')!)
    await nextTick()

    expect(host.querySelectorAll('.vjc-edge-paths path.is-selected').length).toBe(1)
  })

  it('a drag that starts on an edge pans the board', async () => {
    const { host } = mount(WITH_EDGE)
    await nextTick()
    const before = panX(host)

    press(host, host.querySelector('.vjc-edge-paths path')!, 250, 50)
    move(host, 250 + 100 / scaleOf(host), 50)
    release(host, 250 + 100 / scaleOf(host), 50)
    await nextTick()

    expect(panX(host)).toBeCloseTo(before + 100)
  })

  it('a Shift-drag that starts on an edge draws a marquee', async () => {
    const { host } = mount(WITH_EDGE)
    await nextTick()

    press(host, host.querySelector('.vjc-edge-paths path')!, 250, 50, { shiftKey: true })
    move(host, -50, -50, { shiftKey: true })
    release(host, -50, -50, { shiftKey: true })
    await nextTick()

    expect(selectedIds(host)).toEqual(['a'])
  })

  it('a middle-button drag on the background pans the board', async () => {
    const { host } = mount(WITH_EDGE)
    await nextTick()
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
    const before = panX(host)

    press(host, container, 250, 300, { button: 1 })
    move(host, 250 + 100 / scaleOf(host), 300, { button: 1 })
    release(host, 250 + 100 / scaleOf(host), 300, { button: 1 })
    await nextTick()

    expect(panX(host)).toBeCloseTo(before + 100)
  })

  it('a middle click on the background keeps the selection', async () => {
    const { host } = mount(WITH_EDGE)
    await nextTick()
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
    await clickNode(host, 'a', 100, 50)
    expect(selectedIds(host)).toEqual(['a'])

    press(host, container, 250, 300, { button: 1 })
    release(host, 250, 300, { button: 1 })
    await nextTick()

    expect(selectedIds(host)).toEqual(['a'])
  })

  it("a click on the undo button's icon undoes", async () => {
    const { host, changes } = mount({ nodes: [TEXT('a', 0, 0)], edges: [] })
    await nextTick()
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
    host.querySelector<HTMLButtonElement>('.vjc-toolbar .toolbar-btn')!.click()
    await nextTick()
    expect(changes.length).toBe(1)

    browserClick(container, host.querySelector('.vjc-undo-btn svg')!)
    await nextTick()

    expect(changes.length).toBe(2)
    expect(changes[1]!.nodes.length).toBe(1)
  })

  it('a node dragged by an SVG inside its body moves', async () => {
    const Body = defineComponent({
      render: () => h('div', [h('svg', { class: 'icon', width: 20, height: 20 })]),
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const changes: ICanvasContent[] = []
    const app = createApp(JsonCanvas, {
      canvasContent: { nodes: [TEXT('a', 0, 0)], edges: [] },
      nodeComponents: { text: Body },
      onChange: (content: ICanvasContent) => changes.push(content),
    })
    app.mount(host)
    mounted = { app, host }
    await nextTick()

    press(host, host.querySelector('#a svg.icon')!, 100, 50)
    move(host, 150, 50)
    await nextTick()
    release(host, 150, 50)
    await nextTick()

    expect(changes.length).toBe(1)
    expect(nodeIn(changes[0]!, 'a').x).toBe(50)
  })
})

describe('the context menu', () => {
  function selectAll(container: HTMLElement) {
    container.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))
  }

  it('a right-click on the background keeps the selection and opens the menu', async () => {
    const { host } = mount({ nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0)], edges: [] })
    await nextTick()
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
    selectAll(container)

    const at = { bubbles: true, button: 2, clientX: 10, clientY: 10 }
    container.dispatchEvent(new MouseEvent('pointerdown', at))
    window.dispatchEvent(new MouseEvent('pointerup', at))
    container.dispatchEvent(new MouseEvent('contextmenu', at))
    await nextTick()

    expect(selectedIds(host)).toEqual(['a', 'b'])
    expect(host.querySelector('.context-menu')).not.toBeNull()
  })

  it('a right-click on an unselected node selects it, opens the menu, and drags nothing', async () => {
    const { host, changes } = mount({ nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0)], edges: [] })
    await nextTick()
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
    await clickNode(host, 'a', 100, 50)
    expect(selectedIds(host)).toEqual(['a'])

    const b = host.querySelector<HTMLElement>('#b')!
    press(host, b, 400, 50, { button: 2 })
    move(host, 460, 50, { button: 2 })
    release(host, 460, 50, { button: 2 })
    container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }))
    await nextTick()

    expect(selectedIds(host)).toEqual(['b'])
    expect(host.querySelector('.context-menu')).not.toBeNull()
    expect(b.style.left).toBe('300px')
    expect(changes.length).toBe(0)
  })

  it('a right-click on a node inside the selection keeps the whole selection', async () => {
    const { host } = mount({ nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0)], edges: [] })
    await nextTick()
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
    selectAll(container)
    await nextTick()

    press(host, host.querySelector('#b')!, 400, 50, { button: 2 })
    release(host, 400, 50, { button: 2 })
    container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }))
    await nextTick()

    expect(selectedIds(host)).toEqual(['a', 'b'])
    expect(host.querySelector('.context-menu')).not.toBeNull()
  })

  it('opens at the click, measured from the board rather than the viewport', async () => {
    const { host } = mount({ nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0)], edges: [] })
    await nextTick()
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
    selectAll(container)
    // The board sits at (288, 8) in the viewport.
    container.getBoundingClientRect = () =>
      ({
        left: 288,
        top: 8,
        right: 1188,
        bottom: 608,
        width: 900,
        height: 600,
        x: 288,
        y: 8,
      }) as DOMRect

    container.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 510, clientY: 300 }),
    )
    await nextTick()

    const menu = host.querySelector<HTMLElement>('.context-menu')!
    expect(menu.style.left).toBe('222px')
    expect(menu.style.top).toBe('292px')
  })
})
