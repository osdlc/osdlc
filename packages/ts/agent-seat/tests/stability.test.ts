/**
 * The README's "Stability" section lists every export tagged `@experimental`, and only those.
 */
import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import { publicExports } from './fixtures/exports.ts'

test('the README lists exactly the experimental exports', () => {
  const exports = publicExports()
  const names = new Set(exports.map((e) => e.name))
  const tagged = exports
    .filter((e) => e.experimental)
    .map((e) => e.name)
    .sort()
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const start = readme.indexOf('## Stability')
  const section = readme.slice(start, readme.indexOf('\n## ', start + 1))
  const listed = [
    ...new Set([...section.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((m) => m[1]!)),
  ]
    .filter((name) => names.has(name))
    .sort()
  expect(tagged.length).toBeGreaterThan(0)
  expect(listed).toEqual(tagged)
})
