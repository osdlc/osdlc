/**
 * Every code block in the README and the guides that is marked
 * `<!-- snippet: <file>#<region> -->` equals that region of the example file,
 * so the docs show code the test suite runs. To update a snippet, change the
 * example, then paste the region (dedented) into the block below the marker.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

const root = join(import.meta.dirname, '..')

function region(file: string, name: string): string {
  const lines = readFileSync(join(root, file), 'utf8').split('\n')
  const start = lines.findIndex((l) => l.trim() === `// #region ${name}`)
  const end = lines.findIndex((l) => l.trim() === `// #endregion ${name}`)
  if (start < 0 || end < start) throw new Error(`no region ${name} in ${file}`)
  const body = lines.slice(start + 1, end)
  const indent = Math.min(
    ...body.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length),
  )
  return body
    .map((l) => l.slice(indent))
    .join('\n')
    .trim()
}

const docs = [
  'README.md',
  ...readdirSync(join(root, 'docs', 'guide')).map((f) => join('docs', 'guide', f)),
].filter((f) => f.endsWith('.md'))

const snippets = docs.flatMap((doc) => {
  const text = readFileSync(join(root, doc), 'utf8')
  const re = /<!-- snippet: ([^#\s]+)#([\w-]+) -->\n```ts\n([\s\S]*?)```/g
  return [...text.matchAll(re)].map((m) => ({ doc, file: m[1]!, name: m[2]!, code: m[3]! }))
})

test('the docs carry snippets', () => {
  expect(snippets.length).toBeGreaterThan(5)
})

describe('each snippet equals its example region', () => {
  test.each(snippets)('$doc ← $file#$name', ({ file, name, code }) => {
    expect(code.trim()).toBe(region(file, name))
  })
})
