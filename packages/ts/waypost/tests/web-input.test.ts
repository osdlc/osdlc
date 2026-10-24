// @vitest-environment jsdom
/**
 * Two rules of the page's input layer that only a document can show.
 *
 * A refused clipboard write must not be reported as a copy — the button is the
 * only evidence anyone has that the paste buffer changed. And the runner tab
 * bar is one tab stop moved by the arrows, so an arrow press that leaves focus
 * on <body> makes the second press do nothing.
 */
import { mountPage } from './dom.ts'

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import type { Catalog, Task } from '@osdlc/system-model/detect'

import { wireInput } from '../src/web/input.ts'
import { $, state } from '../src/web/state.ts'
import { render } from '../src/web/view.ts'

function task(runner: string, name: string): Task {
  return {
    id: `${runner}:${name}`,
    runner,
    path: [runner, name],
    argv: [runner, name],
    cwd: '.',
    display: `${runner} ${name}`,
    parameters: [],
    source: runner === 'make' ? 'Makefile' : 'justfile',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}

function catalog(): Catalog {
  return {
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: ['make', 'just'].map((runner) => ({
      runner,
      status: 'ok' as const,
      chain: [{ label: 'target', hint: 'The target name.' }],
      tasks: [task(runner, 'build'), task(runner, 'lint')],
      skippedForExec: false,
      diagnostics: [],
    })),
  }
}

/** Resolve the microtasks a delegated async click handler runs on. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function setClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

// `navigator` is shared by every suite in this file, so the stub is undone
// rather than left for whatever runs next.
const CLIPBOARD = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
afterAll(() => {
  if (CLIPBOARD) Object.defineProperty(globalThis.navigator, 'clipboard', CLIPBOARD)
  else delete (globalThis.navigator as unknown as { clipboard?: unknown }).clipboard
})

beforeAll(() => {
  mountPage()
  wireInput()
})

beforeEach(() => {
  state.catalog = catalog()
  state.query = ''
  state.runner = 'all'
  state.collapsed = new Set()
  state.focusedId = null
  render()
})

describe("a row's copy button", () => {
  test("does not say 'copied' when the browser refused the write", async () => {
    setClipboard(() => Promise.reject(new Error('clipboard-write denied')))
    const copy = $('out').querySelector('.copy') as HTMLElement

    copy.click()
    await settle()

    expect(copy.textContent).not.toBe('copied')
    expect(copy.classList.contains('done')).toBe(false)
  })

  test("says 'copied' when the write went through", async () => {
    setClipboard(() => Promise.resolve())
    const copy = $('out').querySelector('.copy') as HTMLElement

    copy.click()
    await settle()

    expect(copy.textContent).toBe('copied')
    expect(copy.classList.contains('done')).toBe(true)
  })
})

describe('the runner tab bar', () => {
  test('keeps focus in the group when an arrow rebuilds it', () => {
    // Compared by identity through `dataset`, never by passing DOM nodes to a
    // matcher: a deep-equality walk over a document is ruinously slow.
    const tabs = () => [...$('tabs').querySelectorAll<HTMLElement>('button[data-runner]')]
    const active = () => document.activeElement as HTMLElement | null
    tabs()[0]!.focus()
    expect(active()?.dataset['runner']).toBe('all')

    $('tabs').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    )

    // Selecting a runner re-renders the tab strip, so the button that was
    // focused is gone. Focus must land on its replacement, not on <body>.
    expect($('tabs').contains(active())).toBe(true)
    expect(active()?.dataset['runner']).toBe(tabs()[1]!.dataset['runner'])
  })
})

describe('copying a row from the keyboard', () => {
  test('closes an open runner picker, exactly as clicking the button does', async () => {
    // A mouse click on `.copy` bubbles to the document handler, whose last
    // branch closes the picker on any click outside it. The keyboard paths
    // reach the same copy without a click, and used to borrow that close by
    // synthesising one.
    setClipboard(() => Promise.resolve())
    const menu = document.getElementById('pickmenu') as HTMLElement
    menu.hidden = false
    const row = $('out').querySelector('tbody tr') as HTMLElement
    row.focus()

    row.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await settle()

    expect(menu.hidden).toBe(true)
  })
})
