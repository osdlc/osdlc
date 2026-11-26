import type { ITextNode } from '@osdlc/json-canvas-core'
import DOMPurify from 'dompurify'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, h, nextTick, type Ref, ref } from 'vue'
import CanvasNode from '../src/components/CanvasNode/index.vue'
import {
  getActiveRendererId,
  registerMarkdownRenderer,
  renderedMarkdown,
  setActiveRenderer,
  unregisterMarkdownRenderer,
} from '../src/markdown.ts'

/**
 * The sanitize seam: `renderedMarkdown` feeds `v-html`, so a renderer that
 * does not declare its output already-safe goes through DOMPurify HERE — a
 * host cannot take sanitization out of the path by registering a renderer
 * and simply not thinking about it. The seam is async, so `CanvasNode` also
 * has to drop a slow render that lands after a newer one.
 */

let mounted: { app: App; host: HTMLElement } | null = null

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = null
  setActiveRenderer('plaintext')
  for (const id of ['naive', 'self-sanitizing', 'async', 'deferred']) {
    unregisterMarkdownRenderer(id)
  }
})

/** Yield to the microtask queue and Vue's scheduler. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function textNode(text: string): ITextNode {
  return { id: 'n', type: 'text', x: 0, y: 0, width: 200, height: 100, text }
}

/** Mount the real `CanvasNode` on a node ref so the test can swap the node. */
function mountNode(node: Ref<ITextNode>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    setup: () => () =>
      h(CanvasNode, {
        node: node.value,
        scale: 1,
        translateX: 0,
        translateY: 0,
      }),
  })
  app.mount(host)
  mounted = { app, host }
  return () => host.querySelector<HTMLElement>('.node-text')?.innerHTML ?? ''
}

describe('renderedMarkdown', () => {
  it('sanitizes the output of a renderer that does not claim to', async () => {
    registerMarkdownRenderer({
      id: 'naive',
      name: 'Naive',
      render: () => '<img src="x" onerror="alert(1)"><b>ok</b>',
    })
    setActiveRenderer('naive')

    const html = await renderedMarkdown('anything')
    expect(html).not.toContain('onerror')
    expect(html).toContain('<b>ok</b>')
  })

  describe('links that keep a target', () => {
    async function renderWith(html: string): Promise<string> {
      registerMarkdownRenderer({ id: 'naive', name: 'Naive', render: () => html })
      setActiveRenderer('naive')
      return renderedMarkdown('anything')
    }

    function relOf(html: string, selector: string): string[] {
      const host = document.createElement('div')
      host.innerHTML = html
      return (host.querySelector(selector)?.getAttribute('rel') ?? '').split(' ').sort()
    }

    it('adds noopener and noreferrer to target="_blank"', async () => {
      const html = await renderWith('<a href="https://example.com" target="_blank">x</a>')
      expect(relOf(html, 'a')).toEqual(['noopener', 'noreferrer'])
    })

    it('keeps the tokens a renderer already put in rel', async () => {
      const html = await renderWith(
        '<a href="https://example.com" target="_blank" rel="nofollow">x</a>',
      )
      expect(relOf(html, 'a')).toEqual(['nofollow', 'noopener', 'noreferrer'])
    })

    it('leaves a link without a target without a rel', async () => {
      const html = await renderWith('<a href="https://example.com">x</a>')
      expect(html).not.toContain('rel=')
    })

    it('returns what DOMPurify returns for input without links', async () => {
      const source = '<p>one <b>two</b></p><img src="x" onerror="alert(1)"><ul><li>a</li></ul>'
      const html = await renderWith(source)
      expect(html).toBe(DOMPurify.sanitize(source, { ADD_ATTR: ['target'] }))
    })
  })

  it('rejects when DOMPurify cannot sanitize', async () => {
    registerMarkdownRenderer({
      id: 'naive',
      name: 'Naive',
      render: () => '<img src="x" onerror="alert(1)">',
    })
    setActiveRenderer('naive')

    // What DOMPurify reports in a window without the DOM it needs. There,
    // `sanitize` hands its input back as it came.
    DOMPurify.isSupported = false
    try {
      await expect(renderedMarkdown('anything')).rejects.toThrow('needs a DOM')
    } finally {
      DOMPurify.isSupported = true
    }
  })

  it('passes a sanitized renderer’s output through untouched', async () => {
    // A sanitizing pipeline may deliberately keep custom elements; a second
    // DOMPurify pass here would strip them.
    registerMarkdownRenderer({
      id: 'self-sanitizing',
      name: 'Self-sanitizing',
      sanitized: true,
      render: async () => '<markdown-embed target="Note">Note</markdown-embed>',
    })
    setActiveRenderer('self-sanitizing')

    expect(await renderedMarkdown('anything')).toBe(
      '<markdown-embed target="Note">Note</markdown-embed>',
    )
  })

  it('plain text is the default and escapes HTML', async () => {
    expect(getActiveRendererId()).toBe('plaintext')

    const html = await renderedMarkdown('<img src="x" onerror="alert(1)"> **ok**')
    expect(html).toMatch(/^<pre/)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=&quot;x&quot;')
    expect(html).toContain('**ok**')
  })

  it('replacing the active renderer under its own id re-renders open nodes', async () => {
    registerMarkdownRenderer({
      id: 'naive',
      name: 'Naive',
      sanitized: true,
      render: (md) => `<i>${md}</i>`,
    })
    setActiveRenderer('naive')
    const html = mountNode(ref(textNode('hello')))
    await settle()
    expect(html()).toBe('<i>hello</i>')

    registerMarkdownRenderer({
      id: 'naive',
      name: 'Naive',
      sanitized: true,
      render: (md) => `<b>${md}</b>`,
    })
    await settle()
    expect(html()).toBe('<b>hello</b>')
  })

  it('replacing a renderer that is not active leaves open nodes alone', async () => {
    registerMarkdownRenderer({
      id: 'naive',
      name: 'Naive',
      sanitized: true,
      render: (md) => `<i>${md}</i>`,
    })
    const html = mountNode(ref(textNode('hello')))
    await settle()
    const before = html()

    registerMarkdownRenderer({
      id: 'naive',
      name: 'Naive',
      sanitized: true,
      render: (md) => `<b>${md}</b>`,
    })
    await settle()
    expect(html()).toBe(before)
    expect(getActiveRendererId()).toBe('plaintext')
  })

  it('unregistering the active renderer falls back to plain text', () => {
    registerMarkdownRenderer({ id: 'naive', name: 'Naive', render: (md) => md })
    setActiveRenderer('naive')
    expect(unregisterMarkdownRenderer('naive')).toBe(true)
    expect(getActiveRendererId()).toBe('plaintext')
    expect(unregisterMarkdownRenderer('plaintext')).toBe(false)
  })
})

describe('CanvasNode', () => {
  it('renders a text node through an async renderer', async () => {
    registerMarkdownRenderer({
      id: 'async',
      name: 'Async',
      sanitized: true,
      render: async (md) => `<em>${md}</em>`,
    })
    setActiveRenderer('async')

    const node = ref(textNode('hello'))
    const html = mountNode(node)
    await settle()

    expect(html()).toBe('<em>hello</em>')
  })

  it('degrades to escaped source when the renderer rejects, not to stale content', async () => {
    // Without a catch the node keeps the PREVIOUS text's HTML — wrong content,
    // silently — and the rejection escapes the watcher. A real pipeline rejects
    // whenever a callback it calls, such as a link resolver, throws.
    registerMarkdownRenderer({
      id: 'async',
      name: 'Async',
      sanitized: true,
      render: (md) => {
        if (md === 'boom <b>x</b>') return Promise.reject(new Error('boom'))
        return Promise.resolve(`<em>${md}</em>`)
      },
    })
    setActiveRenderer('async')

    const node = ref(textNode('fine'))
    const html = mountNode(node)
    await settle()
    expect(html()).toBe('<em>fine</em>')

    node.value = textNode('boom <b>x</b>')
    await settle()
    expect(html()).not.toContain('<em>fine</em>')
    expect(html()).toContain('boom &lt;b&gt;x&lt;/b&gt;')
  })

  it('drops a slower earlier render that resolves after a newer one', async () => {
    const pending = new Map<string, (html: string) => void>()
    registerMarkdownRenderer({
      id: 'deferred',
      name: 'Deferred',
      sanitized: true,
      render: (md) => new Promise<string>((resolve) => pending.set(md, resolve)),
    })
    setActiveRenderer('deferred')

    const node = ref(textNode('slow'))
    const html = mountNode(node)
    await settle()
    node.value = textNode('fast')
    await settle()
    expect(pending.size).toBe(2)

    pending.get('fast')?.('<b>fast</b>')
    await settle()
    expect(html()).toBe('<b>fast</b>')

    pending.get('slow')?.('<b>slow</b>')
    await settle()
    expect(html()).toBe('<b>fast</b>')
  })
})
