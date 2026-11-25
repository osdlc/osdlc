import type { ICanvasContent, INode } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, nextTick } from 'vue'
import { canvasToClient } from './_test-helpers.ts'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

/**
 * The floating edit panel, driven through the real board: what it emits has
 * to land on the CURRENT node or edge, as one operation per user action.
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
  const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
  return { host, container, changes }
}

/** Poll rather than count ticks: what we wait on is the condition. */
async function waitFor(predicate: () => boolean, what: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`timed out waiting for ${what}`)
}

const TEXT = (id: string, x: number, y: number, extra: Partial<INode> = {}): INode =>
  ({ id, type: 'text', x, y, width: 200, height: 100, text: id, ...extra }) as INode

function pointer(host: HTMLElement, type: string, target: EventTarget, x: number, y: number) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...canvasToClient(host, x, y) }))
}

/** Press and release on a node, which selects it. */
async function clickNode(host: HTMLElement, id: string, x: number, y: number) {
  pointer(host, 'pointerdown', host.querySelector(`#${id}`)!, x, y)
  pointer(host, 'pointerup', window, x, y)
  await waitFor(() => host.querySelector('.edit-panel') !== null, 'the edit panel to open')
}

function panelButton(host: HTMLElement, title: string) {
  const button = host.querySelector<HTMLButtonElement>(`.edit-panel button[title="${title}"]`)
  if (!button) throw new Error(`no edit panel button titled ${title}`)
  return button
}

function nodeIn(content: ICanvasContent, id: string) {
  return content.nodes.find((n) => n.id === id)!
}

describe('clearing a property', () => {
  it('"No color" removes the color of a node', async () => {
    const { host, changes } = mount({ nodes: [TEXT('a', 0, 0, { color: '1' })], edges: [] })
    await nextTick()
    await clickNode(host, 'a', 100, 50)

    panelButton(host, 'No color').click()
    await nextTick()

    expect(changes.length).toBe(1)
    expect(nodeIn(changes[0]!, 'a').color).toBeUndefined()
  })

  it('"No color" removes the color of an edge', async () => {
    const { host, changes } = mount({
      nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0)],
      edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', color: '2' }],
    })
    await nextTick()
    host
      .querySelector('.vjc-edge-paths path')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => host.querySelector('.edit-panel') !== null, 'the edit panel to open')

    panelButton(host, 'No color').click()
    await nextTick()

    expect(changes.length).toBe(1)
    expect(changes[0]!.edges[0]!.color).toBeUndefined()
  })
})

describe('the panel edits the current item, not a stale copy', () => {
  it('a color set after a drag keeps the drag', async () => {
    const { host, changes } = mount({ nodes: [TEXT('a', 0, 0)], edges: [] })
    await nextTick()
    await clickNode(host, 'a', 100, 50)

    pointer(host, 'pointerdown', host.querySelector('#a')!, 100, 50)
    pointer(host, 'pointermove', window, 140, 70)
    await nextTick()
    pointer(host, 'pointerup', window, 140, 70)
    await nextTick()
    expect(changes.length).toBe(1)
    expect(nodeIn(changes[0]!, 'a').x).toBe(40)

    panelButton(host, 'Red').click()
    await nextTick()

    expect(changes.length).toBe(2)
    const a = nodeIn(changes[1]!, 'a')
    expect([a.x, a.y, a.color]).toEqual([40, 20, '1'])
  })

  it('a color set after an arrow toggle keeps the toggle', async () => {
    const { host, changes } = mount({
      nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0)],
      edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', toEnd: 'arrow' }],
    })
    await nextTick()
    host
      .querySelector('.vjc-edge-paths path')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => host.querySelector('.edit-panel') !== null, 'the edit panel to open')
    panelButton(host, 'More options').click()
    await waitFor(() => host.querySelector('.expanded-section') !== null, 'the panel to expand')

    panelButton(host, 'End arrow').click()
    await nextTick()
    expect(changes.at(-1)!.edges[0]!.toEnd).toBe('none')

    panelButton(host, 'Red').click()
    await nextTick()

    const edge = changes.at(-1)!.edges[0]!
    expect([edge.toEnd, edge.color]).toEqual(['none', '1'])
  })
})

describe('a color on a multi-selection', () => {
  it('is one change and one undo step', async () => {
    const { host, container, changes } = mount({
      nodes: [TEXT('a', 0, 0), TEXT('b', 300, 0), TEXT('c', 600, 0)],
      edges: [],
    })
    await nextTick()
    container.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))
    await waitFor(() => host.querySelector('.edit-panel') !== null, 'the edit panel to open')

    panelButton(host, 'Red').click()
    await nextTick()

    expect(changes.length).toBe(1)
    expect(changes[0]!.nodes.map((n) => n.color)).toEqual(['1', '1', '1'])

    host.querySelector<HTMLButtonElement>('.vjc-undo-btn')!.click()
    await nextTick()
    expect(changes.at(-1)!.nodes.map((n) => n.color)).toEqual([undefined, undefined, undefined])
  })
})

describe('the expanded panel', () => {
  it('stays open, with what was typed, while the board pans', async () => {
    const { host, container } = mount({
      nodes: [{ id: 'g', type: 'group', x: 0, y: 0, width: 400, height: 300 }],
      edges: [],
    })
    await nextTick()
    await clickNode(host, 'g', 350, 250)
    panelButton(host, 'More options').click()
    await waitFor(() => host.querySelector('.expanded-section') !== null, 'the panel to expand')
    const url = host.querySelector<HTMLInputElement>('.expanded-section input.text-input')!
    url.value = 'https://example.com/half-typ'
    url.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    // Drag the background: a pan of 100px.
    container.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }),
    )
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 105, clientY: 5 }))
    await nextTick()
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 105, clientY: 5 }))
    await nextTick()

    expect(host.querySelector('.expanded-section')).not.toBeNull()
    expect(host.querySelector<HTMLInputElement>('.expanded-section input.text-input')!.value).toBe(
      'https://example.com/half-typ',
    )
  })
})
