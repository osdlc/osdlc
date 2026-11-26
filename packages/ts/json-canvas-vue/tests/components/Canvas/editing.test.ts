import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ICanvasContent, INode } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, nextTick } from 'vue'
import { canvasToClient } from './_test-helpers.ts'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

// Read from disk: Vitest turns every CSS import, `?raw` too, into ''.
const packageCss = readFileSync(resolve(import.meta.dirname, '../../../src/index.css'), 'utf8')

/**
 * Edits that must land in the emitted model exactly as they look on screen:
 * EditPanel updates, drags (including the ways a drag can end early), and
 * the per-board arrow markers.
 */

const mounted: { app: App; host: HTMLElement }[] = []

afterEach(() => {
  for (const m of mounted) {
    m.app.unmount()
    m.host.remove()
  }
  mounted.length = 0
})

function mount(canvasContent: ICanvasContent, props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const changes: ICanvasContent[] = []
  const app = createApp(JsonCanvas, {
    ...props,
    canvasContent: structuredClone(canvasContent),
    onChange: (content: ICanvasContent) => changes.push(content),
  })
  app.mount(host)
  mounted.push({ app, host })
  return { host, changes }
}

/** Poll until `condition` holds; throw naming `what` if it never does. */
async function waitFor(condition: () => boolean, what: string) {
  for (let i = 0; i < 50; i++) {
    if (condition()) return
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** Wait for the mount-time fit, so canvasToClient reads the final viewport. */
async function mountReady(canvasContent: ICanvasContent, props: Record<string, unknown> = {}) {
  const m = mount(canvasContent, props)
  await waitFor(() => m.host.querySelector('.vjc-wrapper .node') !== null, 'the nodes to render')
  await nextTick()
  return m
}

function nodeEl(host: HTMLElement, id: string) {
  return host.querySelector<HTMLElement>(`[id="${id}"]`)!
}

function press(host: HTMLElement, id: string, x: number, y: number, init: MouseEventInit = {}) {
  nodeEl(host, id).dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, ...canvasToClient(host, x, y), ...init }),
  )
}

function moveTo(host: HTMLElement, x: number, y: number) {
  window.dispatchEvent(new MouseEvent('pointermove', { ...canvasToClient(host, x, y) }))
}

function release(host: HTMLElement, x: number, y: number) {
  window.dispatchEvent(new MouseEvent('pointerup', { ...canvasToClient(host, x, y) }))
}

/** Select one node with a plain press and release at (x, y). */
async function select(host: HTMLElement, id: string, x: number, y: number) {
  press(host, id, x, y)
  release(host, x, y)
  await waitFor(() => host.querySelector('.edit-panel') !== null, 'the edit panel')
}

const lastNode = (changes: ICanvasContent[], id: string) =>
  changes.at(-1)!.nodes.find((n: INode) => n.id === id)!

const text = (id: string, x: number, extra: Partial<INode> = {}): INode =>
  ({ id, type: 'text', x, y: 0, width: 200, height: 100, text: id, ...extra }) as INode

describe('EditPanel updates', () => {
  it('clears a node color with the "No color" swatch', async () => {
    const { host, changes } = await mountReady({
      nodes: [text('a', 0, { color: '1' })],
      edges: [],
    })
    await select(host, 'a', 100, 50)

    host.querySelector<HTMLButtonElement>('.swatch-none')!.click()
    await nextTick()

    expect(changes.length).toBe(1)
    expect(lastNode(changes, 'a').color).toBeUndefined()
  })

  it('does not write a stale snapshot back over an edit made while the node stays selected', async () => {
    const { host, changes } = await mountReady({ nodes: [text('a', 0)], edges: [] })
    await select(host, 'a', 100, 50)

    nodeEl(host, 'a').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await waitFor(
      () => host.querySelector('[data-canvas-node-editor]') !== null,
      'the in-place editor',
    )
    const editor = host.querySelector<HTMLTextAreaElement>('[data-canvas-node-editor]')!
    editor.value = 'EDITED'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    editor.dispatchEvent(new FocusEvent('blur'))
    await waitFor(() => changes.length === 1, 'the text edit to commit')

    host.querySelector<HTMLButtonElement>('.swatch')!.click()
    await nextTick()

    expect(changes.length).toBe(2)
    expect(lastNode(changes, 'a')).toMatchObject({ text: 'EDITED', color: '1' })
  })

  it('keeps the expanded panel open across an edit to the selected node', async () => {
    const { host, changes } = await mountReady({ nodes: [text('a', 0)], edges: [] })
    await select(host, 'a', 100, 50)

    host.querySelector<HTMLButtonElement>('.more-btn')!.click()
    await nextTick()
    const picker = host.querySelector<HTMLInputElement>('.custom-color')!
    picker.value = '#ff0000'
    picker.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await nextTick()

    expect(changes.length).toBe(1)
    expect(host.querySelector('.expanded-section')).not.toBeNull()
  })

  it('collapses the expanded panel when the selection changes', async () => {
    const { host } = await mountReady({ nodes: [text('a', 0), text('b', 300)], edges: [] })
    await select(host, 'a', 100, 50)
    host.querySelector<HTMLButtonElement>('.more-btn')!.click()
    await nextTick()
    expect(host.querySelector('.expanded-section')).not.toBeNull()

    await select(host, 'b', 400, 50)
    await nextTick()

    expect(host.querySelector('.expanded-section')).toBeNull()
  })
})

describe('dragging nodes', () => {
  it('does not drag a node that a Ctrl-press just removed from the selection', async () => {
    const { host, changes } = await mountReady({
      nodes: [text('a', 0), text('b', 300), text('c', 600)],
      edges: [],
    })
    await select(host, 'a', 100, 50)
    press(host, 'b', 400, 50, { shiftKey: true })
    release(host, 400, 50)
    press(host, 'c', 700, 50, { shiftKey: true })
    release(host, 700, 50)

    // Ctrl-press on `c` deselects it, then the pointer keeps going.
    press(host, 'c', 700, 50, { ctrlKey: true })
    moveTo(host, 837, 50)
    release(host, 837, 50)
    await nextTick()

    // Whatever the gesture did, the screen and the model must agree.
    for (const [id, startX] of [
      ['a', 0],
      ['b', 300],
      ['c', 600],
    ] as const) {
      const modelX = changes.length > 0 ? lastNode(changes, id).x : startX
      expect(parseFloat(nodeEl(host, id).style.left), `node ${id}`).toBe(modelX)
    }
  })

  const GROUP_WITH_CHILD: ICanvasContent = {
    nodes: [
      { id: 'g', type: 'group', x: 0, y: 0, width: 400, height: 300 },
      { id: 'child', type: 'text', x: 100, y: 100, width: 200, height: 100, text: 'C' },
      text('solo', 600),
    ],
    edges: [],
  }

  it('does not snap a dragged group to its own children', async () => {
    const { host, changes } = await mountReady(GROUP_WITH_CHILD)

    // Press inside the group, clear of the child and the resize border.
    press(host, 'g', 50, 250)
    for (let step = 1; step <= 5; step++) moveTo(host, 50 + 4 * step, 250)
    release(host, 70, 250)
    await nextTick()

    expect(changes.length).toBe(1)
    expect(lastNode(changes, 'g').x).toBe(20)
    expect(lastNode(changes, 'child').x).toBe(120)
  })

  it("carries a selected group's children when another selected node is grabbed", async () => {
    const { host, changes } = await mountReady(GROUP_WITH_CHILD)
    await select(host, 'g', 50, 250)
    press(host, 'solo', 700, 50, { shiftKey: true })
    release(host, 700, 50)

    // Grab `solo`, not the group. Large enough to clear any snap.
    press(host, 'solo', 700, 50)
    moveTo(host, 700, 550)
    release(host, 700, 550)
    await nextTick()

    expect(changes.length).toBe(1)
    expect(lastNode(changes, 'g').y).toBe(500)
    expect(lastNode(changes, 'child').y).toBe(600)
    expect(parseFloat(nodeEl(host, 'child').style.top)).toBe(600)
  })

  for (const ending of ['pointercancel', 'window blur'] as const) {
    it(`commits a drag that ends in ${ending}`, async () => {
      const { host, changes } = await mountReady({ nodes: [text('a', 0)], edges: [] })
      press(host, 'a', 100, 50)
      moveTo(host, 200, 50)
      window.dispatchEvent(new Event(ending === 'pointercancel' ? 'pointercancel' : 'blur'))
      await nextTick()

      expect(parseFloat(nodeEl(host, 'a').style.left)).toBe(100)
      expect(changes.length).toBe(1)
      expect(lastNode(changes, 'a').x).toBe(100)
    })
  }
})

describe('edge arrow markers', () => {
  // Unlabeled: labels render through SVG `getBBox`, which jsdom lacks.
  const RED_EDGE: ICanvasContent = {
    nodes: [text('a', 0), text('b', 300)],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', color: '1' }],
  }

  it("points every board's arrows at a marker in its own defs, unique in the page", async () => {
    const first = await mountReady(RED_EDGE)
    const second = await mountReady(RED_EDGE)

    for (const { host } of [first, second]) {
      const path = host.querySelector<SVGPathElement>('.vjc-edge-paths path')!
      const markerId = path.getAttribute('marker-end')!.match(/^url\(#(.+)\)$/)![1]!
      const matches = document.querySelectorAll(`[id="${markerId}"]`)
      expect(matches.length).toBe(1)
      expect(host.querySelector('.vjc-edges defs')!.contains(matches[0]!)).toBe(true)
    }
  })

  it('colors each arrowhead like its edge, with the theme color for uncolored edges', async () => {
    const style = document.createElement('style')
    style.textContent = packageCss
    document.head.appendChild(style)
    try {
      const { host } = await mountReady(
        {
          nodes: [text('a', 0), text('b', 300), text('c', 600)],
          edges: [
            { id: 'red', fromNode: 'a', toNode: 'b', color: '1' },
            { id: 'plain', fromNode: 'b', toNode: 'c' },
          ],
        },
        { theme: 'dark' },
      )

      const polygons = [...host.querySelectorAll<SVGPathElement>('.vjc-edge-paths path')].map(
        (path) => {
          const id = path.getAttribute('marker-end')!.match(/^url\(#(.+)\)$/)![1]!
          return host.querySelector(`.vjc-edges defs [id="${id}"] polygon`)!
        },
      )
      expect(polygons).toHaveLength(2)
      // No package rule may override the marker's own `fill` attribute.
      for (const polygon of polygons) expect(getComputedStyle(polygon).fill).toBe('')
      // The uncolored edge takes the dark theme's --vjc-color-ui-3.
      expect(polygons[1]!.getAttribute('fill')).toBe('#b40e7a')
    } finally {
      style.remove()
    }
  })
})
