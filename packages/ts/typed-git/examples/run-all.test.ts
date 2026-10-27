/**
 * Runs every example module in this folder. Each one exports `run()` and asserts what it
 * shows, so a README snippet taken from an example stays true.
 *
 * An example that uses a git feature newer than the 2.34 floor exports
 * `needs`, the features it uses. It skips with the reason on an older git.
 */

import { describe, expect, test } from 'vitest'

import { readdirSync } from 'node:fs'

import type { GitFeature } from '../src/features.ts'
import { missingGitFeature } from '../tests/local-git.ts'

const dir = new URL('./', import.meta.url)
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort()

describe('examples', () => {
  test('the folder is not empty', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test.for(files)('%s', async (file, ctx) => {
    const example = (await import(new URL(file, dir).href)) as {
      run?: () => unknown
      needs?: readonly GitFeature[]
    }
    expect(typeof example.run).toBe('function')
    const tooOld = missingGitFeature(...(example.needs ?? []))
    if (tooOld !== null) ctx.skip(tooOld)
    await example.run?.()
  })
})
