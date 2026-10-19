/**
 * `./core` must run without Node: in a browser bundle, for example. This walks the built import
 * graph of `dist/core/index.js` (built by `tests/global-setup.ts`) and checks that no module in
 * it imports a Node built-in, and that its package imports are the browser-safe parser stack.
 */
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))

/** The `from '...'` and `import('...')` specifiers of one built module. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return [
    ...text.matchAll(/(?:^|\s)(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g),
    ...text.matchAll(/(?:^|\s)import\s*['"]([^'"]+)['"]/g),
    ...text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]!)
}

/** Every module reachable from `entry` by relative import, and every bare specifier they use. */
function graph(entry: string): { files: string[]; bare: Set<string> } {
  const files: string[] = []
  const bare = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (files.includes(file)) continue
    files.push(file)
    for (const spec of specifiers(file)) {
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec))
      else bare.add(spec)
    }
  }
  return { files, bare }
}

const NODE_BUILTINS = new Set(builtinModules)

test('the built ./core graph imports no Node built-in', () => {
  const { files, bare } = graph(resolve(DIST, 'core/index.js'))
  expect(files.length).toBeGreaterThan(10)
  const node = [...bare].filter((s) => s.startsWith('node:') || NODE_BUILTINS.has(s))
  expect(node).toEqual([])
  expect([...bare].sort()).toEqual(
    [
      '@osdlc/gfm-table',
      'remark-frontmatter',
      'remark-gfm',
      'remark-parse',
      'unified',
      'yaml',
    ].sort(),
  )
})

test('the built root entry imports Node for the folder runner', () => {
  const root = graph(resolve(DIST, 'index.js'))
  expect([...root.bare].some((s) => s.startsWith('node:'))).toBe(true)
})
