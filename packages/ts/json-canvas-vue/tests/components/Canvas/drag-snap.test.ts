import type { ICanvasContent } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, nextTick } from 'vue'
import { canvasToClient } from './_test-helpers.ts'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

/**
 * Snapping during a node drag. A slow drag sends many small pointermoves;
 * the snap has to be worked out from where the drag started and how far the
 * pointer has gone in total, or a node that reaches a guide line can never
 * leave it again.
 */

// `b` is 100 wide; against `a` its left edge snaps at 200, 300 and 400.
const BOARD: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 300, y: 500, width: 100, height: 50, text: 'A' },
    { id: 'b', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'B' },
  ],
  edges: [],
}

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

/** Poll rather than count ticks: what we wait on is the condition. */
async function waitFor(predicate: () => boolean, what: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await nextTick()
  }
  throw new Error(`timed out waiting for ${what}`)
}

describe('dragging a node past a snap line', () => {
  it('follows the pointer once it is past the threshold, even in small steps', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const changes: ICanvasContent[] = []
    const app = createApp(JsonCanvas, {
      canvasContent: structuredClone(BOARD),
      onChange: (content: ICanvasContent) => changes.push(content),
    })
    app.mount(host)
    mounted = { app, host }
    await nextTick()

    const start = canvasToClient(host, 50, 25)
    host
      .querySelector<HTMLElement>('#b')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...start }))

    // 125 moves of 2 canvas units each: 250 in total, crossing the snap at 200.
    for (let step = 1; step <= 125; step++) {
      const at = canvasToClient(host, 50 + step * 2, 25)
      window.dispatchEvent(new MouseEvent('pointermove', { ...at }))
    }
    const end = canvasToClient(host, 50 + 250, 25)
    window.dispatchEvent(new MouseEvent('pointerup', { ...end }))
    await waitFor(() => changes.length > 0, 'the drag to emit `change`')

    expect(changes[0]!.nodes.find((n) => n.id === 'b')!.x).toBe(250)
  })
})

/**
 * Shift locks the drag to the axis with more movement. Positions are worked
 * out from the drag start, so the lock is relative to where the node started:
 * pressing Shift mid-drag puts the node back on its start line for the locked
 * axis, and releasing Shift puts it back under the pointer.
 */
describe('dragging a node with Shift held', () => {
  // Pointer targets chosen clear of every snap position against `a`.
  async function drag(moves: { x: number; y: number; shiftKey: boolean }[]) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const changes: ICanvasContent[] = []
    const app = createApp(JsonCanvas, {
      canvasContent: structuredClone(BOARD),
      onChange: (content: ICanvasContent) => changes.push(content),
    })
    app.mount(host)
    mounted = { app, host }
    await nextTick()

    const start = canvasToClient(host, 50, 25)
    host
      .querySelector<HTMLElement>('#b')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...start }))
    let last = start
    for (const move of moves) {
      last = canvasToClient(host, 50 + move.x, 25 + move.y)
      window.dispatchEvent(new MouseEvent('pointermove', { ...last, shiftKey: move.shiftKey }))
    }
    window.dispatchEvent(new MouseEvent('pointerup', { ...last }))
    await waitFor(() => changes.length > 0, 'the drag to emit `change`')
    return changes[0]!.nodes.find((n) => n.id === 'b')!
  }

  it('keeps the node on its start row when Shift is held from the start', async () => {
    const steps = Array.from({ length: 15 }, (_, i) => ({
      x: (i + 1) * 10,
      y: (i + 1) * 3,
      shiftKey: true,
    }))
    const b = await drag(steps)
    expect({ x: b.x, y: b.y }).toEqual({ x: 150, y: 0 })
  })

  it('locks relative to the drag start when Shift is pressed mid-drag', async () => {
    const b = await drag([
      { x: 100, y: 30, shiftKey: false },
      { x: 150, y: 40, shiftKey: true },
    ])
    expect({ x: b.x, y: b.y }).toEqual({ x: 150, y: 0 })
  })

  it('follows the pointer again once Shift is released', async () => {
    const b = await drag([
      { x: 100, y: 30, shiftKey: true },
      { x: 150, y: 40, shiftKey: false },
    ])
    expect({ x: b.x, y: b.y }).toEqual({ x: 150, y: 40 })
  })
})
