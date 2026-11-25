import {
  type ICanvasContent,
  type INode,
  JsonCanvas,
  type NodeComponents,
} from '@osdlc/json-canvas-vue'
import { afterEach, expect, test } from 'vitest'
import { type App, createApp, defineComponent, h, nextTick, type PropType } from 'vue'

const canvas: ICanvasContent = {
  nodes: [
    { id: 't', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'quiet' },
    { id: 'f', type: 'file', x: 300, y: 0, width: 200, height: 100, file: 'notes/plan.md' },
  ],
  edges: [],
}

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

// #region node-components
// A host component takes the node as its `node` prop and draws the node's body.
// The board keeps the position, size, selection and drag.
const Shout = defineComponent({
  props: { node: { type: Object as PropType<INode>, required: true } },
  render() {
    return h(
      'strong',
      { class: 'shout' },
      this.node.type === 'text' ? this.node.text.toUpperCase() : '',
    )
  },
})

const nodeComponents: NodeComponents = { text: Shout }
// #endregion node-components

test('nodeComponents replaces the body of its node type and leaves the others alone', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(JsonCanvas, { canvasContent: canvas, nodeComponents }) })
  app.mount(host)
  mounted = { app, host }
  await nextTick()

  expect(host.querySelector('#t .shout')?.textContent).toBe('QUIET')
  // The file node still draws its built-in card.
  expect(host.querySelector('#f .file-name')?.textContent?.trim()).toBe('plan.md')
})
