/**
 * The docs' code is the examples' code. Each ```ts block in the README or a
 * guide that follows a `<!-- snippet: NAME -->` line must equal the
 * `// #region NAME` block of a file under `examples/` (dedented), so the docs
 * show code the test suite runs. To update a snippet, change the example, then
 * paste the region into the block below the marker.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

const root = join(import.meta.dirname, '..')

/** Every `// #region NAME` block of the example files, dedented, by name. */
function regions(): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of readdirSync(join(root, 'examples')).filter((f) => f.endsWith('.ts'))) {
    const text = readFileSync(join(root, 'examples', file), 'utf8')
    for (const m of text.matchAll(/^( *)\/\/ #region (\S+)\n([\s\S]*?)^ *\/\/ #endregion \2$/gm)) {
      const indent = m[1]!.length
      if (out.has(m[2]!)) throw new Error(`region ${m[2]} is defined twice`)
      const body = m[3]!.split('\n').map((l) => l.slice(Math.min(indent, l.search(/\S|$/))))
      out.set(m[2]!, body.join('\n').trim())
    }
  }
  return out
}

const docs = [
  'README.md',
  ...readdirSync(join(root, 'docs', 'guide'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => join('docs', 'guide', f)),
]

const snippets = docs.flatMap((doc) =>
  [
    ...readFileSync(join(root, doc), 'utf8').matchAll(
      /<!-- snippet: (\S+) -->\n```ts\n([\s\S]*?)```/g,
    ),
  ].map((m) => ({ doc, name: m[1]!, code: m[2]!.trim() })),
)

test('the docs carry snippets', () => {
  expect(snippets.length).toBeGreaterThan(5)
})

describe('each snippet equals its example region', () => {
  const byName = regions()
  test.each(snippets)('$doc ← $name', ({ name, code }) => {
    expect(byName.has(name), `no example region named ${name}`).toBe(true)
    expect(code).toBe(byName.get(name))
  })
})
