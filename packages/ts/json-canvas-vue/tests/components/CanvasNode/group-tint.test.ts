import type { IGroupNode } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp } from 'vue'
import CanvasNode from '../../../src/components/CanvasNode/index.vue'

/**
 * A colored group gets a translucent tint of its color. Hex colors may be
 * #RGB as well as #RRGGBB; the tint must be a valid CSS color for both, or
 * the browser drops the declaration and the group shows no tint.
 */

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

function tintOf(color: string): string {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const node: IGroupNode = { id: 'g', type: 'group', x: 0, y: 0, width: 200, height: 100, color }
  const app = createApp(CanvasNode, { node, scale: 1, translateX: 1, translateY: 1 })
  app.mount(host)
  mounted = { app, host }
  return host.querySelector<HTMLElement>('#g')!.style.backgroundColor
}

describe('group tint', () => {
  it('tints a #RGB group the same as its #RRGGBB form', () => {
    const long = tintOf('#ff0000')
    mounted?.app.unmount()
    mounted?.host.remove()
    mounted = null
    expect(long).not.toBe('')
    expect(tintOf('#f00')).toBe(long)
  })
})
