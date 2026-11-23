/**
 * A move of an old store whose copy fails partway. The mock makes one marker
 * write of the move fail, as a full disk would, or land with the wrong bytes.
 */

import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdir, mkdtemp, readdir, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const failure = vi.hoisted(() => ({ failAt: 0, corruptAt: 0, writes: 0 }))

vi.mock('@osdlc/etag-write', async (importOriginal) => {
  const real = await importOriginal<typeof import('@osdlc/etag-write')>()
  return {
    ...real,
    atomicWriteAsync: async (...args: Parameters<typeof real.atomicWriteAsync>) => {
      failure.writes += 1
      if (failure.writes === failure.failAt) {
        throw Object.assign(new Error('ENOSPC: no space left on device, write'), {
          code: 'ENOSPC',
        })
      }
      if (failure.writes === failure.corruptAt) return real.atomicWriteAsync(args[0], '', args[2])
      return real.atomicWriteAsync(...args)
    },
  }
})

const { envVars } = await import('@osdlc/tiered-dirs')
const { trustStore } = await import('../src/index.ts')

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
})

beforeEach(() => {
  failure.failAt = 0
  failure.corruptAt = 0
  failure.writes = 0
})

describe('a move whose copy fails partway', () => {
  test('leaves no new store, keeps the old one, fails closed, and succeeds on the next call', async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'trust-repo-move-')))
    roots.push(home)
    const env = { XDG_STATE_HOME: join(home, '.local', 'state') }
    const repos = [join(home, 'one'), join(home, 'two')] as const
    for (const r of repos) await mkdir(r)
    const legacy = trustStore({ tool: 'pr-update', env, home })
    await legacy.trust(repos[0])
    await legacy.trust(repos[1])

    const vendorDirs = { vendor: 'osdlc', envVars: envVars('OSDLC') }
    const store = trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs, env, home })
    failure.writes = 0
    failure.failAt = 2

    await expect(store.isTrusted(repos[0])).rejects.toThrow(/ENOSPC/)
    await expect(stat(store.dir())).rejects.toThrow()
    await expect(store.trust(repos[0])).resolves.toMatchObject({ alreadyTrusted: true })
    // The second call above retried the move, with no failure left to hit.
    failure.writes = 0
    failure.failAt = 1
    const fresh = trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs, env, home })
    // A moved store is not moved again, so no write happens and none fails.
    expect(await fresh.isTrusted(repos[1])).toBe(true)
    expect(failure.writes).toBe(0)
    expect(await legacy.list()).toHaveLength(2)
  })

  test('a failed move leaves nothing behind, and the read-only methods do not throw', async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'trust-repo-move-')))
    roots.push(home)
    const env = { XDG_STATE_HOME: join(home, '.local', 'state') }
    const repo = join(home, 'one')
    await mkdir(repo)
    await trustStore({ tool: 'pr-update', env, home }).trust(repo)
    await trustStore({ tool: 'pr-update', env, home }).trust(repo, 'just')

    const vendorDirs = { vendor: 'osdlc', envVars: envVars('OSDLC') }
    const store = trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs, env, home })
    failure.writes = 0
    failure.failAt = 2

    expect(await store.list()).toEqual([])
    await expect(stat(store.dir())).rejects.toThrow()
    // The staging folder was removed, so the parent holds nothing.
    expect(await readdir(dirname(store.dir()))).toEqual([])
    failure.failAt = 0
    expect(await store.isTrusted(repo, 'just')).toBe(true)
  })
  test('a copy that does not read back is not published', async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'trust-repo-move-')))
    roots.push(home)
    const env = { XDG_STATE_HOME: join(home, '.local', 'state') }
    const repos = [join(home, 'one'), join(home, 'two')] as const
    for (const r of repos) await mkdir(r)
    for (const r of repos) await trustStore({ tool: 'pr-update', env, home }).trust(r)

    const vendorDirs = { vendor: 'osdlc', envVars: envVars('OSDLC') }
    const store = trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs, env, home })
    failure.writes = 0
    failure.corruptAt = 2

    await expect(store.isTrusted(repos[0])).rejects.toThrow(/did not read back/)
    await expect(stat(store.dir())).rejects.toThrow()
    expect(await readdir(dirname(store.dir()))).toEqual([])
    expect(await store.isTrusted(repos[1])).toBe(true)
  })
})
