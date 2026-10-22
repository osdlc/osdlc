/**
 * `package.json` `files` ships the built `dist/` and no TypeScript source:
 * `exports` has one condition pair, `types` and `default`, both under `dist/`.
 */

import { expect, test } from 'vitest'

import { ENTRY_POINTS, MANIFEST } from '../examples/support/scenarios.ts'

test('every entry point has a source file under src/', () => {
  expect(ENTRY_POINTS.map((e) => e.file)).toContain('src/testing.ts')
  for (const { file } of ENTRY_POINTS) expect(file).toMatch(/^src\/[\w-]+\.ts$/)
})

test('files ships SECURITY.md and CONTRIBUTING.md', () => {
  expect(MANIFEST.files).toEqual(expect.arrayContaining(['SECURITY.md', 'CONTRIBUTING.md']))
})

test('files ships dist/, where the types and default conditions point', () => {
  expect(MANIFEST.files).toContain('dist/')
  for (const { types, default: js } of Object.values(MANIFEST.exports)) {
    expect(types.startsWith('./dist/')).toBe(true)
    expect(js.startsWith('./dist/')).toBe(true)
  }
})

test('files ships no TypeScript source', () => {
  expect(MANIFEST.files.filter((f) => /\.ts$/.test(f) && !f.endsWith('.d.ts'))).toEqual([])
})

test('exports has no bun condition', () => {
  for (const conditions of Object.values(MANIFEST.exports)) {
    expect(Object.keys(conditions).sort()).toEqual(['default', 'types'])
  }
})
