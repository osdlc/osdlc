import type { IGroupNode } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CanvasNode from '../../../src/components/CanvasNode/index.vue'

/**
 * A group node's inline style is built from strings out of the canvas file.
 * Each one has to come out as a declaration the browser accepts, or it is
 * dropped without a word.
 */

const group = (extra: Partial<IGroupNode>): IGroupNode => ({
  id: 'g',
  type: 'group',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  ...extra,
})

const props = (node: IGroupNode) => ({ node, scale: 1, translateX: 1, translateY: 1 })

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

function mount(node: IGroupNode): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(CanvasNode, props(node))
  app.mount(host)
  mounted = { app, host }
  return host.querySelector<HTMLElement>('.node')!
}

describe('group tint', () => {
  it('tints with a 3-digit hex colour', () => {
    const el = mount(group({ color: '#f00' }))
    expect(el.style.backgroundColor).toBe('rgba(255, 0, 0, 0.125)')
  })

  it('tints with a 6-digit hex colour', () => {
    const el = mount(group({ color: '#ff0000' }))
    expect(el.style.backgroundColor).toBe('rgba(255, 0, 0, 0.125)')
  })
})

describe('group background image', () => {
  // Server-rendered: jsdom's CSS parser rejects any url() holding a space or
  // a parenthesis, quoted or not, so the DOM cannot show the fixed value.
  async function backgroundOf(background: string): Promise<string> {
    const html = await renderToString(createSSRApp(CanvasNode, props(group({ background }))))
    const style = html.match(/style="([^"]*)"/)![1]!.replace(/&quot;/g, '"')
    return style.match(/background-image:(url\(.*?\));/)![1]!
  }

  it('quotes a path with spaces', async () => {
    expect(await backgroundOf('Attachments/My Image.png')).toBe('url("Attachments/My Image.png")')
  })

  it('quotes a URL with parentheses', async () => {
    expect(await backgroundOf('https://example.org/Foo_(bar).jpg')).toBe(
      'url("https://example.org/Foo_(bar).jpg")',
    )
  })

  it('escapes a quote inside the URL', async () => {
    expect(await backgroundOf('a"b.png')).toBe('url("a\\"b.png")')
  })
})
