/**
 * Runs every file in `examples/`. Each one exports `run()` and asserts what it
 * shows, so a README snippet taken from an example stays true.
 */

import { describe, expect, test } from 'bun:test'

import { readdirSync } from 'node:fs'

const dir = new URL('../examples/', import.meta.url)
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.ts'))
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
