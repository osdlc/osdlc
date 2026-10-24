/**
 * The `./testing` subpath: build a fixture, drive it with `Git`, and check the
 * pinned identity reached git.
 */

import { describe, expect, test } from 'vitest'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  IDENTITY,
  makeBareAndWorker,
  makeGitFixture,
  makeOriginAndCheckout,
} from '../src/testing.ts'

describe('@osdlc/typed-git/testing', () => {
  test('makeGitFixture builds a repo the client can drive', () => {
    const fx = makeGitFixture()
    try {
      expect(fx.git.currentBranch()).toBe('main')
      const sha = fx.commit('first', { 'docs/a.md': 'one\n' })
      expect(sha).toMatch(/^[0-9a-f]{40}$/)
      expect(fx.git.showAtRev('HEAD', 'docs/a.md')).toBe('one\n')
      expect(fx.git.logSubject('HEAD')).toBe('first')
      expect(fx.git.isDirty()).toBe(false)
    } finally {
      fx.cleanup()
    }
  })

  test('the pinned dates make the sha reproducible across fixtures', () => {
    const a = makeGitFixture()
    const b = makeGitFixture()
    try {
      expect(a.commit('same', { 'f.md': 'x\n' })).toBe(b.commit('same', { 'f.md': 'x\n' }))
    } finally {
      a.cleanup()
      b.cleanup()
    }
  })

  test('makeOriginAndCheckout gives a clone that can push back', () => {
    const { origin, checkout, cleanup } = makeOriginAndCheckout()
    try {
      expect(checkout.git.logSubject('HEAD')).toBe('initial')
      checkout.commit('second', { 'b.md': 'two\n' })
      checkout.git.push('origin', 'HEAD:refs/heads/pushed')
      expect(origin.git.logSubject('refs/heads/pushed')).toBe('second')
    } finally {
      cleanup()
    }
  })

  // Set as the client's `env`, so every call through `fx.git` carries it:
  // the fixture's own `rev-parse` and a suite's calls alike.
  test('the identity is bound on the client, not threaded per call', () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'x\n' })
      // A call the fixture never makes for you, run through the same client.
      expect(fx.git.log({ format: '%an', maxCount: 1 }).trim()).toBe(IDENTITY['GIT_AUTHOR_NAME']!)
      expect(fx.git.log({ format: '%aI', maxCount: 1 }).trim()).toBe('2020-01-01T00:00:00Z')
    } finally {
      fx.cleanup()
    }
  })

  test('IDENTITY is frozen, so a suite cannot change it for later fixtures', () => {
    expect(Object.isFrozen(IDENTITY)).toBe(true)
    expect(() => {
      ;(IDENTITY as Record<string, string>)['GIT_AUTHOR_NAME'] = 'Other'
    }).toThrow(TypeError)
    expect(IDENTITY['GIT_AUTHOR_NAME']).toBe('Fixture')
  })

  test('a per-commit date overrides the pinned one without a new identity', () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'x\n' })
      fx.commit('second', { 'b.md': 'y\n' }, { date: '2022-03-04T05:06:07+0000' })
      expect(fx.git.log({ format: '%aI', maxCount: 1 }).trim()).toBe('2022-03-04T05:06:07Z')
      // The name still comes from the client-level identity.
      expect(fx.git.log({ format: '%an', maxCount: 1 }).trim()).toBe('Fixture')
    } finally {
      fx.cleanup()
    }
  })

  test('parent puts two related repos under one directory', () => {
    const parent = mkdtempSync(join(tmpdir(), 'typed-git-parent-'))
    try {
      const { origin, checkout, cleanup } = makeOriginAndCheckout({ parent })
      try {
        expect(dirname(origin.dir)).toBe(parent)
        expect(dirname(checkout.dir)).toBe(parent)
      } finally {
        cleanup()
      }
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  test('dir uses the exact directory it is given', () => {
    const parent = mkdtempSync(join(tmpdir(), 'typed-git-dir-'))
    try {
      const fx = makeGitFixture({ dir: join(parent, 'here') })
      expect(fx.dir).toBe(join(parent, 'here'))
      expect(fx.git.currentBranch()).toBe('main')
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  // Not a clone: the worker has its own (empty) history and only knows the
  // store by name, so its first push is a real publish into an empty store.
  test('makeBareAndWorker gives an independent worker that can publish', () => {
    const { bare, worker, remoteName, parent, cleanup } = makeBareAndWorker()
    try {
      expect(remoteName).toBe('origin')
      expect(dirname(bare.dir)).toBe(parent)
      expect(dirname(worker.dir)).toBe(parent)
      expect(bare.git.worktrees()[0]!.bare).toBe(true)
      // Nothing published yet: the store has no refs at all.
      expect(bare.git.branches()).toEqual([])

      worker.commit('first', { 'a.md': 'x\n' })
      worker.git.push('origin', 'HEAD:refs/heads/main')
      expect(bare.git.logSubject('refs/heads/main')).toBe('first')
    } finally {
      cleanup()
    }
  })

  test('a named remote is honoured', () => {
    const { worker, remoteName, cleanup } = makeBareAndWorker({ remoteName: 'store' })
    try {
      expect(remoteName).toBe('store')
      expect(worker.git.configGet('remote.store.url')).not.toBeNull()
    } finally {
      cleanup()
    }
  })
})
