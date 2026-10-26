/**
 * The package stands alone: no import reaches into a consumer (a path alias or
 * a relative path out of the package), nothing spawns a process except through
 * `@osdlc/command-seam`, files are written atomically through
 * `@osdlc/etag-write`, and nothing needs Bun.
 */

import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', 'src')
const sources = readdirSync(root)
  .filter((f) => f.endsWith('.ts') && f !== 'vitest.config.ts')
  .map((f) => ({ file: f, text: readFileSync(join(root, f), 'utf-8') }))

/** Every module specifier: `from '…'`, `import '…'`, `import('…')` and `require('…')`, either quote. */
const specifiers = (text: string): string[] =>
  [
    ...text.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g),
    ...text.matchAll(/\bimport\s*(['"])([^'"]+)\1/g),
    ...text.matchAll(/\b(?:import|require)\s*\(\s*(['"])([^'"]+)\1/g),
  ].map((m) => m[2]!)

describe('package boundary', () => {
  test('scans the source', () => {
    expect(sources.map((s) => s.file)).toContain('model.ts')
  })

  test('imports only node builtins, zod, command-seam, etag-write, tiered-dirs and its own modules', () => {
    const outside = sources.flatMap(({ file, text }) =>
      specifiers(text)
        .filter(
          (s) =>
            !s.startsWith('node:') &&
            s !== 'zod' &&
            s !== '@osdlc/command-seam' &&
            s !== '@osdlc/etag-write' &&
            s !== '@osdlc/tiered-dirs' &&
            !/^\.\/[a-z-]+\.ts$/.test(s),
        )
        .map((s) => `${file}: ${s}`),
    )
    expect(outside).toEqual([])
  })

  test('the specifier scan sees every import form', () => {
    expect(
      specifiers(
        [
          "import { a } from 'x-static'",
          'export * from "x-double"',
          "import 'x-side-effect'",
          "const m = await import('x-dynamic')",
          'const r = require("x-require")',
        ].join('\n'),
      ),
    ).toEqual(['x-static', 'x-double', 'x-side-effect', 'x-dynamic', 'x-require'])
  })

  test('uses no Bun API', () => {
    expect(sources.filter(({ text }) => /\bBun\.|bun:/.test(text)).map((s) => s.file)).toEqual([])
  })

  test('never imports child_process', () => {
    expect(sources.filter(({ text }) => text.includes('child_process')).map((s) => s.file)).toEqual(
      [],
    )
  })
})
