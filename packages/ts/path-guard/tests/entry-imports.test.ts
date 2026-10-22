/**
 * What each entry point loads. `./lexical` must load no `node:` module, so a
 * browser bundle can use it. `.` must load no `node:fs`: the filesystem comes
 * in through a `Resolver`. The source and, after `pnpm run build`, the built
 * `dist/` JavaScript and type declarations are checked.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const DIST = join(PACKAGE_DIR, 'dist')

/** Every module specifier in one file's import and export lines. */
function specifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!)
}

/**
 * The files reachable from `entry` by relative imports, and the other
 * specifiers they import. A `.d.ts` file names its siblings with `.ts`.
 */
function graph(entry: string, ext: string): { files: string[]; external: string[] } {
  const seen = new Set<string>()
  const external = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of specifiers(readFileSync(file, 'utf-8'))) {
      const target = ext === '.d.ts' ? spec.replace(/\.ts$/, '.d.ts') : spec
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), target))
      else external.add(spec)
    }
  }
  const base = dirname(entry)
  return {
    files: [...seen].map((f) => f.slice(base.length + 1)).sort(),
    external: [...external].sort(),
  }
}

const TREES = [
  { name: 'source', dir: join(PACKAGE_DIR, 'src'), ext: '.ts', present: true },
  { name: 'built', dir: DIST, ext: '.js', present: existsSync(join(DIST, 'index.js')) },
  { name: 'types', dir: DIST, ext: '.d.ts', present: existsSync(join(DIST, 'index.d.ts')) },
]

describe.each(TREES)('$name entries', ({ dir, ext, present }) => {
  test.skipIf(!present)('nothing reachable from ./lexical imports node:', () => {
    const { files, external } = graph(join(dir, `lexical-entry${ext}`), ext)
    expect(external).toEqual([])
    // The types need no `text` module, which holds only implementation.
    const allowed = ['errors', 'lexical-entry', 'lexical', 'text'].map((name) => name + ext)
    expect(files.filter((file) => !allowed.includes(file))).toEqual([])
  })

  test.skipIf(!present)('nothing reachable from . imports node:fs', () => {
    const { external } = graph(join(dir, `index${ext}`), ext)
    expect(external).toEqual(['node:path'])
  })

  test.skipIf(!present)('./node is where node:fs comes in', () => {
    const { external } = graph(join(dir, `node${ext}`), ext)
    expect(external).toEqual(['node:fs', 'node:fs/promises', 'node:path'])
  })
})
