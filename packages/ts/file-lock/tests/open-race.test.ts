/**
 * A lock path replaced between the lstat check and the open. Systems report
 * the failed open with different codes, so the reader looks at the path again
 * instead of trusting the code: a regular file there now is read, a non-file
 * is a NotALockError, and nothing there means the claim tries the link again.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { claimLock } from '../src/index.ts'

const failOpen = vi.hoisted(() => ({
  path: undefined as string | undefined,
  code: 'ELOOP',
  times: 0,
}))

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const openSync = ((...args: Parameters<typeof real.openSync>) => {
    if (failOpen.times > 0 && String(args[0]) === failOpen.path) {
      failOpen.times -= 1
      throw Object.assign(new Error(`${failOpen.code}: injected`), { code: failOpen.code })
    }
    return real.openSync(...args)
  }) as typeof real.openSync
  return { ...real, default: { ...real, openSync }, openSync }
})

let dir: string
let lock: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-open-race-'))
  lock = join(dir, 'x.lock')
  writeFileSync(lock, JSON.stringify({ pid: process.pid, token: 'live' }))
})
afterEach(() => {
  failOpen.times = 0
  rmSync(dir, { recursive: true, force: true })
})

test.each(['ELOOP', 'EMLINK', 'EFTYPE', 'ENXIO', 'EOPNOTSUPP'])(
  'an open failing with %s once, on a path that is a lock file again, is retried',
  (code) => {
    Object.assign(failOpen, { path: lock, code, times: 1 })
    const claim = claimLock(lock, {}, { isStale: () => false })
    expect(claim.ok).toBe(false)
    if (!claim.ok) expect(claim.holder?.content?.token).toBe('live')
  },
)

test('an open that keeps failing on a lock file throws its error', () => {
  Object.assign(failOpen, { path: lock, code: 'EACCES', times: 2 })
  expect(() => claimLock(lock, {}, { isStale: () => false })).toThrow('EACCES')
})
