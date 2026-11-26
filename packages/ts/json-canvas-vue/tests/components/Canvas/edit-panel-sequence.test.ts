import type { ICanvasContent, IEdge, INode } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, nextTick } from 'vue'
import { canvasToClient } from './_test-helpers.ts'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

/**
 * Edits made through the EditPanel, checked on the emitted snapshot:
 *
 * - Clearing an optional field ("No color") removes the key from the payload,
 *   so the board has to treat a missing key as "clear it".
 * - Two edits in a row on the same selection: the second payload is built
 *   from the selected object, which must already carry the first edit.
 */

const BOARD: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'A', color: '1' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'B' },
  ],
  // Unlabeled: labels render through SVG `getBBox`, which jsdom lacks.
  edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', color: '1' }],
}

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const changes: ICanvasContent[] = []
  const app = createApp(JsonCanvas, {
    canvasContent: structuredClone(BOARD),
    onChange: (content: ICanvasContent) => changes.push(content),
  })
  app.mount(host)
  mounted = { app, host }
  return { host, changes }
}

/** Poll rather than count ticks: what we wait on is the condition. */
async function waitFor(predicate: () => boolean, what: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await nextTick()
  }
  throw new Error(`timed out waiting for ${what}`)
}

function button(host: HTMLElement, title: string): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(`.edit-panel button[title="${title}"]`)
  if (!found) throw new Error(`no "${title}" button in the edit panel`)
  return found
}

async function selectEdge(host: HTMLElement) {
  await nextTick()
  host
    .querySelector<SVGPathElement>('.vjc-edge-paths path')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await waitFor(() => host.querySelector('.edit-panel') !== null, 'the edit panel to open')
}

async function selectNode(host: HTMLElement, id: string) {
  await nextTick()
  const at = canvasToClient(host, 100, 50)
  host
    .querySelector<HTMLElement>(`#${id}`)!
    .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...at }))
  window.dispatchEvent(new MouseEvent('pointerup', { ...at }))
  await waitFor(() => host.querySelector('.edit-panel') !== null, 'the edit panel to open')
}

function lastEdge(changes: ICanvasContent[]): IEdge {
  return changes.at(-1)!.edges.find((e) => e.id === 'e')!
}

function lastNode(changes: ICanvasContent[], id: string): INode {
  return changes.at(-1)!.nodes.find((n) => n.id === id)!
}

describe('the edit panel', () => {
  it('clears an edge color with "No color"', async () => {
    const { host, changes } = mount()
    await selectEdge(host)

    button(host, 'No color').click()
    await waitFor(() => changes.length > 0, 'a change after "No color"')
    expect(lastEdge(changes).color).toBeUndefined()
  })

  it('clears a node color with "No color"', async () => {
    const { host, changes } = mount()
    await selectNode(host, 'a')

    button(host, 'No color').click()
    await waitFor(() => changes.length > 0, 'a change after "No color"')
    expect(lastNode(changes, 'a').color).toBeUndefined()
  })

  it('keeps a color change when the next edit toggles an arrow', async () => {
    const { host, changes } = mount()
    await selectEdge(host)

    host.querySelector<HTMLButtonElement>('.edit-panel .swatch:nth-child(2)')!.click()
    await waitFor(() => changes.length === 1, 'a change after picking a color')
    const picked = lastEdge(changes).color
    expect(picked).not.toBe('1')

    button(host, 'More options').click()
    await waitFor(
      () => host.querySelector('.edit-panel button[title="End arrow"]') !== null,
      'the arrow toggles to show',
    )
    button(host, 'End arrow').click()
    await waitFor(() => changes.length === 2, 'a change after toggling the end arrow')
    expect(lastEdge(changes).color).toBe(picked)
  })
})
