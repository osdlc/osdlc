import type { ICanvasContent } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import { canvasToClient } from './_test-helpers.ts'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

/**
 * The component's host contract, tested end to end on a real mount:
 *
 * - OUTPUT — every committed operation (edit, undo, redo) emits `change`
 *   with the new immutable snapshot, and nothing else does.
 * - INPUT — a new `canvasContent` value replaces the board, while the
 *   component's own `change` payload echoed back through the binding is
 *   ignored (no history reset, no loop).
 * - In-place text editing — double-click opens a textarea on the raw
 *   markdown; blur commits an `updateNode`, Escape walks away.
 * - Edge creation — dragging a side anchor onto another node commits a
 *   `createEdge`.
 * - `nodeComponents` — a host component replaces the built-in body for its
 *   node type; the built-in rendering stays for the rest.
 */

const TWO_NODES: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'A' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'B' },
  ],
  // No labeled edges anywhere in this file: labels render through SVG
  // `getBBox`, which jsdom does not implement.
  edges: [],
}

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

/** Mount with plain props; `change` payloads land in the returned array. */
function mount(props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const changes: ICanvasContent[] = []
  const app = createApp(JsonCanvas, {
    canvasContent: structuredClone(TWO_NODES),
    onChange: (content: ICanvasContent) => changes.push(content),
    ...props,
  })
  app.mount(host)
  mounted = { app, host }
  const container = host.querySelector<HTMLElement>('.vjc-canvas-container')
  if (!container) throw new Error('canvas container did not render')
  return { host, container, changes }
}

function nodeCount(host: HTMLElement): number {
  return host.querySelectorAll('.vjc-nodes .node').length
}

function dblclick(el: Element, clientX = 10, clientY = 10) {
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX, clientY }))
}

describe('the change emit', () => {
  it('fires with the new snapshot on a committed operation', async () => {
    const { container, changes } = mount()

    dblclick(container)
    await nextTick()

    expect(changes.length).toBe(1)
    expect(changes[0]!.nodes.length).toBe(3)
  })

  it('fires on undo and redo, walking the snapshots', async () => {
    const { host, container, changes } = mount()
    dblclick(container)
    await nextTick()

    host.querySelector<HTMLButtonElement>('.vjc-undo-btn')!.click()
    await nextTick()
    expect(changes.length).toBe(2)
    expect(changes[1]!.nodes.length).toBe(2)

    host.querySelector<HTMLButtonElement>('.vjc-redo-btn')!.click()
    await nextTick()
    expect(changes.length).toBe(3)
    expect(changes[2]!.nodes.length).toBe(3)
  })

  it('never fires on a read-only board', async () => {
    const { container, changes } = mount({ readonly: true })

    dblclick(container)
    await nextTick()

    expect(changes.length).toBe(0)
  })
})

describe('the canvasContent prop', () => {
  function mountWithRef() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const content = shallowRef<ICanvasContent>(structuredClone(TWO_NODES))
    const changes: ICanvasContent[] = []
    const app = createApp({
      render: () =>
        h(JsonCanvas, {
          canvasContent: content.value,
          onChange: (next: ICanvasContent) => changes.push(next),
        }),
    })
    app.mount(host)
    mounted = { app, host }
    const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
    return { host, container, content, changes }
  }

  it('replaces the board on an external value', async () => {
    const { host, content } = mountWithRef()
    expect(nodeCount(host)).toBe(2)

    content.value = {
      nodes: [{ id: 'z', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Z' }],
      edges: [],
    }
    await nextTick()
    await nextTick()

    expect(nodeCount(host)).toBe(1)
    expect(host.querySelector('.node')!.id).toBe('z')
  })

  it('ignores its own change payload echoed back — history survives', async () => {
    const { host, container, content, changes } = mountWithRef()

    dblclick(container)
    await nextTick()
    expect(changes.length).toBe(1)

    // The host binds `:canvas-content` to what `@change` handed it.
    content.value = changes[0]!
    await nextTick()
    await nextTick()

    // A reset would have cleared the history and disabled undo.
    expect(nodeCount(host)).toBe(3)
    const undoBtn = host.querySelector<HTMLButtonElement>('.vjc-undo-btn')!
    expect(undoBtn.disabled).toBe(false)
  })
})

describe('in-place text editing', () => {
  it('double-click on a text node opens a textarea holding the raw markdown', async () => {
    const { host } = mount()

    dblclick(host.querySelector('#a')!)
    await nextTick()

    const editor = host.querySelector<HTMLTextAreaElement>('[data-canvas-node-editor]')
    expect(editor).not.toBeNull()
    expect(editor!.value).toBe('A')
  })

  it('blur commits the edit as an updateNode operation', async () => {
    const { host, changes } = mount()
    dblclick(host.querySelector('#a')!)
    await nextTick()

    const editor = host.querySelector<HTMLTextAreaElement>('[data-canvas-node-editor]')!
    editor.value = 'A, rewritten'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    editor.dispatchEvent(new FocusEvent('blur'))
    await nextTick()

    expect(host.querySelector('[data-canvas-node-editor]')).toBeNull()
    expect(changes.length).toBe(1)
    const node = changes[0]!.nodes.find((n) => n.id === 'a')
    expect(node && 'text' in node && node.text).toBe('A, rewritten')
  })

  it('Escape walks away without committing', async () => {
    const { host, changes } = mount()
    dblclick(host.querySelector('#a')!)
    await nextTick()

    const editor = host.querySelector<HTMLTextAreaElement>('[data-canvas-node-editor]')!
    editor.value = 'discarded'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(host.querySelector('[data-canvas-node-editor]')).toBeNull()
    expect(changes.length).toBe(0)
  })

  it('never opens on a read-only board', async () => {
    const { host } = mount({ readonly: true })

    dblclick(host.querySelector('#a')!)
    await nextTick()

    expect(host.querySelector('[data-canvas-node-editor]')).toBeNull()
  })
})

describe('edge creation', () => {
  it('dragging a side anchor onto another node commits a createEdge', async () => {
    const { host, changes } = mount()
    // Let the mount-time fit flush to the DOM before reading pan/scale.
    await nextTick()

    // Anchors render on every non-group node, one per side.
    const anchor = host.querySelector<HTMLElement>('#a [data-anchor-side="right"]')
    expect(anchor).not.toBeNull()

    anchor!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }))
    const over = canvasToClient(host, 400, 50) // inside node b
    window.dispatchEvent(new MouseEvent('pointermove', { ...over }))
    await nextTick()
    // The dashed draft path follows the pointer while drawing.
    expect(host.querySelector('.vjc-edge-draft')).not.toBeNull()

    window.dispatchEvent(new MouseEvent('pointerup', { ...over }))
    await nextTick()

    expect(changes.length).toBe(1)
    const edge = changes[0]!.edges[0]!
    expect(edge.fromNode).toBe('a')
    expect(edge.fromSide).toBe('right')
    expect(edge.toNode).toBe('b')
    expect(host.querySelector('.vjc-edge-draft')).toBeNull()
  })

  it('released over the background, the draft dissolves into nothing', async () => {
    const { host, changes } = mount()
    await nextTick()

    host
      .querySelector<HTMLElement>('#a [data-anchor-side="bottom"]')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    const nowhere = canvasToClient(host, -500, -500)
    window.dispatchEvent(new MouseEvent('pointermove', { ...nowhere }))
    window.dispatchEvent(new MouseEvent('pointerup', { ...nowhere }))
    await nextTick()

    expect(changes.length).toBe(0)
    expect(host.querySelector('.vjc-edge-draft')).toBeNull()
  })
})

describe('group drag', () => {
  const GROUP_AND_CHILD: ICanvasContent = {
    nodes: [
      { id: 'g', type: 'group', x: 0, y: 0, width: 400, height: 300 },
      { id: 'c', type: 'text', x: 50, y: 50, width: 100, height: 50, text: 'Child' },
    ],
    edges: [],
  }

  it('moves child nodes along with the group in the emitted change', async () => {
    const { host, changes } = mount({
      canvasContent: structuredClone(GROUP_AND_CHILD),
    })
    // Let the mount-time fit flush to the DOM before reading pan/scale.
    await nextTick()

    // Press inside the group but outside the child, well clear of the
    // resize-handle boundary on either node's edges.
    const start = canvasToClient(host, 300, 250)
    host
      .querySelector<HTMLElement>('#g')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...start }))

    const dx = 40
    const dy = 30
    const end = canvasToClient(host, 300 + dx, 250 + dy)
    window.dispatchEvent(new MouseEvent('pointermove', { ...end }))
    await nextTick()
    window.dispatchEvent(new MouseEvent('pointerup', { ...end }))
    await nextTick()

    expect(changes.length).toBe(1)
    const group = changes[0]!.nodes.find((n) => n.id === 'g')!
    const child = changes[0]!.nodes.find((n) => n.id === 'c')!
    expect(group.x).toBe(dx)
    expect(group.y).toBe(dy)
    expect(child.x).toBe(50 + dx)
    expect(child.y).toBe(50 + dy)
  })
})

describe('nodeComponents', () => {
  it('a host component replaces the built-in body for its node type only', () => {
    const TextBody = defineComponent({
      props: { node: { type: Object, required: true } },
      render() {
        return h('div', { class: 'custom-text' }, `custom:${this.node.id}`)
      },
    })
    const { host } = mount({
      canvasContent: {
        nodes: [
          ...structuredClone(TWO_NODES.nodes),
          {
            id: 'f',
            type: 'file',
            x: 0,
            y: 200,
            width: 200,
            height: 100,
            file: 'notes/Alpha.md',
          },
        ],
        edges: [],
      },
      nodeComponents: { text: TextBody },
    })

    // Text nodes render through the host component…
    expect(host.querySelectorAll('.custom-text').length).toBe(2)
    expect(host.querySelector('#a .custom-text')!.textContent).toBe('custom:a')
    expect(host.querySelector('#a .node-text')).toBeNull()
    // …and the file node keeps the built-in card (no file component given).
    expect(host.querySelector('#f .node-file')).not.toBeNull()
  })
})

/** Poll rather than count ticks: what we wait on is the condition. */
async function waitFor(predicate: () => boolean, what: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await nextTick()
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** Read the viewport the wrapper publishes: scale and pan. */
function viewport(host: HTMLElement) {
  const style = host.querySelector<HTMLElement>('.vjc-wrapper')!.getAttribute('style')!
  const varOf = (name: string) =>
    parseFloat(style.match(new RegExp(`${name}:\\s*(-?[\\d.]+)`))![1]!)
  return { scale: varOf('--scale'), panX: varOf('--pan-x'), panY: varOf('--pan-y') }
}

describe('a canvas the spec allows to omit nodes or edges', () => {
  /** Mount and collect every error Vue reports, instead of letting it throw. */
  function mountCollecting(canvasContent: unknown) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const errors: unknown[] = []
    const content = shallowRef(canvasContent)
    const app = createApp({
      render: () => h(JsonCanvas, { canvasContent: content.value as ICanvasContent }),
    })
    app.config.errorHandler = (err) => {
      errors.push(err)
    }
    app.mount(host)
    mounted = { app, host }
    return { host, errors, content }
  }

  it('mounts an empty object as an empty board', () => {
    const { host, errors } = mountCollecting({})
    expect(errors).toEqual([])
    expect(host.querySelector('.vjc-toolbar')).not.toBeNull()
    expect(nodeCount(host)).toBe(0)
  })

  it('mounts a nodes-only canvas with its nodes', async () => {
    const { host, errors } = mountCollecting({
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'A' }],
    })
    await nextTick()
    expect(errors).toEqual([])
    expect(nodeCount(host)).toBe(1)
  })

  it('accepts an external replace with an empty object', async () => {
    const { host, errors, content } = mountCollecting(structuredClone(TWO_NODES))
    content.value = {}
    await waitFor(() => nodeCount(host) === 0, 'the board to empty')
    await nextTick()
    expect(errors).toEqual([])
  })
})

describe('an external replace', () => {
  function mountReplaceable(initial: ICanvasContent) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const content = shallowRef<ICanvasContent>(structuredClone(initial))
    const changes: ICanvasContent[] = []
    const app = createApp({
      render: () =>
        h(JsonCanvas, {
          canvasContent: content.value,
          onChange: (next: ICanvasContent) => changes.push(next),
        }),
    })
    app.mount(host)
    mounted = { app, host }
    return { host, content, changes }
  }

  it('re-fits an untouched viewport to the new board', async () => {
    const { host, content } = mountReplaceable({
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'A' }],
      edges: [],
    })
    await nextTick()

    content.value = {
      nodes: [{ id: 'far', type: 'text', x: 20000, y: 20000, width: 200, height: 100, text: 'F' }],
      edges: [],
    }
    await waitFor(() => host.querySelector('#far') !== null, 'the new board to render')
    await nextTick()

    // jsdom gives the container no size, so the fit measures the window.
    const { scale, panX, panY } = viewport(host)
    expect(20100 * scale + panX).toBeCloseTo(window.innerWidth / 2)
    expect(20050 * scale + panY).toBeCloseTo(window.innerHeight / 2)
  })

  it('during an in-place edit does not write the stale draft back', async () => {
    const { host, content, changes } = mountReplaceable({
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'old text' }],
      edges: [],
    })
    await nextTick()
    dblclick(host.querySelector('#a')!)
    await nextTick()
    const editor = host.querySelector<HTMLTextAreaElement>('[data-canvas-node-editor]')!
    expect(editor).not.toBeNull()

    content.value = {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'EXTERNAL text' },
      ],
      edges: [],
    }
    await waitFor(
      () => host.querySelector('[data-canvas-node-editor]') === null,
      'the editor to close',
    )
    // Chromium fires `blur` on a focused element as it is removed; jsdom does
    // not, so the blur the unmount causes is dispatched by hand.
    editor.dispatchEvent(new FocusEvent('blur'))
    await nextTick()

    expect(changes.length).toBe(0)
    expect(host.querySelector('#a')!.textContent).toContain('EXTERNAL text')
  })
})

describe('the history panel', () => {
  it('does not emit change when the current entry is clicked', async () => {
    const { host, container, changes } = mount()
    dblclick(container)
    await nextTick()
    expect(changes.length).toBe(1)

    host.querySelector<HTMLButtonElement>('.vjc-history-panel .toggle-btn')!.click()
    await waitFor(
      () => host.querySelector('.history-entry.is-current') !== null,
      'the history list to open',
    )
    host.querySelector<HTMLElement>('.history-entry.is-current')!.click()
    await nextTick()

    expect(changes.length).toBe(1)
  })
})

describe('selection across an in-place edit', () => {
  it('keeps the selected outline after the edit commits', async () => {
    const { host } = mount()
    await nextTick()
    const a = host.querySelector<HTMLElement>('#a')!
    const at = canvasToClient(host, 100, 50)
    a.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...at }))
    window.dispatchEvent(new MouseEvent('pointerup', { ...at }))
    await nextTick()
    expect(a.classList.contains('is-selected')).toBe(true)

    dblclick(a)
    await nextTick()
    const editor = host.querySelector<HTMLTextAreaElement>('[data-canvas-node-editor]')!
    editor.value = 'A, rewritten'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    editor.dispatchEvent(new FocusEvent('blur'))
    await waitFor(
      () => host.querySelector('[data-canvas-node-editor]') === null,
      'the editor to close',
    )
    await nextTick()

    expect(host.querySelector('#a')!.classList.contains('is-selected')).toBe(true)
  })
})

describe('fit', () => {
  it('centres a board too wide for the minimum scale', async () => {
    const { host } = mount({
      canvasContent: {
        nodes: [
          { id: 'l', type: 'text', x: 10000, y: 0, width: 200, height: 100, text: 'L' },
          { id: 'r', type: 'text', x: 29800, y: 0, width: 200, height: 100, text: 'R' },
        ],
        edges: [],
      },
    })
    await nextTick()

    // Clamped to the minimum scale, and centred AT that scale.
    const { scale, panX } = viewport(host)
    expect(scale).toBeCloseTo(0.1)
    expect(20000 * scale + panX).toBeCloseTo(window.innerWidth / 2)
  })
})
