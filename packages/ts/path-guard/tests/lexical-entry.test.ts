import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { isUnder } from '../lexical-entry.ts'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const DIST = join(PACKAGE_DIR, 'dist')

describe('isUnder', () => {
  test('the same path is under itself', () => {
    expect(isUnder('/vault', '/vault')).toBe(true)
    expect(isUnder('/', '/')).toBe(true)
  })

  test('a child and a deeper descendant are under the root', () => {
    expect(isUnder('/vault', '/vault/a.md')).toBe(true)
    expect(isUnder('/vault', '/vault/a/b/c.md')).toBe(true)
    expect(isUnder('/', '/etc')).toBe(true)
  })

  test('a sibling that shares a name prefix is not under the root', () => {
    expect(isUnder('/vault', '/vault2')).toBe(false)
    expect(isUnder('/vault', '/vault2/a.md')).toBe(false)
    expect(isUnder('/vault', '/vaul')).toBe(false)
  })

  test('the parent of the root is not under it', () => {
    expect(isUnder('/vault/a', '/vault')).toBe(false)
  })

  test('a .. in either input is folded as text', () => {
    expect(isUnder('/vault', '/vault/../etc')).toBe(false)
    expect(isUnder('/vault', '/vault/a/../b.md')).toBe(true)
    expect(isUnder('/vault/a/..', '/vault/b')).toBe(true)
    expect(isUnder('/vault', '/../vault/a')).toBe(true)
  })

  test('. and repeated or trailing slashes are ignored', () => {
    expect(isUnder('/vault/', '/vault/a.md')).toBe(true)
    expect(isUnder('/vault', '/vault/a/')).toBe(true)
    expect(isUnder('/vault', '/vault//./a')).toBe(true)
  })

  test('a relative input gives false and does not throw', () => {
    expect(isUnder('/vault', 'a.md')).toBe(false)
    expect(isUnder('vault', '/vault/a.md')).toBe(false)
    expect(isUnder('', '/vault')).toBe(false)
    expect(isUnder('/vault', '')).toBe(false)
  })
})

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
