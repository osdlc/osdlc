/**
 * Runs every example module in this folder. Each one exports `run()` and asserts what it
 * shows, so a README snippet taken from an example stays true.
 */

import { describe, expect, test } from 'vitest'

import { readdirSync } from 'node:fs'

const dir = new URL('./', import.meta.url)
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort()

describe('examples', () => {
  test('the folder is not empty', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test.each(files)('%s', async (file) => {
    const example = (await import(new URL(file, dir).href)) as { run?: () => unknown }
    expect(typeof example.run).toBe('function')
    await example.run?.()
  })
})
