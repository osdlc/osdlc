/**
 * The README's code is the examples' code. Each ```ts block in the README
 * follows a `<!-- snippet: NAME -->` line, and its text must equal the
 * `// #region NAME` block in a file under `examples/`.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
const EXAMPLES = join(PACKAGE_DIR, 'examples')

/** Every `// #region NAME` block of the example files, by name. */
function regions(): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of readdirSync(EXAMPLES).filter((f) => f.endsWith('.ts'))) {
    const text = readFileSync(join(EXAMPLES, file), 'utf-8')
    for (const m of text.matchAll(/^\/\/ #region (\S+)\n([\s\S]*?)^\/\/ #endregion \1$/gm)) {
      out.set(m[1]!, m[2]!)
    }
  }
  return out
}

/** Every ```ts block of the README, with the snippet name on the line before it, if any. */
function readmeBlocks(): { name: string | null; code: string }[] {
  return [...README.matchAll(/^(?:<!-- snippet: (\S+) -->\n\n)?```ts\n([\s\S]*?)^```$/gm)].map(
    (m) => ({ name: m[1] ?? null, code: m[2]! }),
  )
}

test('every ts block in the README names a snippet', () => {
  const blocks = readmeBlocks()
  expect(blocks.length).toBeGreaterThan(0)
  expect(blocks.filter((b) => b.name === null).map((b) => b.code.split('\n')[0])).toEqual([])
})

test('each README snippet equals its region in examples/', () => {
  const found = regions()
  for (const { name, code } of readmeBlocks()) {
    expect(found.has(name!), `no region ${name} in examples/`).toBe(true)
    expect(code).toBe(found.get(name!)!)
  }
})

test('every region in examples/ is used by the README', () => {
  const used = new Set(readmeBlocks().map((b) => b.name))
  expect([...regions().keys()].filter((name) => !used.has(name))).toEqual([])
})
