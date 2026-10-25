/**
 * A grant whose rename fails. On Windows a rename onto a marker another call
 * is writing can fail with EPERM; the mock makes that happen on every
 * platform.
 */

import { afterAll, describe, expect, test, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const failure = vi.hoisted(() => ({ writeFirst: true }))

vi.mock('@osdlc/etag-write', async (importOriginal) => {
  const real = await importOriginal<typeof import('@osdlc/etag-write')>()
  return {
    ...real,
    atomicWriteAsync: async (...args: Parameters<typeof real.atomicWriteAsync>) => {
      // The other call's write landed before this one's rename failed.
      if (failure.writeFirst) await real.atomicWriteAsync(...args)
      throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })
    },
  }
})

const { trustStore } = await import('../src/index.ts')

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'trust-repo-race-'))
  roots.push(dir)
  return dir
}

describe('a grant whose rename fails', () => {
  test('succeeds when the marker is there, written by another call', async () => {
    failure.writeFirst = true
    const h = await root()
    const store = trustStore({ tool: 'tooly', env: { XDG_STATE_HOME: join(h, 's') }, home: h })
    const repo = await root()
    await expect(store.trust(repo)).resolves.toMatchObject({ alreadyTrusted: false })
    expect(await store.isTrusted(repo)).toBe(true)
  })

  test('throws when no marker was written', async () => {
    failure.writeFirst = false
    const h = await root()
    const store = trustStore({ tool: 'tooly', env: { XDG_STATE_HOME: join(h, 's') }, home: h })
    const repo = await root()
    await expect(store.trust(repo)).rejects.toThrow('EPERM')
    expect(await store.isTrusted(repo)).toBe(false)
  })
})
