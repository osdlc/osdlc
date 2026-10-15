/**
 * `package.json` `files` ships every source module. The `bun` export
 * condition loads `.ts` sources from the tarball, so a module missing from
 * `files` breaks Bun consumers while `bun test` here still passes.
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import { ENTRY_POINTS, MANIFEST } from '../examples/support/scenarios.ts'

const PACKAGE_DIR = join(import.meta.dir, '..')

test('files lists every entry point source and every root module', () => {
  const sources = readdirSync(PACKAGE_DIR).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
  )
  const wanted = [...new Set([...ENTRY_POINTS.map((e) => e.file), ...sources])]

  expect(sources).toContain('testing.ts')
  expect(wanted.filter((f) => !MANIFEST.files.includes(f))).toEqual([])
})

test('files ships SECURITY.md and CONTRIBUTING.md', () => {
  expect(MANIFEST.files).toEqual(expect.arrayContaining(['SECURITY.md', 'CONTRIBUTING.md']))
})

test('files ships dist/, where the types and default conditions point', () => {
  expect(MANIFEST.files).toContain('dist/')
  for (const { types, default: js } of Object.values(MANIFEST.exports)) {
    expect(types).toStartWith('./dist/')
    expect(js).toStartWith('./dist/')
  }
})
