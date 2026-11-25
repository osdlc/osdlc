import { type ICanvasContent, MIN_SCALE } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, nextTick } from 'vue'
import { canvasToClient } from './_test-helpers.ts'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

/**
 * Fit-to-view on mount. Content far larger than the viewport needs a scale
 * below MIN_SCALE, which the view model clamps; the pan has to be worked out
 * from the scale actually applied, or the content lands off-screen.
 */

// 30000 wide: fitting it into jsdom's 1024px window needs a scale of ~0.033.
const HUGE: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 50000, y: 0, width: 100, height: 100, text: 'A' },
    { id: 'b', type: 'text', x: 79900, y: 0, width: 100, height: 100, text: 'B' },
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

describe('fit-to-view', () => {
  it('centres content that needs more than the minimum zoom-out', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(JsonCanvas, { canvasContent: structuredClone(HUGE) })
    app.mount(host)
    mounted = { app, host }
    const scaleOf = () =>
      Number(
        host
          .querySelector('.vjc-wrapper')
          ?.getAttribute('style')
          ?.match(/--scale:\s*([\d.]+)/)?.[1],
      )
    await waitFor(() => scaleOf() === MIN_SCALE, 'the fit to clamp the scale to MIN_SCALE')

    // The centre of the content's bounding box lands on the viewport centre.
    const centre = canvasToClient(host, 65000, 50)
    expect(centre.clientX).toBeCloseTo(window.innerWidth / 2)
    expect(centre.clientY).toBeCloseTo(window.innerHeight / 2)
  })
})
