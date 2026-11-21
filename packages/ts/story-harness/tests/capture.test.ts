import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

import { captureStories } from '../src/runner/capture.ts'

let dir: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  if (dir) await rm(dir, { recursive: true, force: true })
})

it('fails, naming the filter, when no story matches, and starts nothing', async () => {
  dir = await mkdtemp(join(tmpdir(), 'capture-empty-'))
  await writeFile(
    join(dir, 'index.json'),
    JSON.stringify({ entries: { 'card--plain': { type: 'story' } } }),
  )
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  // It returns before it serves or launches anything.
  const ok = await captureStories({ storybookDir: dir, prefix: 'crad--', outDir: dir, port: 1 })
  expect(ok).toBe(false)
  expect(error).toHaveBeenCalledWith(`no story in ${dir} matches crad--*`)
})
