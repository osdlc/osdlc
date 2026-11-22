import { Colors, type ICanvasContent } from '@osdlc/json-canvas-core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { type App, createApp, nextTick } from 'vue'
import JsonCanvas from '../../../src/components/Canvas/index.vue'
import stylesheet from '../../../src/index.css?raw'

/**
 * How `drawEdges` paints: the colours it gives paths, arrowheads and labels
 * have to survive the package's own stylesheet, and a redraw must keep the
 * selected edge looking selected.
 *
 * The real `index.css` is loaded, because the bugs here are cascade bugs: a
 * presentation attribute loses to any stylesheet rule.
 */

const RED = Colors['1']

let style: HTMLStyleElement
let mounted: { app: App; host: HTMLElement } | null = null

beforeAll(() => {
  style = document.createElement('style')
  style.textContent = stylesheet
  document.head.appendChild(style)
  // jsdom implements no SVG layout; labels size their background from this.
  ;(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    ({ x: 0, y: 0, width: 40, height: 12 }) as DOMRect
})

afterAll(() => {
  style.remove()
  delete (SVGElement.prototype as unknown as { getBBox?: unknown }).getBBox
})

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

function mount(canvasContent: ICanvasContent) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(JsonCanvas, { canvasContent: structuredClone(canvasContent) })
  app.mount(host)
  mounted = { app, host }
  return { host }
}

const nodes: ICanvasContent['nodes'] = [
  { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'A' },
  { id: 'b', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'B' },
]

describe('edge colours', () => {
  it("an arrowhead takes its edge's colour", async () => {
    const { host } = mount({
      nodes,
      edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', color: '1' }],
    })
    await nextTick()

    const path = host.querySelector('.vjc-edge-paths path')!
    const markerId = path.getAttribute('marker-end')!.match(/#([^)]+)/)![1]!
    const polygon = host.querySelector(`[id="${markerId}"] polygon`)!
    expect(polygon.getAttribute('fill')).toBe(RED)
  })

  it("an uncoloured edge's arrowhead follows the theme's ui colour", async () => {
    const { host } = mount({
      nodes,
      edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b' }],
    })
    await nextTick()

    const path = host.querySelector('.vjc-edge-paths path')!
    const markerId = path.getAttribute('marker-end')!.match(/#([^)]+)/)![1]!
    const polygon = host.querySelector<SVGElement>(`[id="${markerId}"] polygon`)!
    // The package's `--vjc-color-ui-3`, resolved on the wrapper when the
    // marker is made (editing.test.ts pins the themed value); jsdom loads no
    // stylesheet here, so it falls back to the light theme's colour.
    expect(polygon.getAttribute('fill')).toBe('#5e0641')
  })

  it('each board on a page draws its arrowheads from its own markers', async () => {
    const content: ICanvasContent = {
      nodes,
      edges: [
        { id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b' },
        { id: 'f', fromNode: 'b', fromSide: 'left', toNode: 'a', color: '1' },
      ],
    }
    const first = mount(content)
    const secondHost = document.createElement('div')
    document.body.appendChild(secondHost)
    const second = createApp(JsonCanvas, { canvasContent: structuredClone(content) })
    second.mount(secondHost)
    try {
      await nextTick()
      // A marker is resolved by document-wide id. One board pointing at the
      // other's would take that board's theme, and lose its arrowheads
      // whenever that board redraws.
      for (const host of [first.host, secondHost]) {
        for (const path of host.querySelectorAll('.vjc-edge-paths path')) {
          const markerId = path.getAttribute('marker-end')!.match(/#([^)]+)/)![1]!
          expect(document.querySelectorAll(`[id="${markerId}"]`).length).toBe(1)
          expect(host.querySelector(`[id="${markerId}"]`)).not.toBeNull()
        }
      }
    } finally {
      second.unmount()
      secondHost.remove()
    }
  })

  it("a label takes its edge's colour", async () => {
    const { host } = mount({
      nodes,
      edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', color: '1', label: 'x' }],
    })
    await nextTick()

    const label = host.querySelector('.vjc-edge-labels .vjc-edge-label')!
    expect(getComputedStyle(label).fill).toBe(RED)
  })
})

describe('the selected edge', () => {
  it('stays highlighted through a redraw', async () => {
    const { host } = mount({
      nodes,
      edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b' }],
    })
    await nextTick()
    host
      .querySelector('.vjc-edge-paths path')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(host.querySelector('.vjc-edge-paths path')!.classList.contains('is-selected')).toBe(true)

    // Editing the edge redraws every path.
    host.querySelector<HTMLButtonElement>('.edit-panel button[title="Red"]')!.click()
    await nextTick()

    const path = host.querySelector('.vjc-edge-paths path')!
    expect(path.getAttribute('stroke')).toBe(RED)
    expect(path.classList.contains('is-selected')).toBe(true)
  })
})
