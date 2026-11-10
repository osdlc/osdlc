// @vitest-environment jsdom
/**
 * What the Vue math and mermaid blocks show when their renderer rejects — the
 * shape a host sees with the optional `katex` / `mermaid` peer absent. The
 * real peers are installed here, so the rejection is injected by spying on
 * the framework-free seam each component renders through; the spies are
 * restored so the KaTeX tests elsewhere keep the real module.
 */

import { markdownVue, vue } from './setup-dom.ts'
import { afterEach, describe, expect, vi, test } from 'vitest'
import type { App } from 'vue'
import * as math from '@osdlc/markdown-render'
import * as mermaid from '@osdlc/markdown-render'
import type { HastNode } from '../src/render.ts'

const { createApp, h } = vue
const { MathBlock, MathInline, MermaidBlock } = markdownVue
const { showMathSource } = await import('../src/components/MathBlock.ts')

let apps: App[] = []
afterEach(() => {
  for (const app of apps) app.unmount()
  apps = []
})

function textNode(tagName: string, value: string): HastNode {
  return {
    type: 'element',
    tagName,
    properties: {},
    children: [{ type: 'text', value }],
  } as HastNode
}

/** Mount a component over `node` and wait for its async draw to settle. */
async function mount(component: unknown, props: Record<string, unknown>): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(component as never, props) })
  apps.push(app)
  app.mount(host)
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5))
  return host
}

describe('showMathSource', () => {
  test('replaces the host content with the LaTeX as readable code', () => {
    const el = document.createElement('div')
    el.innerHTML = '<span class="katex">stale</span>'
    showMathSource(el, '\\frac{a}{b}')
    expect(el.children).toHaveLength(1)
    const code = el.firstElementChild!
    expect(code.tagName).toBe('CODE')
    expect(code.className).toBe('markdown-math-fallback')
    expect(code.textContent).toBe('\\frac{a}{b}')
  })
})

describe('MathBlock when renderMath rejects', () => {
  const spy = vi.spyOn(math, 'renderMath')
  afterEach(() => spy.mockRestore())

  test('display and inline blocks show the source as code, never as markup', async () => {
    spy.mockRejectedValue(new Error("Cannot find package 'katex'"))
    const latex = 'x^2 <b>not html</b>'

    const block = await mount(MathBlock, { node: textNode('code', latex) })
    const blockCode = block.querySelector('.markdown-math-block > code.markdown-math-fallback')
    expect(blockCode).not.toBeNull()
    expect(blockCode!.textContent).toBe(latex)
    expect(block.querySelector('b')).toBeNull()

    const inline = await mount(MathInline, { node: textNode('code', latex) })
    const inlineCode = inline.querySelector('.markdown-math-inline > code.markdown-math-fallback')
    expect(inlineCode).not.toBeNull()
    expect(inlineCode!.textContent).toBe(latex)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('MermaidBlock when renderMermaid rejects', () => {
  const spy = vi.spyOn(mermaid, 'renderMermaid')
  afterEach(() => spy.mockRestore())

  test('shows the diagram source in the fallback pre and leaves the canvas empty', async () => {
    spy.mockRejectedValue(new Error("Cannot find package 'mermaid'"))
    const source = 'graph TD\n  a --> b'

    const host = await mount(MermaidBlock, { node: textNode('code', `${source}\n`) })
    const pre = host.querySelector('pre.markdown-mermaid-fallback > code')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe(source)
    expect(host.querySelector('.markdown-mermaid-canvas')!.innerHTML).toBe('')
    expect(spy).toHaveBeenCalledWith(source, 'default')
  })
})
