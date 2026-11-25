import type { ICanvasContent } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, nextTick } from 'vue'
import JsonCanvas from '../../../src/components/Canvas/index.vue'

/**
 * The board's keyboard: the shortcuts are `window` listeners that only act
 * while the board holds focus, so these cover both halves — which chords
 * match, and what counts as "the board holds focus".
 */

const TWO_NODES: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'A' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'B' },
  ],
  edges: [],
}

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

function mount(canvasContent: ICanvasContent = TWO_NODES) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const changes: ICanvasContent[] = []
  const app = createApp(JsonCanvas, {
    canvasContent: structuredClone(canvasContent),
    onChange: (content: ICanvasContent) => changes.push(content),
  })
  app.mount(host)
  mounted = { app, host }
  const container = host.querySelector<HTMLElement>('.vjc-canvas-container')!
  return { host, container, changes }
}

function nodeCount(host: HTMLElement): number {
  return host.querySelectorAll('.vjc-nodes .node').length
}

function chord(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  window.dispatchEvent(event)
  return event
}

/** Poll rather than count ticks: what we wait on is the condition. */
async function waitFor(predicate: () => boolean, what: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await nextTick()
  }
  throw new Error(`timed out waiting for ${what}`)
}

describe('focus', () => {
  it("keeps the shortcuts live after a click on the board's own buttons", async () => {
    const { host, container } = mount()
    container.focus()

    // Browsers on Windows/Linux give a clicked button focus; jsdom does not,
    // so the focus move is spelled out.
    const addNote = host.querySelector<HTMLButtonElement>('.vjc-toolbar .toolbar-btn')!
    addNote.focus()
    addNote.click()
    await waitFor(
      () => host.querySelector('.node.is-selected') !== null,
      'the new note to be selected',
    )
    expect(nodeCount(host)).toBe(3)

    chord({ key: 'Delete' })
    await nextTick()

    expect(nodeCount(host)).toBe(2)
  })

  it('leaves Backspace to a form control inside the board', async () => {
    const { host, container, changes } = mount({
      nodes: [
        {
          id: 'g',
          type: 'group',
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          background: 'bg.png',
        },
      ],
      edges: [],
    })
    container.focus()
    const group = host.querySelector<HTMLElement>('#g')!
    group.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    await waitFor(() => host.querySelector('.edit-panel') !== null, 'the edit panel to open')
    host.querySelector<HTMLButtonElement>('.edit-panel .more-btn')!.click()
    await waitFor(() => host.querySelector('.select-input') !== null, 'the Style select')

    host.querySelector<HTMLSelectElement>('.select-input')!.focus()
    chord({ key: 'Backspace' })
    await nextTick()

    expect(nodeCount(host)).toBe(1)
    expect(changes.length).toBe(0)
  })

  it('leaves Space to a focused button inside the board', async () => {
    const { host, container } = mount()
    container.focus()
    host.querySelector<HTMLButtonElement>('.vjc-toolbar .toolbar-btn')!.focus()

    const space = chord({ key: ' ', code: 'Space' })
    await nextTick()

    expect(space.defaultPrevented).toBe(false)
    expect(host.querySelector('.vjc-will-pan')).toBeNull()
  })

  it('stops answering the shortcuts once focus leaves the board', async () => {
    const { host, container } = mount()
    container.focus()
    chord({ key: 'a', ctrlKey: true })

    const outside = document.createElement('button')
    document.body.appendChild(outside)
    try {
      outside.focus()
      chord({ key: 'Delete' })
      await nextTick()
      expect(nodeCount(host)).toBe(2)
    } finally {
      outside.remove()
    }
  })

  it('stays on the board when the focused button turns disabled', async () => {
    const { host, container } = mount()
    container.focus()
    host.querySelector<HTMLButtonElement>('.vjc-toolbar .toolbar-btn')!.click()
    await waitFor(() => nodeCount(host) === 3, 'the new note')

    // The last undo disables the focused Undo button. The browser then drops
    // focus with no new target; jsdom does not, so the focusout is spelled out.
    const undoBtn = host.querySelector<HTMLButtonElement>('.vjc-undo-btn')!
    undoBtn.focus()
    undoBtn.click()
    undoBtn.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    await waitFor(() => undoBtn.disabled, 'the Undo button to disable')
    await waitFor(() => document.activeElement === container, 'focus to return to the board')

    chord({ key: 'y', ctrlKey: true })
    await nextTick()
    expect(nodeCount(host)).toBe(3)
  })

  it('stays on the board when the focused button is removed', async () => {
    const { host, container } = mount()
    container.focus()
    chord({ key: 'a', ctrlKey: true })
    await waitFor(() => host.querySelector('.edit-panel .more-btn') !== null, 'the edit panel')
    host.querySelector<HTMLButtonElement>('.edit-panel .more-btn')!.click()
    await waitFor(() => host.querySelector('.edit-panel .delete-btn') !== null, 'Delete')

    // Deleting the selection unmounts the panel and its focused button.
    const deleteBtn = host.querySelector<HTMLButtonElement>('.edit-panel .delete-btn')!
    deleteBtn.focus()
    deleteBtn.click()
    deleteBtn.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    await waitFor(() => !deleteBtn.isConnected, 'the Delete button to unmount')
    await waitFor(() => document.activeElement === container, 'focus to return to the board')
    expect(nodeCount(host)).toBe(0)

    chord({ key: 'z', ctrlKey: true })
    await nextTick()
    expect(nodeCount(host)).toBe(2)
  })
})

describe('the wheel', () => {
  function wheelOn(el: Element): WheelEvent {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 })
    el.dispatchEvent(event)
    return event
  }

  it("pans the board after a click on the board's own buttons", async () => {
    const { host, container } = mount()
    container.focus()
    host.querySelector<HTMLButtonElement>('.vjc-controls button[title^="Zoom in"]')!.focus()

    expect(wheelOn(container).defaultPrevented).toBe(true)
  })

  it('leaves the wheel to the in-place editor, so a long note scrolls', async () => {
    const { host, container } = mount()
    container.focus()
    host.querySelector('#a')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await waitFor(() => host.querySelector('#a textarea') !== null, 'the in-place editor')
    const textarea = host.querySelector<HTMLTextAreaElement>('#a textarea')!
    textarea.focus()

    expect(wheelOn(textarea).defaultPrevented).toBe(false)
  })

  it('leaves the wheel to an open History panel, so its list scrolls', async () => {
    const { host, container } = mount()
    container.focus()
    const toggle = host.querySelector<HTMLButtonElement>('.vjc-history-panel .toggle-btn')!
    toggle.focus()
    toggle.click()
    await waitFor(
      () => host.querySelector('.vjc-history-panel .panel-content') !== null,
      'the History panel to open',
    )

    expect(wheelOn(host.querySelector('.vjc-history-panel .panel-content')!).defaultPrevented).toBe(
      false,
    )
  })
})

describe('chords', () => {
  it('redoes on Ctrl+Shift+Z, which browsers report as key "Z"', async () => {
    const { host, container, changes } = mount()
    container.focus()
    container.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 10, clientY: 10 }))
    await nextTick()
    expect(changes.length).toBe(1)

    chord({ key: 'z', ctrlKey: true })
    await nextTick()
    expect(changes.length).toBe(2)
    expect(nodeCount(host)).toBe(2)

    chord({ key: 'Z', ctrlKey: true, shiftKey: true })
    await nextTick()
    expect(changes.length).toBe(3)
    expect(changes[2]!.nodes.length).toBe(3)
  })

  it('selects all on Ctrl+A with Caps Lock on', async () => {
    const { host, container } = mount()
    container.focus()

    chord({ key: 'A', ctrlKey: true })
    await nextTick()

    expect(host.querySelectorAll('.node.is-selected').length).toBe(2)
  })
})
