import type { ICanvasContent } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, defineComponent, h, nextTick, ref } from 'vue'
import { canvasToClient } from './_test-helpers.ts'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

/**
 * The `readonly` prop, tested where it actually has to hold: on the DOM.
 *
 * The editing surfaces this covers are not reachable from the composables —
 * they are `window` keydown listeners and container listeners registered in
 * `onMounted`, which is exactly why hiding the toolbar in host CSS did not
 * make the board read-only. So these mount the component for real (jsdom) and
 * drive it with events.
 *
 * Every case is paired with the same case on a default (editable) board. A
 * "nothing happened" assertion on its own passes just as well when the event
 * never arrived, and the pair is what rules that out.
 */

const TWO_NODES: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'A' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'B' },
  ],
  // No edges: `drawEdges` renders labels through SVG `getBBox`, which jsdom
  // does not implement. Edges are not what this file is about.
  edges: [],
}

let mounted: { app: App; host: HTMLElement } | null = null

/** Mount at a fixed `readonly`, for the cases that never flip it. */
function mount(readonly: boolean) {
  const { host, container } = mountToggling(readonly)
  return { host, container }
}

afterEach(() => {
  // Unmount rather than just dropping the node: the component registers
  // `window` listeners and only `onUnmounted` aborts them, and a leaked
  // keydown listener would make the next case answer for the previous one.
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

function nodeCount(host: HTMLElement): number {
  return host.querySelectorAll('.vjc-nodes .node').length
}

/** A press that the component's `isBackground` test accepts. */
function background(container: HTMLElement, type: string) {
  container.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10 }))
}

function chord(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

describe('a read-only canvas', () => {
  it('is not a tab stop, and shows no editing chrome', () => {
    const { host, container } = mount(true)

    expect(container.getAttribute('tabindex')).toBe('-1')
    expect(host.querySelector('.vjc-toolbar')).toBeNull()
    expect(host.querySelector('.vjc-undo-btn')).toBeNull()
    expect(host.querySelector('.vjc-redo-btn')).toBeNull()

    // The zoom group is not editing chrome and stays: reading a board still
    // means moving around it.
    expect(host.querySelector('.vjc-controls')).not.toBeNull()
    expect(host.querySelector('.vjc-controls button[title^="Fit"]')).not.toBeNull()
  })

  it('is a tab stop with full chrome by default, so the demos are untouched', () => {
    const { host, container } = mount(false)

    expect(container.getAttribute('tabindex')).toBe('0')
    expect(host.querySelector('.vjc-toolbar')).not.toBeNull()
    expect(host.querySelector('.vjc-undo-btn')).not.toBeNull()
  })

  it('ignores a double-click on the background', async () => {
    const { host, container } = mount(true)
    expect(nodeCount(host)).toBe(2)

    background(container, 'dblclick')
    await nextTick()

    expect(nodeCount(host)).toBe(2)
  })

  it('creates a node on double-click when editable', async () => {
    const { host, container } = mount(false)
    expect(nodeCount(host)).toBe(2)

    background(container, 'dblclick')
    await nextTick()

    expect(nodeCount(host)).toBe(3)
  })

  it('ignores Delete on a selection', async () => {
    const { host, container } = mount(true)
    container.focus()

    chord({ key: 'a', ctrlKey: true })
    chord({ key: 'Delete' })
    await nextTick()

    expect(nodeCount(host)).toBe(2)
  })

  it('deletes the selection on Delete when editable', async () => {
    const { host, container } = mount(false)
    container.focus()

    chord({ key: 'a', ctrlKey: true })
    chord({ key: 'Delete' })
    await nextTick()

    expect(nodeCount(host)).toBe(0)
  })

  it('leaves the chords it does not act on to the application around it', () => {
    const { container } = mount(true)
    container.focus()

    // The complaint this prop answers is not only "the board edits itself" but
    // "the board eats the workbench's shortcuts". `preventDefault()` is the
    // observable half of that, so it is what gets asserted.
    for (const init of [
      { key: 'Delete' },
      { key: 'Backspace' },
      { key: 'a', metaKey: true },
      { key: 'z', metaKey: true },
      { key: 'z', metaKey: true, shiftKey: true },
      { code: 'Space', key: ' ' },
    ]) {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      })
      window.dispatchEvent(event)
      expect(event.defaultPrevented, `${JSON.stringify(init)} was swallowed`).toBe(false)
    }
  })

  it('still answers the zoom chords, which are not editing', () => {
    const { container } = mount(true)
    container.focus()

    const zoomIn = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '=',
      metaKey: true,
    })
    window.dispatchEvent(zoomIn)
    expect(zoomIn.defaultPrevented).toBe(true)
  })
})

// `readonly` is a live prop: a host can flip a mounted board between viewing
// and editing, and the listeners registered once in `onMounted` have to
// follow it — see `onEditGesture` in ./index.vue.

const TWO_NODES_ONE_EDGE: ICanvasContent = {
  ...TWO_NODES,
  // Unlabeled: labels render through SVG `getBBox`, which jsdom lacks.
  edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left' }],
}

/** Mount inside a wrapper so `readonly` can be changed after the fact. */
function mountToggling(initial: boolean, content: ICanvasContent = TWO_NODES) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const readonly = ref(initial)
  const changes: ICanvasContent[] = []
  const canvasContent = structuredClone(content)
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(JsonCanvas, {
          canvasContent,
          readonly: readonly.value,
          onChange: (updated: ICanvasContent) => changes.push(updated),
        }),
    }),
  )
  app.mount(host)
  mounted = { app, host }
  const container = host.querySelector<HTMLElement>('.vjc-canvas-container')
  if (!container) throw new Error('canvas container did not render')
  return { host, container, readonly, changes }
}

/** Poll rather than count ticks: what we wait on is the condition. */
async function waitFor(predicate: () => boolean, what: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await nextTick()
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function makeEditable(host: HTMLElement, readonly: { value: boolean }) {
  readonly.value = false
  await waitFor(
    () => host.querySelector('.vjc-toolbar') !== null,
    'the toolbar to appear after `readonly` went false',
  )
}

describe('a board that turns editable after mount', () => {
  it('drags a node onto the change seam', async () => {
    const { host, readonly, changes } = mountToggling(true)
    await nextTick()
    await makeEditable(host, readonly)

    const start = canvasToClient(host, 100, 50)
    host
      .querySelector<HTMLElement>('#a')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...start }))
    const end = canvasToClient(host, 160, 50)
    window.dispatchEvent(new MouseEvent('pointermove', { ...end }))
    await nextTick()
    window.dispatchEvent(new MouseEvent('pointerup', { ...end }))
    await waitFor(() => changes.length > 0, 'the drag to emit `change`')

    expect(changes[0]!.nodes.find((n) => n.id === 'a')!.x).toBeGreaterThan(0)
  })

  it('draws an edge from a side anchor', async () => {
    const { host, readonly, changes } = mountToggling(true)
    await nextTick()
    await makeEditable(host, readonly)

    host
      .querySelector<HTMLElement>('#a [data-anchor-side="right"]')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

    // Dead centre of `b`, where the draft is dropped.
    const over = canvasToClient(host, 400, 50)
    window.dispatchEvent(new MouseEvent('pointermove', { ...over }))
    await nextTick()
    window.dispatchEvent(new MouseEvent('pointerup', { ...over }))
    await waitFor(() => changes.length > 0, 'the edge draft to emit `change`')

    expect(changes[0]!.edges[0]!.toNode).toBe('b')
  })

  it('opens the context menu on a selection', async () => {
    const { host, container, readonly } = mountToggling(true)
    await nextTick()
    await makeEditable(host, readonly)

    container.focus()
    chord({ key: 'a', ctrlKey: true })
    container.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }),
    )
    await waitFor(() => host.querySelector('.context-menu') !== null, 'the context menu to open')
  })

  it('selects an edge on click', async () => {
    const { host, readonly } = mountToggling(true, TWO_NODES_ONE_EDGE)
    await nextTick()
    await makeEditable(host, readonly)

    host
      .querySelector<SVGPathElement>('.vjc-edge-paths path')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(
      () => host.querySelector('.vjc-edge-paths path.is-selected') !== null,
      'the clicked edge to be selected',
    )
  })
})

describe('a board that turns read-only after mount', () => {
  it('stops answering a press on a node', async () => {
    const { host, readonly } = mountToggling(false)
    await nextTick()

    readonly.value = true
    await waitFor(
      () => host.querySelector('.vjc-toolbar') === null,
      'the toolbar to go away after `readonly` went true',
    )

    const start = canvasToClient(host, 100, 50)
    host
      .querySelector<HTMLElement>('#a')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...start }))
    window.dispatchEvent(new MouseEvent('pointerup', { ...start }))
    await nextTick()

    expect(host.querySelector('#a')!.classList.contains('is-selected')).toBe(false)
  })
})
