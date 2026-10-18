import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { EFFORT_LEVELS } from '../src/models.js'
import * as barrel from '../src/index.js'

/** Module specifiers of the real import/export-from statements in `src`; comments are stripped first. */
function importSpecifiers(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return [
    ...code.matchAll(
      /^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm,
    ),
  ].map((m) => (m[1] ?? m[2])!)
}

describe('models entry point', () => {
  test('exposes the effort levels in order, none to max', () => {
    expect([...EFFORT_LEVELS]).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  })

  test('the barrel re-exports the same values and no tier tables', () => {
    expect(barrel.EFFORT_LEVELS).toBe(EFFORT_LEVELS)
    expect(Object.keys(barrel).filter((k) => /tier/i.test(k))).toEqual([])
  })

  test('import extraction ignores comments and matches only real imports', () => {
    const fixture = [
      "// import x from 'node:fs'",
      "/* import y from 'node:path'",
      "   import z from 'fs' */",
      "import real from './real.js'",
      "export { a } from './other.js'",
    ].join('\n')
    expect(importSpecifiers(fixture)).toEqual(['./real.js', './other.js'])
    expect(importSpecifiers("import x from 'node:fs'")).toEqual(['node:fs'])
    expect(importSpecifiers("import {\n  a,\n} from 'node:fs'")).toEqual(['node:fs'])
  })

  test('its module graph imports nothing from Node', () => {
    const seen = new Set<string>()
    const walk = (file: string): void => {
      if (seen.has(file)) return
      seen.add(file)
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        expect(spec.startsWith('node:') || spec === 'fs' || spec === 'path').toBe(false)
        expect(spec.startsWith('.')).toBe(true) // no bare packages either
        walk(resolve(dirname(file), spec.replace(/\.js$/, '.ts')))
      }
    }
    const entry = resolve(import.meta.dirname, '../src/models.ts')
    walk(entry)
    expect(seen.has(entry)).toBe(true)
  })
})
