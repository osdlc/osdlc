/**
 * Pins the import graph: the main entry never reaches Shiki. A
 * consumer that does not import `@osdlc/markdown-render/shiki` must ship no
 * Shiki chunk — hundreds of grammar files otherwise ride into every build.
 *
 * The graph is walked statically, from the entry through every relative import
 * (static or dynamic), collecting the bare specifiers each module names. A
 * bundler follows the same edges, so a module that names Shiki is in the
 * bundle.
 */

import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const src = (name: string) => resolve(import.meta.dirname, `../src/${name}`)

/** Every `from '…'` and `import('…')` specifier in a module's source. */
function specifiers(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/(?:from|import\s*\()\s*['"]([^'"]+)['"]/g)) {
    found.push(match[1] as string)
  }
  return found
}

/** The modules reachable from `entry` by relative imports, and the bare specifiers they name. */
function graph(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>()
  const bare = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (files.has(file)) continue
    files.add(file)
    for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('.')) {
        bare.add(specifier)
        continue
      }
      const target = resolve(dirname(file), specifier)
      if (existsSync(target)) queue.push(target)
    }
  }
  return { files, bare }
}

/** What in the graphs of `entries` is Shiki: a file named for it or a specifier that imports it. */
function shikiMentions(entries: string[]): string[] {
  return entries.flatMap((entry) => {
    const { files, bare } = graph(entry)
    return [
      ...[...files].filter((file) => /shiki/i.test(file.slice(src('').length))),
      ...[...bare].filter((specifier) => /^shiki(\/|$)/.test(specifier)),
    ]
  })
}

describe('import graph', () => {
  test('the main entry reaches no Shiki', () => {
    expect(shikiMentions([src('index.ts')])).toEqual([])
  })

  test('the /shiki subpath does reach Shiki, so the check above can fail', () => {
    expect(shikiMentions([src('shiki.ts')]).length).toBeGreaterThan(0)
  })
})
