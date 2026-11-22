import type { ICanvasContent } from '@osdlc/json-canvas-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type App, createApp, nextTick } from 'vue'
import OutputPanel from '../../../src/components/OutputPanel/index.vue'

/** The JSON panel: a toggle, the canvas as JSON, Copy and Download. */

const CONTENT: ICanvasContent = {
  nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'hi' }],
  edges: [],
}

let mounted: { app: App; host: HTMLElement } | null = null

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'clipboard')
})

function mount(canvasContent: ICanvasContent = CONTENT) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(OutputPanel, { canvasContent })
  app.mount(host)
  mounted = { app, host }
  return host
}

async function open(host: HTMLElement) {
  host.querySelector<HTMLButtonElement>('.toggle-btn')!.click()
  await nextTick()
}

const actions = (host: HTMLElement) => host.querySelectorAll<HTMLButtonElement>('.action-btn')

describe('OutputPanel', () => {
  it('starts collapsed, with only the toggle', () => {
    const host = mount()
    expect(host.querySelector('.panel-content')).toBeNull()
    expect(host.querySelector('.toggle-label')?.textContent).toBe('JSON')
  })

  it('opens to the canvas as indented JSON, and closes again', async () => {
    const host = mount()
    await open(host)
    expect(host.querySelector('code')!.textContent).toBe(JSON.stringify(CONTENT, null, 2))

    host.querySelector<HTMLButtonElement>('.close-btn')!.click()
    await nextTick()
    expect(host.querySelector('.panel-content')).toBeNull()
  })

  it('copies the JSON, says so, and goes back to "Copy" after two seconds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const host = mount()
    await open(host)

    actions(host)[0]!.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(CONTENT, null, 2))
    expect(actions(host)[0]!.textContent?.trim()).toBe('Copied!')

    await vi.advanceTimersByTimeAsync(2000)
    expect(actions(host)[0]!.textContent?.trim()).toBe('Copy')
  })

  it('says "Failed" when the clipboard refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = mount()
    await open(host)

    actions(host)[0]!.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(actions(host)[0]!.textContent?.trim()).toBe('Failed')
    expect(error).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)
    expect(actions(host)[0]!.textContent?.trim()).toBe('Copy')
  })

  it('downloads the JSON as canvas.canvas', async () => {
    const created: Blob[] = []
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      created.push(blob as Blob)
      return 'blob:test'
    }
    const revoke = vi.fn()
    URL.revokeObjectURL = revoke
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(`${this.download} ${this.href}`)
    })
    const host = mount()
    await open(host)

    actions(host)[1]!.click()

    expect(downloads).toEqual(['canvas.canvas blob:test'])
    expect(created).toHaveLength(1)
    expect(created[0]!.type).toBe('application/json')
    expect(created[0]!.size).toBe(JSON.stringify(CONTENT, null, 2).length)
    expect(revoke).toHaveBeenCalledWith('blob:test')
    expect(document.body.querySelector('a[download]')).toBeNull()
    Reflect.deleteProperty(URL, 'createObjectURL')
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  })
})
