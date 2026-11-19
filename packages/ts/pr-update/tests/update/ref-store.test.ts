/**
 * The git-ref attempt store and the per-branch lease, against a real bare repository as the remote.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { GitFailed } from '@osdlc/ref-lease'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import { prUpdateStandaloneSchema } from '../../src/config.ts'
import { standalonePorts } from '../../src/defaults.ts'
import type { AttemptKey, BranchLease } from '../../src/ports.ts'
import { updateAll, type UpdateTarget } from '../../src/update/execute.ts'
import { defaultHolder, refBranchLease } from '../../src/update/lease.ts'
import { refAttemptStore } from '../../src/update/ref-attempts.ts'
import { attemptRef } from '../../src/update/ref-attempts.ts'
import { lockRef } from '../../src/update/lease.ts'

const KEY: AttemptKey = { repo: 'o/r', head: 'topic', headOid: 'h1', base: 'main', baseOid: 'b1' }
const DAY = 24 * 60 * 60 * 1000

describe('ref store and lease', () => {
  let fx: ReturnType<typeof makeBareAndWorker>
  let cwd: string
  let remoteRefs: () => string[]

  beforeEach(() => {
    fx = makeBareAndWorker({ initialBranch: 'main' })
    fx.worker.commit('initial', { 'README.md': 'fixture\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.fetch('origin')
    cwd = fx.worker.dir
    remoteRefs = () =>
      execFileSync('git', ['ls-remote', 'origin', 'refs/pr-update/*'], { cwd, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split('\t')[1]!)
  })
  afterEach(() => fx.cleanup())

  const store = (over: Partial<Parameters<typeof refAttemptStore>[0]> = {}) =>
    refAttemptStore({ remote: 'origin', cwd, ...over })

  describe('refAttemptStore', () => {
    test('record, get and clear round trip, visible to a second store', () => {
      const a = store()
      expect(a.get(KEY)).toBeNull()
      a.recordFailure(KEY, 'first')
      a.recordFailure(KEY, 'second')
      expect(a.get(KEY)).toMatchObject({ failures: 2, reason: 'second' })
      expect(remoteRefs()).toEqual([attemptRef('refs/pr-update/attempts/', 'o/r', 'topic', 'main')])

      const b = store()
      expect(b.get(KEY)).toMatchObject({ failures: 2, reason: 'second' })
      expect(b.get({ ...KEY, headOid: 'moved' })).toBeNull()

      b.clear('o/r', 'topic', 'main')
      expect(remoteRefs()).toEqual([])
      expect(store().get(KEY)).toBeNull()
    })

    test('clearing a record that is not there does nothing', () => {
      expect(() => store().clear('o/r', 'nope', 'main')).not.toThrow()
    })

    test('a swap lost to another run keeps both failures', () => {
      const a = store()
      const b = store()
      // Both read the empty namespace; A then B write the same key.
      expect(a.get(KEY)).toBeNull()
      expect(b.get(KEY)).toBeNull()
      a.recordFailure(KEY, 'from a')
      b.recordFailure(KEY, 'from b')
      expect(store().get(KEY)).toMatchObject({ failures: 2, reason: 'from b' })

      // And again when the ref exists and both hold the old sha.
      const c = store()
      const d = store()
      c.get(KEY)
      d.get(KEY)
      c.recordFailure(KEY, 'c')
      d.recordFailure(KEY, 'd')
      expect(store().get(KEY)).toMatchObject({ failures: 4, reason: 'd' })
    })

    test('prune keeps a record another run refreshed after this store read it', () => {
      const old = new Date(Date.now() - 40 * DAY)
      store({ now: () => old }).recordFailure(KEY, 'ancient')
      const pruner = store()
      pruner.get(KEY) // loads the stale record
      store().recordFailure(KEY, 'fresh') // another run refreshes it
      pruner.prune()
      expect(store().get(KEY)).toMatchObject({ reason: 'fresh' })
    })

    test('prune deletes a record older than 30 days and leaves a recent one', () => {
      const old = new Date(Date.now() - 40 * DAY)
      store({ now: () => old }).recordFailure(KEY, 'ancient')
      const other = { ...KEY, head: 'recent' }
      store().recordFailure(other, 'new')
      expect(remoteRefs()).toHaveLength(2)

      store().prune()
      expect(remoteRefs()).toEqual([
        attemptRef('refs/pr-update/attempts/', 'o/r', 'recent', 'main'),
      ])
      expect(store().get(KEY)).toBeNull()
      expect(store().get(other)).toMatchObject({ failures: 1 })
    })

    test('awkward branch names get valid, distinct refs', () => {
      const heads = [
        'feature/a..b',
        'release.lock',
        'ünï/çødé',
        'spaces and ~^:?*[\\ marks',
        'feature/a_b',
        'feature_a/b',
        'x'.repeat(300),
      ]
      const s = store()
      for (const head of heads) s.recordFailure({ ...KEY, head }, `fail ${head.slice(0, 5)}`)
      const fresh = store()
      for (const head of heads) {
        expect(fresh.get({ ...KEY, head })?.failures, head).toBe(1)
      }
      const refs = remoteRefs()
      expect(new Set(refs).size).toBe(heads.length)
      for (const r of refs) expect(r).toMatch(/^refs\/pr-update\/attempts\/[A-Za-z0-9_-]+$/)
    })

    test('a custom prefix is used', () => {
      store({ prefix: 'refs/custom/att/' }).recordFailure(KEY, 'x')
      const out = execFileSync('git', ['ls-remote', 'origin', 'refs/custom/*'], {
        cwd,
        encoding: 'utf8',
      })
      expect(out).toContain('refs/custom/att/')
    })

    test('a remote that refuses the ref names the fallback', () => {
      execFileSync(
        'sh',
        [
          '-c',
          `printf '#!/bin/sh\\nwhile read o n r; do case "$r" in refs/heads/*|refs/tags/*) ;; *) echo "only heads and tags" >&2; exit 1;; esac; done\\n' > hooks/pre-receive && chmod +x hooks/pre-receive`,
        ],
        { cwd: fx.bare.dir },
      )
      let err: unknown
      try {
        store().recordFailure(KEY, 'x')
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(GitFailed)
      expect((err as Error).message).toContain('attempts.store: file')
    })
  })

  describe('refBranchLease', () => {
    const lease = (holder: string, now: () => Date = () => new Date(), ttlMs = 60_000) =>
      refBranchLease({ remote: 'origin', cwd, holder, ttlMs, now })

    test('two invocations of one Actions run get distinct default holders', () => {
      const env = { GITHUB_RUN_ID: '42' }
      expect(defaultHolder(env)).not.toBe(defaultHolder(env))
      expect(defaultHolder(env)).toMatch(/^github-run-42:/)
    })

    test('taken, held against another holder, then released', () => {
      const a = lease('run-a')
      const b = lease('run-b')
      const grant = a.acquire({ head: 'topic', pr: 7 })
      expect(grant.ok).toBe(true)
      expect(remoteRefs()).toEqual([lockRef('refs/pr-update/', 'topic')])

      const denied = b.acquire({ head: 'topic', pr: 7 })
      expect(denied).toEqual({ ok: false, holder: 'run-a' })
      // Another branch is free.
      expect(b.acquire({ head: 'other', pr: 8 }).ok).toBe(true)

      if (grant.ok) grant.release()
      const again = b.acquire({ head: 'topic', pr: 7 })
      expect(again.ok).toBe(true)
    })

    test('an expired lease is taken over, and the old holder cannot delete the new one', () => {
      let t = Date.now()
      const clock = () => new Date(t)
      const a = lease('run-a', clock, 1000)
      const b = lease('run-b', clock, 60_000)
      const first = a.acquire({ head: 'topic', pr: 1 })
      expect(first.ok).toBe(true)
      expect(b.acquire({ head: 'topic', pr: 1 }).ok).toBe(false)

      t += 5000
      const second = b.acquire({ head: 'topic', pr: 1 })
      expect(second.ok).toBe(true)

      // A's late release loses the swap and leaves B's lease alone.
      if (first.ok) first.release()
      expect(remoteRefs()).toEqual([lockRef('refs/pr-update/', 'topic')])
      expect(lease('run-c', clock).acquire({ head: 'topic', pr: 1 })).toEqual({
        ok: false,
        holder: 'run-b',
      })
    })

    test('a branch with an awkward name can be leased', () => {
      expect(lease('a').acquire({ head: 'feat/x..y.lock ü', pr: 1 }).ok).toBe(true)
    })
  })

  describe('lease around updateAll', () => {
    const target = (head: string, number: number): UpdateTarget => ({
      repo: 'o/r',
      number,
      head,
      base: 'main',
      headOid: null,
      baseOid: null,
      strategy: 'merge',
    })
    const settings = { remote: 'origin', resolvers: [], lockfileInstall: null, verifyVerbs: [] }

    function movedBranch(head: string): void {
      const { git } = fx.worker
      git.checkout('main', { branch: head })
      fx.worker.commit(`${head} work`, { [`${head}.txt`]: 'x\n' })
      git.push('origin', head)
      git.checkout('main')
      fx.worker.commit(`main moves for ${head}`, { [`m-${head}.txt`]: 'm\n' })
      git.push('origin', 'main')
      git.fetch('origin')
    }

    test('a branch another run holds is skipped, the rest are updated, and leases are released', async () => {
      movedBranch('held')
      movedBranch('free')
      const other = refBranchLease({ remote: 'origin', cwd, holder: 'run-x', ttlMs: 60_000 })
      other.acquire({ head: 'held', pr: 1 })
      const mine = refBranchLease({ remote: 'origin', cwd, holder: 'run-me', ttlMs: 60_000 })

      const skipped: { number: number; reason: string }[] = []
      const results = await updateAll(
        fx.worker.git,
        [target('held', 1), target('free', 2)],
        { ...settings, lease: mine },
        () => ({ exitCode: 0, stdout: '', stderr: '' }),
        {
          apply: true,
          worktreeRoot: join(cwd, '.pr-update', 'run'),
          onSkip: (s) => skipped.push(s),
        },
      )
      expect(results.map((r) => [r.number, r.outcome.status])).toEqual([[2, 'updated']])
      expect(skipped).toEqual([
        {
          repo: 'o/r',
          number: 1,
          head: 'held',
          reason: 'another pr-update run is updating this branch (run-x)',
        },
      ])
      // Only run-x's lease remains.
      expect(remoteRefs()).toEqual([lockRef('refs/pr-update/', 'held')])
    })

    test('the lease is released when the update throws', async () => {
      movedBranch('boom')
      const mine = refBranchLease({ remote: 'origin', cwd, holder: 'run-me', ttlMs: 60_000 })
      await expect(
        updateAll(
          fx.worker.git,
          [target('boom', 1)],
          { ...settings, verifyVerbs: ['check'], lease: mine },
          () => {
            throw new Error('runner died')
          },
          { apply: true, worktreeRoot: join(cwd, '.pr-update', 'throw') },
        ),
      ).rejects.toThrow('runner died')
      expect(remoteRefs()).toEqual([])
    })

    test('a rehearsal never takes a lease', async () => {
      movedBranch('rehearse')
      let asked = 0
      const spy: BranchLease = {
        acquire() {
          asked += 1
          return { ok: true, release() {} }
        },
      }
      await updateAll(
        fx.worker.git,
        [target('rehearse', 1)],
        { ...settings, lease: spy },
        () => ({ exitCode: 0, stdout: '', stderr: '' }),
        { apply: false, worktreeRoot: join(cwd, '.pr-update', 'dry') },
      )
      expect(asked).toBe(0)
      expect(remoteRefs()).toEqual([])
    })
  })

  describe('standalonePorts', () => {
    test('the file store and no lease are the default', () => {
      const cfg = prUpdateStandaloneSchema.parse({})
      expect(cfg.attempts).toEqual({ store: 'file', ref_prefix: 'refs/pr-update/' })
      expect(cfg.lease).toEqual({ ttl_seconds: null })
      const ports = standalonePorts(cfg, cwd)
      expect(ports.lease).toBeUndefined()
      expect(ports.attempts?.prune).toBeUndefined()
    })

    test('git-ref wires the ref store and the lease on the named remote', () => {
      const cfg = prUpdateStandaloneSchema.parse({ attempts: { store: 'git-ref' } })
      const ports = standalonePorts(cfg, cwd, 'origin')
      expect(ports.lease).toBeDefined()
      ports.attempts!.recordFailure(KEY, 'x')
      expect(remoteRefs()).toHaveLength(1)
    })

    test('ref_prefix inside refs/heads is refused', () => {
      expect(() =>
        prUpdateStandaloneSchema.parse({ attempts: { ref_prefix: 'refs/heads/x/' } }),
      ).toThrow()
      expect(() => prUpdateStandaloneSchema.parse({ attempts: { ref_prefix: 'x/' } })).toThrow()
      expect(() => prUpdateStandaloneSchema.parse({ attempts: { store: 'nfs' } })).toThrow()
    })
  })
})
