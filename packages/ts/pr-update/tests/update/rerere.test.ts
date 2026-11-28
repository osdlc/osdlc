/**
 * A clone's rerere cache, held by one run: the lock, and emptying that fails closed. Against a
 * real repository; a failing removal is injected, since no permission makes `rm` fail on every
 * platform while git can still replay.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { spawnRunner } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'

import { claimProcessLock } from '../../src/process-lock.ts'
import { RERERE_LOCK, clearRerere, takeRerere } from '../../src/update/rerere.ts'

let dir: string
let git: Git
const cache = (): string => join(dir, '.git', 'rr-cache')
const lock = (): string => join(dir, '.git', RERERE_LOCK)
const fails = (): void => {
  throw new Error('EACCES')
}

beforeEach(() => {
  dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-rerere-')))
  spawnRunner('git').run(['init', '-q', dir], { cwd: tmpdir() })
  git = new Git(dir)
  mkdirSync(join(cache(), 'abc'), { recursive: true })
  writeFileSync(join(cache(), 'abc', 'postimage'), 'x\n')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('the rerere cache', () => {
  test('a run takes the lock and an empty cache, holds it, and empties it again as it lets go', () => {
    const held = takeRerere(git)
    expect(held?.on).toBe(true)
    expect(existsSync(cache())).toBe(false)
    expect(existsSync(lock())).toBe(true)
    // Another run cannot have it meanwhile.
    expect(takeRerere(git)).toBeNull()
    mkdirSync(join(cache(), 'def'), { recursive: true })
    held!.release()
    expect(existsSync(cache())).toBe(false)
    expect(existsSync(lock())).toBe(false)
    expect(held!.on).toBe(false)
  })

  test('a lock another live process holds leaves the run without rerere, and the cache as it is', () => {
    expect(claimProcessLock(lock(), 0)).not.toBeNull()
    expect(takeRerere(git)).toBeNull()
    expect(existsSync(join(cache(), 'abc', 'postimage'))).toBe(true)
  })

  test('a cache that cannot be emptied when the lock is taken leaves the run without rerere, and the lock free', () => {
    expect(takeRerere(git, fails)).toBeNull()
    expect(existsSync(lock())).toBe(false)
  })

  test('a cache that cannot be emptied after a PR turns rerere off for the rest of the run', () => {
    let failing = false
    const held = takeRerere(git, (p) =>
      failing ? fails() : rmSync(p, { recursive: true, force: true }),
    )
    expect(held?.on).toBe(true)
    failing = true
    held!.clear()
    expect(held!.on).toBe(false)
    held!.release()
    expect(existsSync(lock())).toBe(false)
  })

  test('emptying fails when the git directory cannot be found', () => {
    expect(clearRerere(new Git(join(dir, 'nowhere')))).toBe(false)
    expect(clearRerere(git)).toBe(true)
  })
})
