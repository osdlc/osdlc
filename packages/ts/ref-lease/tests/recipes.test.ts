/**
 * claim, updateWithRetry and release against a real bare authority.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  buildLeaseCommit,
  casReplace,
  CasFailed,
  claim,
  fetchRef,
  release,
  updateWithRetry,
} from '@osdlc/ref-lease'

import { makePair, REF, thrownBy, type Pair } from './_fixture.ts'

interface P {
  holder: string
  n: number
  live: boolean
}
const decode = (v: unknown): P => v as P

let env: Pair
beforeEach(() => {
  env = makePair()
})
afterEach(() => env.cleanup())

const read = () => fetchRef(env.authority, REF, { cwd: env.worker, decode })
const base = () => ({ cwd: env.worker, decode })
/** Move the ref behind a caller's back. */
function interfere(patch: Partial<P>): void {
  const cur = read()
  const sha = buildLeaseCommit(
    { ...cur.payload, ...patch },
    { cwd: env.worker, parentSha: cur.sha },
  )
  casReplace(env.authority, REF, cur.sha, sha, { cwd: env.worker })
}

const opts = (holder: string, extra: Record<string, unknown> = {}) => ({
  ...base(),
  build: (): P => ({ holder, n: 0, live: true }),
  isLive: (p: P) => p.live,
  ...extra,
})

describe('claim', () => {
  test('creates when absent, then reports the live holder', () => {
    const a = claim(env.authority, REF, opts('a'))
    expect(a).toMatchObject({ won: true, payload: { holder: 'a' } })
    expect(read().sha).toBe((a as { sha: string }).sha)
    expect(claim(env.authority, REF, opts('b'))).toEqual({
      won: false,
      payload: { holder: 'a', n: 0, live: true },
    })
  })

  test('takes over a lease that is not live, building from the previous one', () => {
    claim(env.authority, REF, opts('a'))
    interfere({ live: false })
    const seen: (P | null)[] = []
    const b = claim(env.authority, REF, {
      ...opts('b'),
      build: (prev: P | null): P => {
        seen.push(prev)
        return { holder: 'b', n: 1, live: true }
      },
    })
    expect(b.won).toBe(true)
    expect(seen).toEqual([{ holder: 'a', n: 0, live: false }])
    expect(read().payload.holder).toBe('b')
  })

  test('takes over its own live lease when isMine says so', () => {
    claim(env.authority, REF, opts('a'))
    const again = claim(env.authority, REF, opts('a', { isMine: (p: P) => p.holder === 'a' }))
    expect(again.won).toBe(true)
  })

  test('a lost swap reads again and then reports the new holder', () => {
    claim(env.authority, REF, opts('a'))
    interfere({ live: false })
    let first = true
    const r = claim(env.authority, REF, {
      ...opts('b'),
      isLive: (p: P) => {
        if (first) {
          first = false
          // Between our read and our swap, c takes it.
          claim(env.authority, REF, { ...opts('c'), isLive: () => false })
          return false
        }
        return p.live
      },
    })
    expect(r).toMatchObject({ won: false, payload: { holder: 'c' } })
  })

  test('gives up with CasFailed after `attempts` lost swaps', () => {
    claim(env.authority, REF, opts('a'))
    interfere({ live: false })
    let builds = 0
    const err = thrownBy(() =>
      claim(env.authority, REF, {
        ...opts('b'),
        attempts: 3,
        isLive: () => false,
        build: (): P => {
          builds += 1
          interfere({ n: builds + 100 })
          return { holder: 'b', n: 0, live: true }
        },
      }),
    )
    expect(err).toBeInstanceOf(CasFailed)
    expect(builds).toBe(3)
  })
})

describe('updateWithRetry', () => {
  const seed = () => claim(env.authority, REF, opts('a'))

  test('creates when absent (current is null)', () => {
    const out = updateWithRetry<P>(
      env.authority,
      REF,
      (cur) => {
        expect(cur).toBeNull()
        return { holder: 'a', n: 1, live: true }
      },
      base(),
    )
    expect(out.kind).toBe('written')
    expect(read().payload.n).toBe(1)
  })

  test('re-reads after a lost swap, so a concurrent change is merged', () => {
    seed()
    let raced = false
    const out = updateWithRetry<P>(
      env.authority,
      REF,
      (cur) => {
        if (!raced) {
          raced = true
          interfere({ n: 10 })
        }
        return { ...cur!.payload, n: cur!.payload.n + 1 }
      },
      base(),
    )
    expect(out).toMatchObject({ kind: 'written', payload: { n: 11 } })
    expect(read().payload.n).toBe(11)
  })

  test('is bounded by attempts', () => {
    seed()
    let calls = 0
    const err = thrownBy(() =>
      updateWithRetry<P>(
        env.authority,
        REF,
        (cur) => {
          calls += 1
          interfere({ n: calls })
          return cur!.payload
        },
        { ...base(), attempts: 2 },
      ),
    )
    expect(err).toBeInstanceOf(CasFailed)
    expect(calls).toBe(2)
  })

  test('null deletes; null on an absent ref changes nothing', () => {
    seed()
    expect(updateWithRetry<P>(env.authority, REF, () => null, base())).toEqual({ kind: 'deleted' })
    expect(updateWithRetry<P>(env.authority, REF, () => null, base())).toEqual({
      kind: 'unchanged',
    })
  })

  test('backoff is asked for after each lost swap', () => {
    seed()
    const waits: number[] = []
    let raced = false
    updateWithRetry<P>(
      env.authority,
      REF,
      (cur) => {
        if (!raced) {
          raced = true
          interfere({ n: 5 })
        }
        return cur!.payload
      },
      {
        ...base(),
        backoffMs: (a) => {
          waits.push(a)
          return 0
        },
      },
    )
    expect(waits).toEqual([1])
  })
})

describe('release', () => {
  test('deletes the ref only at our sha', () => {
    const won = claim(env.authority, REF, opts('a'))
    if (!won.won) throw new Error('lost')
    interfere({ n: 1 })
    // The lease moved on: not ours any more, and left alone.
    expect(release(env.authority, REF, won.sha, { cwd: env.worker })).toBe(false)
    expect(read().payload.n).toBe(1)
    expect(release(env.authority, REF, read().sha, { cwd: env.worker })).toBe(true)
    // Absent now: false, not a throw.
    expect(release(env.authority, REF, won.sha, { cwd: env.worker })).toBe(false)
  })
})
