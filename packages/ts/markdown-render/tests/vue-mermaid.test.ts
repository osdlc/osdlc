// @vitest-environment jsdom
/**
 * `MermaidBlock`'s overlapping-draw contract, mounted against jsdom in the
 * style of `vue-components.test.ts`.
 *
 * Two draws can be in flight at once — `renderMermaid` is async and a theme
 * toggle starts a second before the first answers — and they need not settle in
 * order. Worse, `renderMermaid` reinitializes mermaid's own global theme, so an
 * earlier render can come back painted in a LATER theme. The block's stale-token
 * bail covers both, and this file drives each half.
 *
 * `../src/mermaid.ts` is mocked, not the `mermaid` package: the block imports
 * the seam by relative path, so mocking it resolves to exactly one module here.
 * Mocking the bare `mermaid` specifier instead reaches it only if the two
 * resolve to the same copy, which is an installation detail rather than
 * something this suite decides.
 */

import { afterEach, describe, expect, test, vi } from 'vitest'

/** Renders parked by theme, so a test can settle draws out of turn. */
const parked = vi.hoisted(() => new Map<string, () => void>())

vi.mock('../src/mermaid.ts', () => ({
  async renderMermaid(source: string, theme = 'default') {
    const svg = `<svg data-theme="${theme}">${source}</svg>`
    if (!parked.has(theme)) return svg
    return new Promise<string>((resolve) => parked.set(theme, () => resolve(svg)))
  },
}))

const { vue, markdownVue } = await import('./setup-dom.ts')
import type { App, Ref } from 'vue'

const { createApp, defineComponent, h, nextTick, ref } = vue
const { MermaidBlock } = markdownVue

const NODE = {
  type: 'element' as const,
  tagName: 'code',
  children: [{ type: 'text' as const, value: 'graph TD; A-->B;\n' }],
}

let app: App | null = null
afterEach(() => {
  app?.unmount()
  app = null
  parked.clear()
})

/** Mount the block with a live `theme` ref, and hand back the host and the ref. */
function mount(): { host: HTMLElement; theme: Ref<string> } {
  const theme = ref('default')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const Wrapper = defineComponent({
    setup: () => () => h(MermaidBlock, { node: NODE, theme: theme.value } as never),
  })
  app = createApp(Wrapper)
  app.mount(host)
  return { host, theme }
}

/**
 * Drain until the host shows a diagram under `theme`. A fixed tick count is a
 * race against Vue's queue plus the draw's promise chain, and loses on a loaded
 * CI machine.
 */
async function drawn(host: HTMLElement, theme: string): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (host.innerHTML.includes(`data-theme="${theme}"`)) return
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`no diagram drawn under theme "${theme}": ${host.innerHTML}`)
}

/** Let every queued draw settle when the point is that nothing new arrives. */
async function quiesce(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('MermaidBlock', () => {
  test('a theme change redraws the diagram', async () => {
    const { host, theme } = mount()
    await drawn(host, 'default')
    theme.value = 'dark'
    await drawn(host, 'dark')
  })

  test('a draw overtaken by a later one does not write its stale svg', async () => {
    const { host, theme } = mount()
    await drawn(host, 'default')

    // Park the dark render, then toggle away from it. The light draw started
    // second settles first, so the dark one is stale when it finally answers.
    parked.set('dark', () => {})
    theme.value = 'dark'
    await quiesce()
    theme.value = 'default'
    await quiesce()
    expect(host.innerHTML).toContain('data-theme="default"')

    parked.get('dark')?.()
    await quiesce()
    expect(host.innerHTML).toContain('data-theme="default"')
    expect(host.innerHTML).not.toContain('data-theme="dark"')
  })
})
