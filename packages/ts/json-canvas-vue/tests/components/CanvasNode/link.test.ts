import type { ILinkNode } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type App, createApp } from 'vue'
import CanvasNode from '../../../src/components/CanvasNode/index.vue'

/**
 * A canvas file is untrusted input, so clicking a link node opens only
 * `http:`, `https:` and `mailto:` URLs.
 */

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
  vi.restoreAllMocks()
})

/** Mount a link node, click it, and return the spy on `window.open`. */
function click(url: string) {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const node: ILinkNode = { id: 'l', type: 'link', x: 0, y: 0, width: 200, height: 80, url }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(CanvasNode, { node, scale: 1, translateX: 1, translateY: 1 })
  app.mount(host)
  mounted = { app, host }
  host.querySelector<HTMLElement>('.node-link')!.click()
  return open
}

describe('a link node click', () => {
  it.each(['https://example.com/a?b=1', 'http://example.com', 'mailto:someone@example.com'])(
    'opens %s in a new tab without an opener',
    (url) => {
      expect(click(url).mock.calls).toEqual([[url, '_blank', 'noopener,noreferrer']])
    },
  )

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com',
    'not a url',
    '',
    '//example.com',
  ])('does nothing for %j', (url) => {
    expect(click(url)).not.toHaveBeenCalled()
  })
})
