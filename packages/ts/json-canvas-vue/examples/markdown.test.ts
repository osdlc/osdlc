import {
  getActiveRenderer,
  getActiveRendererId,
  getRenderers,
  type MarkdownRenderer,
  plainTextRenderer,
  registerMarkdownRenderer,
  renderedMarkdown,
  setActiveRenderer,
  unregisterMarkdownRenderer,
  useRendererVersion,
} from '@osdlc/json-canvas-vue'
import { afterEach, expect, test } from 'vitest'

const shoutRenderer: MarkdownRenderer = {
  id: 'shout',
  name: 'Shout',
  render: async (markdown) => `<p onclick="steal()">${markdown.toUpperCase()}</p>`,
}

afterEach(() => {
  setActiveRenderer(plainTextRenderer.id)
  unregisterMarkdownRenderer('shout')
})

test('plain text is the default: HTML is escaped and whitespace kept', async () => {
  expect(getActiveRendererId()).toBe('plaintext')
  expect(getActiveRenderer().id).toBe(plainTextRenderer.id)
  const html = await renderedMarkdown('<b>hi</b>\nthere')
  expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;')
  expect(html).toContain('white-space: pre-wrap')
})

test('a registered renderer is used once it is active, and its output is sanitized', async () => {
  // #region markdown-renderer
  // A renderer turns markdown into HTML. It may return the HTML or a promise of it.
  const shout: MarkdownRenderer = {
    id: 'shout',
    name: 'Shout',
    render: async (markdown) => `<p onclick="steal()">${markdown.toUpperCase()}</p>`,
  }

  registerMarkdownRenderer(shout)
  setActiveRenderer('shout')
  // #endregion markdown-renderer

  expect(getRenderers().map((r) => r.id)).toEqual(['plaintext', 'shout'])
  expect(getActiveRendererId()).toBe('shout')
  // DOMPurify removes the handler: the renderer did not declare `sanitized: true`.
  expect(await renderedMarkdown('hi')).toBe('<p>HI</p>')
})

test('a renderer that sanitizes its own output declares it and is not purified twice', async () => {
  registerMarkdownRenderer({ ...shoutRenderer, sanitized: true })
  setActiveRenderer('shout')
  expect(await renderedMarkdown('hi')).toBe('<p onclick="steal()">HI</p>')
})

test('the version changes when the active renderer is switched, replaced or removed', () => {
  const version = useRendererVersion()
  const start = version.value
  registerMarkdownRenderer(shoutRenderer)
  expect(version.value).toBe(start)

  setActiveRenderer('shout')
  expect(version.value).toBe(start + 1)

  registerMarkdownRenderer(shoutRenderer)
  expect(version.value).toBe(start + 2)

  expect(unregisterMarkdownRenderer('shout')).toBe(true)
  expect(version.value).toBe(start + 3)
  expect(getActiveRendererId()).toBe('plaintext')
})

test('the plain-text renderer cannot be removed, and an unknown id is refused', () => {
  expect(unregisterMarkdownRenderer('plaintext')).toBe(false)
  expect(setActiveRenderer('missing')).toBe(false)
})
