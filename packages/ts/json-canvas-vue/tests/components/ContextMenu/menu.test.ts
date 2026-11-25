import type { INode } from '@osdlc/json-canvas-core'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp } from 'vue'
import ContextMenu from '../../../src/components/ContextMenu/index.vue'

/**
 * The menu the board shows on a right-click: align, distribute and match-size
 * need two or more selected nodes, duplicate and delete need one. Each action
 * emits itself and then `close`.
 */

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
})

const nodes = (count: number): INode[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    type: 'text' as const,
    x: i * 100,
    y: 0,
    width: 50,
    height: 50,
    text: '',
  }))

/** Mount the menu; `events` records each emit with its arguments, in order. */
function mount(props: { visible?: boolean; x?: number; y?: number; selected: number }) {
  const events: unknown[][] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      events.push([name, ...args])
  const app = createApp(ContextMenu, {
    visible: props.visible ?? true,
    ...(props.x === undefined ? {} : { x: props.x }),
    ...(props.y === undefined ? {} : { y: props.y }),
    selectedNodes: nodes(props.selected),
    onAlign: record('align'),
    onDistribute: record('distribute'),
    'onMatch-size': record('match-size'),
    onDuplicate: record('duplicate'),
    onDelete: record('delete'),
    onClose: record('close'),
  })
  app.mount(host)
  mounted = { app, host }
  return { host, events }
}

const button = (host: HTMLElement, text: string): HTMLButtonElement => {
  const match = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.title === text || b.textContent?.includes(text),
  )
  if (!match) throw new Error(`no button "${text}"`)
  return match
}

describe('ContextMenu', () => {
  it('renders nothing while it is not visible', () => {
    const { host } = mount({ visible: false, selected: 2 })
    expect(host.querySelector('.context-menu')).toBeNull()
  })

  it('sits at the given position', () => {
    const { host } = mount({ x: 120, y: 80, selected: 2 })
    const style = host.querySelector<HTMLElement>('.context-menu')!.style
    expect([style.left, style.top]).toEqual(['120px', '80px'])
  })

  it('offers only duplicate and delete for one node', () => {
    const { host } = mount({ selected: 1 })
    const labels = [...host.querySelectorAll('button')].map((b) =>
      b.textContent?.replace(/[^\w]/g, ''),
    )
    expect(labels).toEqual(['Duplicate', 'Delete'])
  })

  it('offers align, distribute and size for several nodes', () => {
    const { host } = mount({ selected: 3 })
    expect(host.querySelectorAll('.menu-label')).toHaveLength(3)
    expect(host.querySelectorAll('button')).toHaveLength(6 + 2 + 3 + 2)
  })

  it.each([
    ['Align left', 'left'],
    ['Align center horizontally', 'center-h'],
    ['Align right', 'right'],
    ['Align top', 'top'],
    ['Align center vertically', 'center-v'],
    ['Align bottom', 'bottom'],
  ])('%s emits align and closes', (title, direction) => {
    const { host, events } = mount({ selected: 2 })
    button(host, title).click()
    expect(events).toEqual([['align', direction], ['close']])
  })

  it.each([
    ['Distribute horizontally', 'horizontal'],
    ['Distribute vertically', 'vertical'],
  ])('%s emits distribute and closes', (title, direction) => {
    const { host, events } = mount({ selected: 3 })
    button(host, title).click()
    expect(events).toEqual([['distribute', direction], ['close']])
  })

  it.each([
    ['Match width', 'width'],
    ['Match height', 'height'],
    ['Match size', 'both'],
  ])('%s emits match-size and closes', (title, dimension) => {
    const { host, events } = mount({ selected: 2 })
    button(host, title).click()
    expect(events).toEqual([['match-size', dimension], ['close']])
  })

  it('Duplicate emits duplicate and closes', () => {
    const { host, events } = mount({ selected: 1 })
    button(host, 'Duplicate').click()
    expect(events).toEqual([['duplicate'], ['close']])
  })

  it('Delete emits delete and closes', () => {
    const { host, events } = mount({ selected: 1 })
    button(host, 'Delete').click()
    expect(events).toEqual([['delete'], ['close']])
  })

  it('swallows mousedown so the board does not start a selection under it', () => {
    const { host } = mount({ selected: 1 })
    const seen: Event[] = []
    host.addEventListener('mousedown', (e) => seen.push(e))
    host
      .querySelector('.context-menu')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(seen).toEqual([])
  })
})
