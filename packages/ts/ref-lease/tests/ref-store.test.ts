/**
 * refKey and refStore against a real bare authority.
 */

import { execFileSync } from 'node:child_process'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { fetchRef, refKey, refStore, type RefStore } from '@osdlc/ref-lease'

import { makePair, thrownBy, type Pair } from './_fixture.ts'

// Each pass is a few pushes; a busy machine needs more than the default 5s.
vi.setConfig({ testTimeout: 30_000 })

describe('refKey', () => {
  const P = 'refs/things/'

  test('is readable, prefixed, and stable', () => {
    expect(refKey(P, 'feature-x')).toMatch(/^refs\/things\/feature-x--[0-9a-f]{10}$/)
    expect(refKey(P, 'feature-x')).toBe(refKey('refs/things', 'feature-x'))
  })

  test('awkward keys give names git accepts', () => {
    const keys = [
      'a/b',
      'a..b',
      'x.lock',
      '.hidden',
      'ünï/çødé',
      'sp ace ~^:?*[\\',
      'x'.repeat(500),
      '\u0000nul',
    ]
    for (const k of keys) {
      const ref = refKey(P, k)
      expect(ref, k).toMatch(/^refs\/things\/[A-Za-z0-9_-]{0,60}--[0-9a-f]{10}$/)
      // git's own rule check
      execFileSync('git', ['check-ref-format', ref])
    }
  })

  test('distinct keys never share a name, even when they sanitize alike or are cut', () => {
    const keys = ['a/b', 'a_b', 'a.b', 'x'.repeat(100) + 'a', 'x'.repeat(100) + 'b']
    expect(new Set(keys.map((k) => refKey(P, k))).size).toBe(keys.length)
  })

  test('a label changes the readable part only', () => {
    const a = refKey(P, 'k', 'nice')
    expect(a).toMatch(/^refs\/things\/nice--/)
    expect(a.split('--')[1]).toBe(refKey(P, 'k').split('--')[1])
  })

  test('rejects a prefix outside your own namespace and an empty key', () => {
    for (const bad of ['refs/heads/x/', 'refs/tags/', 'refs/remotes/o/', 'x/', 'refs/']) {
      expect(
        thrownBy(() => refKey(bad, 'k')),
        bad,
      ).toBeInstanceOf(TypeError)
    }
    expect(thrownBy(() => refKey(P, ''))).toBeInstanceOf(TypeError)
  })
})

interface Rec {
  n: number
  at: number
}
const decode = (v: unknown): Rec => v as Rec

describe('refStore', () => {
  let env: Pair
  beforeEach(() => {
    env = makePair()
  })
  afterEach(() => env.cleanup())

  const make = (): RefStore<Rec> =>
    refStore<Rec>({
      remote: env.authority,
      prefix: 'refs/recs/',
      decode,
      cwd: env.worker,
    })
  const remoteRefs = () =>
    execFileSync('git', ['ls-remote', env.authority, 'refs/recs/*'], {
      cwd: env.worker,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean).length

  test('update creates, changes and deletes; get and entries follow', () => {
    const s = make()
    expect(s.get('a/b')).toBeNull()
    expect(s.update('a/b', () => ({ n: 1, at: 0 })).kind).toBe('written')
    expect(s.get('a/b')).toEqual({ n: 1, at: 0 })
    s.update('a/b', (cur) => ({ n: cur!.n + 1, at: 0 }))
    expect(s.entries().map((e) => e.payload.n)).toEqual([2])
    expect(make().get('a/b')).toEqual({ n: 2, at: 0 }) // visible to a new store
    expect(s.update('a/b', () => null).kind).toBe('deleted')
    expect(s.get('a/b')).toBeNull()
    expect(remoteRefs()).toBe(0)
  })

  test('load fetches once and then serves from its cache', () => {
    const s = make()
    s.update('k', () => ({ n: 1, at: 0 }))
    const other = make()
    other.load()
    // A write by someone else after the load is not seen until a new store loads.
    s.update('k', () => ({ n: 2, at: 0 }))
    expect(other.get('k')).toEqual({ n: 1, at: 0 })
    expect(other.load()).toBe(other.load())
    expect(make().get('k')).toEqual({ n: 2, at: 0 })
  })

  test('concurrent updates on one key both count', () => {
    const a = make()
    const b = make()
    a.load()
    b.load()
    const bump = (cur: Rec | null): Rec => ({ n: (cur?.n ?? 0) + 1, at: 0 })
    a.update('k', bump)
    b.update('k', bump) // b's swap is lost, it re-reads and applies again
    expect(make().get('k')).toEqual({ n: 2, at: 0 })
    expect(b.get('k')).toEqual({ n: 2, at: 0 })
  })

  test('prune deletes stale records and keeps the rest', () => {
    const s = make()
    s.update('old', () => ({ n: 1, at: 1 }))
    s.update('new', () => ({ n: 1, at: 100 }))
    expect(s.prune((r) => r.at < 50)).toBe(1)
    expect(remoteRefs()).toBe(1)
    expect(make().get('new')).not.toBeNull()
    expect(make().get('old')).toBeNull()
  })

  test('prune keeps a record that was refreshed after it was loaded', () => {
    make().update('k', () => ({ n: 1, at: 1 }))
    const pruner = make()
    pruner.load() // sees the stale record
    make().update('k', () => ({ n: 2, at: 100 })) // another run refreshes it
    expect(pruner.prune((r) => r.at < 50)).toBe(0)
    expect(pruner.get('k')).toEqual({ n: 2, at: 100 })
    expect(make().get('k')).toEqual({ n: 2, at: 100 })
  })

  test('prune forgets a record another run already deleted', () => {
    make().update('k', () => ({ n: 1, at: 1 }))
    const pruner = make()
    pruner.load()
    make().update('k', () => null)
    expect(pruner.prune(() => true)).toBe(0)
    expect(pruner.entries()).toEqual([])
  })

  test('a label sets the readable part of the ref', () => {
    const s = refStore<Rec>({
      remote: env.authority,
      prefix: 'refs/recs/',
      decode,
      cwd: env.worker,
      label: (k) => k.split(':')[0]!,
    })
    s.update('proj:1', () => ({ n: 1, at: 0 }))
    expect(s.entries()[0]!.ref).toMatch(/^refs\/recs\/proj--/)
    expect(
      fetchRef(env.authority, s.entries()[0]!.ref, { cwd: env.worker, decode }).payload.n,
    ).toBe(1)
  })
})
