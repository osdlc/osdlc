// @vitest-environment jsdom
/**
 * `renderMermaid` against the real mermaid module and a document. mermaid's
 * `render` works in `document.body`: it removes any element holding the ids
 * it is about to use, and appends a temporary `<div id="d<id>">` it removes on
 * success. These tests pin what the page looks like after a render, whatever
 * mermaid did inside it.
 *
 * Every source here is invalid, so mermaid rejects at parse, before any layout
 * a jsdom document cannot measure.
 */

import { afterEach, expect, test } from 'vitest'
import { renderToHtml } from '../src/index.ts'
import { renderMermaid } from '../src/mermaid.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

test('a failed render leaves nothing of mermaid in document.body', async () => {
  await expect(renderMermaid('this is not a real mermaid diagram')).rejects.toThrow()
  await expect(renderMermaid('this is not a real mermaid diagram')).rejects.toThrow()

  expect(document.body.children).toHaveLength(0)
  expect(document.body.textContent).not.toMatch(/syntax error/i)
})

test('a render does not remove a heading the pipeline put on the page', async () => {
  // Heading slugs spelling the ids mermaid would use for the next few renders:
  // its svg id, its div id, its iframe id.
  const ids = [1, 2, 3, 4].flatMap((n) => [
    `markdown-mermaid-${n}`,
    `dmarkdown-mermaid-${n}`,
    `imarkdown-mermaid-${n}`,
  ])
  const source = ids.map((id) => `## ${id.replace(/-/g, ' ')}\n`).join('\n')
  document.body.innerHTML = await renderToHtml(source)
  const before = ids.filter((id) => document.getElementById(id))
  expect(before).toEqual(ids)

  await expect(renderMermaid('not a diagram either')).rejects.toThrow()

  expect(ids.filter((id) => document.getElementById(id))).toEqual(ids)
})
