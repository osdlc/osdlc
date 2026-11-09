import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { claimLock, releaseLock, touchLock, updateLock } from '../src/index.ts'

import { afterMarkersExpire, age, markerFor } from './helpers.ts'

let dir: string
let lock: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-held-'))
  lock = join(dir, 'x.lock')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const never = { isStale: (): boolean => false }
const always = { isStale: (): boolean => true }

/** What the rule was shown when a claim found `lock` held. */
function judged(): unknown {
  let seen: unknown = 'unset'
  claimLock(
    lock,
    {},
    {
      isStale: (h) => {
        seen = h
        return false
      },
    },
  )
  return seen
}

function claimed(r: ReturnType<typeof claimLock>): string {
  if (!r.ok) throw new Error('expected the claim to succeed')
  return r.token
}

describe('claimLock', () => {
  test('claims a free lock with its fields and a token, and leaves no temp file', () => {
    const token = claimed(claimLock(lock, { who: 'a' }, never))
    expect(readdirSync(dir)).toEqual(['x.lock'])
    expect(JSON.parse(readFileSync(lock, 'utf-8'))).toEqual({ who: 'a', token })
    const held = claimLock(lock, { who: 'b' }, never)
    expect(held.ok).toBe(false)
    if (!held.ok) expect(held.holder?.content).toMatchObject({ who: 'a', token })
  })

  test('a token field in the content is replaced by the claim token', () => {
    const token = claimed(claimLock(lock, { token: 'mine' }, never))
    expect(token).not.toBe('mine')
    expect(JSON.parse(readFileSync(lock, 'utf-8')).token).toBe(token)
  })

  test('a stale lock is replaced; the old owner cannot release the new one', () => {
    const first = claimed(claimLock(lock, {}, never))
    const second = claimed(claimLock(lock, {}, always))
    expect(releaseLock(lock, first)).toBe(false)
    expect(existsSync(lock)).toBe(true)
    expect(releaseLock(lock, second)).toBe(true)
    expect(existsSync(lock)).toBe(false)
  })

  test('the rule sees the held content, mtime and raw text', () => {
    writeFileSync(lock, JSON.stringify({ pid: 1, token: 't' }))
    expect(judged()).toEqual({
      content: { pid: 1, token: 't' },
      mtimeMs: statSync(lock).mtimeMs,
      raw: JSON.stringify({ pid: 1, token: 't' }),
    })
  })

  test('a lock whose content exceeds the file-name limit is still taken over', () => {
    claimed(claimLock(lock, { root: '/r'.repeat(300) }, never))
    claimed(claimLock(lock, {}, always))
    expect(readdirSync(dir)).toEqual(['x.lock'])
  })

  test('a marker left by a reaper that died mid-takeover does not block later takeovers', () => {
    writeFileSync(lock, JSON.stringify({ token: 'dead' }))
    // the dead reaper got as far as linking its marker
    linkSync(lock, markerFor(lock, readFileSync(lock, 'utf-8')))
    // a young marker may belong to a live reaper: the claim is not granted over it,
    // and the stale lock is not reported as a live holder
    expect(claimLock(lock, {}, always)).toEqual({ ok: false, holder: null })
    // an old one is a dead reaper's: it is cleared and the takeover goes through
    claimed(afterMarkersExpire(() => claimLock(lock, {}, always)))
    expect(readdirSync(dir)).toEqual(['x.lock'])
  })

  test('an unparseable lock reaches the rule with null content', () => {
    for (const raw of ['not json', '[1]', '7', JSON.stringify({ token: 7 })]) {
      writeFileSync(lock, raw)
      expect(judged()).toMatchObject({ content: null })
    }
  })

  test('a lock written without a token reaches the rule with its fields', () => {
    writeFileSync(lock, JSON.stringify({ pid: 12 }))
    expect(judged()).toMatchObject({ content: { pid: 12 } })
  })

  test('claimants taking one stale lock one after another: exactly one wins', async () => {
    writeFileSync(lock, JSON.stringify({ token: 'dead' }))
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        Promise.resolve().then(() =>
          claimLock(lock, {}, { isStale: (h) => h.content?.token === 'dead' }),
        ),
      ),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(1)
  })

  test('a missing directory is thrown, not reported as held', () => {
    expect(() => claimLock(join(dir, 'missing', 'x.lock'), {}, never)).toThrow(/ENOENT/)
  })
})

describe('touchLock', () => {
  function ageLock(): number {
    age(lock)
    return statSync(lock).mtimeMs
  }

  test('refreshes the mtime while the lock holds the token', () => {
    const token = claimed(claimLock(lock, {}, never))
    const before = ageLock()
    expect(touchLock(lock, token)).toBe(true)
    expect(statSync(lock).mtimeMs).toBeGreaterThan(before)
  })

  test('leaves a lock with another token alone', () => {
    claimed(claimLock(lock, {}, never))
    const before = ageLock()
    expect(touchLock(lock, 'not-mine')).toBe(false)
    expect(statSync(lock).mtimeMs).toBe(before)
  })

  test('a missing lock is not an error', () => {
    expect(touchLock(lock, 'any')).toBe(false)
  })
})

describe('updateLock', () => {
  test('rewrites the content and keeps the token', () => {
    const token = claimed(claimLock(lock, { pid: 1, holders: [] as number[] }, never))
    expect(
      updateLock<{ pid: number; holders: number[] }>(lock, token, (c) => ({
        ...c,
        holders: [...c.holders, 2],
      })),
    ).toBe(true)
    expect(JSON.parse(readFileSync(lock, 'utf-8'))).toEqual({ pid: 1, holders: [2], token })
    expect(readdirSync(dir)).toEqual(['x.lock'])
    expect(releaseLock(lock, token)).toBe(true)
  })

  test('leaves a lock with another token alone', () => {
    claimed(claimLock(lock, { pid: 1 }, never))
    const before = readFileSync(lock, 'utf-8')
    expect(updateLock(lock, 'not-mine', () => ({ pid: 2 }))).toBe(false)
    expect(readFileSync(lock, 'utf-8')).toBe(before)
  })

  test('a missing lock is not an error, and leaves no temp file', () => {
    expect(updateLock(lock, 'any', () => ({}))).toBe(false)
    expect(readdirSync(dir)).toEqual([])
  })

  test('an update that throws is rethrown, and leaves the lock as it was and no temp file', () => {
    const token = claimed(claimLock(lock, { pid: 1 }, never))
    const before = readFileSync(lock, 'utf-8')
    expect(() =>
      updateLock(lock, token, () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(readFileSync(lock, 'utf-8')).toBe(before)
    expect(readdirSync(dir)).toEqual(['x.lock'])
  })
})

describe('releaseLock', () => {
  test('removes our lock and leaves nothing beside it', () => {
    const token = claimed(claimLock(lock, {}, never))
    expect(releaseLock(lock, token)).toBe(true)
    expect(readdirSync(dir)).toEqual([])
  })

  test("leaves a taker's lock in place and nothing beside it", () => {
    claimed(claimLock(lock, {}, never))
    const taker = claimed(claimLock(lock, {}, always))
    expect(releaseLock(lock, 'old-owner')).toBe(false)
    expect(JSON.parse(readFileSync(lock, 'utf-8')).token).toBe(taker)
    expect(readdirSync(dir)).toEqual(['x.lock'])
  })

  test('a missing lock is not an error', () => {
    expect(releaseLock(lock, 'any')).toBe(false)
  })

  test('a lock without a token is never released', () => {
    writeFileSync(lock, JSON.stringify({ pid: 1 }))
    expect(releaseLock(lock, 'any')).toBe(false)
    expect(existsSync(lock)).toBe(true)
  })
})

describe('errors other than "gone" are thrown, not reported as a lost lock', () => {
  // A directory where the lock should be: every read fails with EISDIR, as EACCES or EIO would.
  beforeEach(() => mkdirSync(lock))

  test('touchLock', () => {
    expect(() => touchLock(lock, 'any')).toThrow(/EISDIR/)
  })

  test('updateLock', () => {
    expect(() => updateLock(lock, 'any', () => ({}))).toThrow(/EISDIR/)
  })

  test('releaseLock', () => {
    expect(() => releaseLock(lock, 'any')).toThrow(/EISDIR/)
  })
})
