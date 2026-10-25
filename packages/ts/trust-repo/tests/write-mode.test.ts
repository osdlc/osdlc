/**
 * A marker is written 0600 from the start. `trust()` tightens the store
 * afterwards, which would hide a marker written looser, so this checks the
 * mode right after the write.
 */

import { mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

const written = vi.hoisted(() => [] as { path: string; mode: number }[])

vi.mock('@osdlc/etag-write', async (importOriginal) => {
  const real = await importOriginal<typeof import('@osdlc/etag-write')>()
  return {
    ...real,
    atomicWriteAsync: async (...args: Parameters<typeof real.atomicWriteAsync>) => {
      const result = await real.atomicWriteAsync(...args)
      const path = String(args[0])
      written.push({ path, mode: (await stat(path)).mode & 0o777 })
      return result
    },
  }
})

const { trustStore } = await import('../src/index.ts')

const dirs: string[] = []
afterEach(async () => {
  written.length = 0
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

test.skipIf(process.platform === 'win32')(
  'every marker is 0600 as soon as it is written',
  async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'trust-repo-mode-')))
    dirs.push(base)
    const repo = join(base, 'repo')
    await mkdir(repo)
    const store = trustStore({ tool: 'tooly', env: {}, home: base })
    await store.trust(repo)
    await store.trust(repo, 'just')
    expect(written).toHaveLength(2)
    for (const w of written) expect(w.mode).toBe(0o600)
  },
)
