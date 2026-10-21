import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const DIST = join(PACKAGE_DIR, 'dist')

// The `isUnder` cases live in the shared parity fixture's `is_under` section.

/** Every module specifier in one built file's import and export lines. */
function specifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!)
}

// Needs `pnpm run build` first, as the smoke test does.
describe.skipIf(!existsSync(join(DIST, 'lexical-entry.js')))('built lexical entry', () => {
  test('nothing reachable from it imports node:', () => {
    const seen = new Set<string>()
    const queue = [join(DIST, 'lexical-entry.js')]
    while (queue.length > 0) {
      const file = queue.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      for (const spec of specifiers(readFileSync(file, 'utf-8'))) {
        expect(spec.startsWith('.'), `${file} imports ${spec}`).toBe(true)
        queue.push(resolve(dirname(file), spec))
      }
    }
    expect([...seen].map((f) => f.slice(DIST.length + 1)).sort()).toEqual([
      'lexical-entry.js',
      'lexical.js',
    ])
  })
})
