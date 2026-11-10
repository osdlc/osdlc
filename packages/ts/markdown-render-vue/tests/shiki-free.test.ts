/**
 * Pins the import graph: this package never reaches Shiki. A consumer that does
 * not import `@osdlc/markdown-render/shiki` must ship no Shiki chunk.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test('no module in src imports Shiki', () => {
  const root = resolve(import.meta.dirname, '../src')
  const offenders = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => /from\s+['"][^'"]*shiki/i.test(readFileSync(resolve(root, file), 'utf8')))
  expect(offenders).toEqual([])
})
