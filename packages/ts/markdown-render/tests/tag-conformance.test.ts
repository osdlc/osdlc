/**
 * The renderer against the shared `markdown-tags` suite in `packages/conformance`. Each
 * case body renders to the case's `obsidian` answer, or to its own
 * renderer-only `tags` answer where the renderer reads the syntax tree and a
 * source scan cannot match it. The suite's README describes the file.
 */
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { html } from './helpers.ts'

interface Case {
  name: string
  input: { body: string }
  expect: { obsidian?: string[]; tags?: string[] }
}

const suite = JSON.parse(
  readFileSync(new URL('../../../conformance/markdown-tags/suite.json', import.meta.url), 'utf8'),
) as { sections: { inline_tags: { cases: Case[] }; renderer_only: { cases: Case[] } } }
const cases = [...suite.sections.inline_tags.cases, ...suite.sections.renderer_only.cases]

/** The `data-tag` values in rendered HTML, in document order. */
function renderedTags(out: string): string[] {
  return Array.from(out.matchAll(/data-tag="([^"]*)"/g), (m) => m[1]!)
}

test('the case file has renderer-only cases and twin cases', () => {
  expect(cases.some((c) => c.expect.tags !== undefined)).toBe(true)
  expect(cases.some((c) => c.expect.obsidian !== undefined)).toBe(true)
})

for (const c of cases) {
  test(c.name, async () => {
    const expected = c.expect.tags ?? c.expect.obsidian
    expect(expected, `${c.name} has no obsidian or renderer-only answer`).toSatisfy(Array.isArray)
    expect(renderedTags(await html(c.input.body))).toEqual(expected!)
  })
}
