/**
 * The README's Stability section says no export is experimental, beta or
 * alpha. This fails when a source file tags one, so the README is updated in
 * the same change.
 */
import { readFileSync, readdirSync } from 'node:fs'

import { expect, test } from 'vitest'

test('no export carries a stability tag', () => {
  const dir = new URL('../src/', import.meta.url)
  const tagged = readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => /@(experimental|beta|alpha)\b/.test(readFileSync(new URL(f, dir), 'utf8')))
  expect(tagged).toEqual([])
})
