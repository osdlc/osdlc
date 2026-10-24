/**
 * The documented exports: every export has TSDoc, the `@experimental` tags
 * match the README's "Experimental" list, every stable export is used in an
 * example that imports only the package by name, and every README `ts` block
 * is run by an example.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { listDiff, publicExports, readmeExperimental } from './api.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const exportsList = publicExports()

describe('TSDoc', () => {
  test('every export of every entry point has a doc comment', () => {
    const missing = exportsList.filter((e) => !e.documented).map((e) => `${e.entry} ${e.name}`)
    expect(missing).toEqual([])
  })
})

describe('experimental exports', () => {
  const tagged = [...new Set(exportsList.filter((e) => e.experimental).map((e) => e.name))]

  test('the README "Experimental" list names exactly the exports tagged @experimental', () => {
    const listed = readmeExperimental(readme)
    expect(listed.length).toBeGreaterThan(0)
    expect(listDiff(tagged, listed)).toEqual({ untaggedButListed: [], taggedButNotListed: [] })
  })

  test('the comparison reports a tag with no list entry, and a list entry with no tag', () => {
    expect(listDiff(['a', 'b'], ['b', 'c'])).toEqual({
      untaggedButListed: ['c'],
      taggedButNotListed: ['a'],
    })
  })

  test('the whole ./locations and ./model entries are experimental, except the shared REDACTED', () => {
    const untagged = exportsList
      .filter((e) => e.entry !== '.' && !e.experimental)
      .map((e) => e.name)
    expect(untagged).toEqual(['REDACTED'])
  })
})

describe('examples', () => {
  const dir = join(root, 'examples')
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.ts'))
  const sources = files.map((f) => readFileSync(join(dir, f), 'utf8'))
  const all = sources.join('\n')

  /** The names imported from the package's own entry points. */
  const imported = (): Set<string> => {
    const names = new Set<string>()
    const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'(@osdlc\/detect-harness[^']*)'/g
    for (const m of all.matchAll(re)) {
      for (const part of m[1]!.split(',')) {
        const name = part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]!
        if (name) names.add(name)
      }
    }
    return names
  }

  test('examples import only the package by name', () => {
    for (const src of sources) {
      for (const m of src.matchAll(/from\s*'([^']+)'/g)) {
        const spec = m[1]!
        expect(
          spec.startsWith('@osdlc/detect-harness') || spec.startsWith('node:') || spec === 'vitest',
          spec,
        ).toBe(true)
      }
    }
  })

  test('every stable export is imported by an example', () => {
    const names = imported()
    const stable = exportsList.filter((e) => e.entry === '.' && !e.experimental)
    expect(stable.filter((e) => !names.has(e.name)).map((e) => e.name)).toEqual([])
  })

  test('every experimental export is imported by an example', () => {
    const names = imported()
    const missing = exportsList
      .filter((e) => e.experimental && e.entry !== '.')
      .filter((e) => !names.has(e.name))
      .map((e) => e.name)
    expect(missing).toEqual([])
  })

  test('every README ts block is in an example, apart from its import lines', () => {
    const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()
    const haystack = squash(all)
    const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!)
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      const body = block
        .split('\n')
        .filter((line) => !/^import\s/.test(line))
        .join('\n')
      expect(haystack.includes(squash(body)), `not in examples/: ${body}`).toBe(true)
    }
  })
})
