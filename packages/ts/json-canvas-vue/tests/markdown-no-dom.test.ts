// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import {
  plainTextRenderer,
  registerMarkdownRenderer,
  renderedMarkdown,
  setActiveRenderer,
  unregisterMarkdownRenderer,
} from '../src/markdown.ts'

/**
 * The sanitize seam with no DOM at all, as in a server render: DOMPurify
 * cannot run, so the seam has nothing safe to return for a renderer that does
 * not sanitize itself.
 */

afterEach(() => {
  setActiveRenderer('plaintext')
  unregisterMarkdownRenderer('naive')
})

it('rejects for a renderer that is not sanitized', async () => {
  registerMarkdownRenderer({
    id: 'naive',
    name: 'Naive',
    render: () => '<img src="x" onerror="alert(1)">',
  })
  setActiveRenderer('naive')

  await expect(renderedMarkdown('anything')).rejects.toThrow('needs a DOM')
})

it('returns a sanitized renderer’s output', async () => {
  expect(await renderedMarkdown('<b>')).toBe(plainTextRenderer.render('<b>'))
})
