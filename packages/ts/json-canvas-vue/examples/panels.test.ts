import { CanvasNode, EditPanel, type INode } from '@osdlc/json-canvas-vue'
import { afterEach, expect, test } from 'vitest'
import { type App, createApp, nextTick } from 'vue'

// `CanvasNode` and `EditPanel` are experimental: a host that replaces the
// board's chrome mounts them itself.

const node: INode = { id: 'n', type: 'text', x: 10, y: 20, width: 200, height: 100, text: 'hi' }

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

function mount(component: Parameters<typeof createApp>[0], props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(component, props)
  app.mount(host)
  mounted = { app, host }
  return host
}

test('CanvasNode draws one node at its position', () => {
  const host = mount(CanvasNode, { node, scale: 1, translateX: 0, translateY: 0 })
  const el = host.querySelector<HTMLElement>('#n')!
  expect([el.style.left, el.style.top, el.style.width]).toEqual(['10px', '20px', '200px'])
})

test('EditPanel emits the whole updated node when a colour is chosen', async () => {
  const updates: INode[] = []
  // #region edit-panel
  const host = mount(EditPanel, {
    selectedNodes: [node],
    'onUpdate:node': (next: INode) => updates.push(next),
  })
  host.querySelector<HTMLButtonElement>('button[title="Red"]')!.click()
  // The payload is the whole node, never a patch.
  expect(updates).toEqual([{ ...node, color: '1' }])
  // #endregion edit-panel
  await nextTick()
})
