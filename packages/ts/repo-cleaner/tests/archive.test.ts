/**
 * `archive`: unlanded work is pushed to the remote before `run` deletes it.
 *
 * Fixture: a worker with a bare `origin`, `main` pushed with one tracked file,
 * a clean worktree `wt-a` on `wt-branch` at main, and `unmerged`, a branch with
 * one commit main lacks.
 */

import { afterEach, describe, expect, test } from 'vitest'
import { chmodSync, existsSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import { sh } from './helpers.ts'
import type { Approval } from '../src/approval.ts'
import { check, run, type RunOptions } from '../src/clean.ts'
import { coverageOf, leftOutReason } from '../src/archive.ts'
import { plan, type Plan } from '../src/plan.ts'
import type { Receipt } from '../src/receipt.ts'
import { sweep } from '../src/sweep.ts'
import { RepoCleanerError, type Row } from '../src/types.ts'
import { Git } from '@osdlc/typed-git'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

interface Fixture {
  root: string
  bare: string
  worktree: string
  parent: string
}

function buildFixture(): Fixture {
  const pair = makeBareAndWorker()
  cleanups.push(pair.cleanup)
  const root = pair.worker.dir
  writeFileSync(join(root, 'tracked.txt'), 'one\n')
  sh(root, ['add', 'tracked.txt'])
  sh(root, ['commit', '-m', 'initial'])
  sh(root, ['push', '-q', '-u', 'origin', 'main'])
  sh(root, ['checkout', '-q', '-b', 'unmerged'])
  sh(root, ['commit', '--allow-empty', '-m', 'wip: unmerged'])
  sh(root, ['checkout', '-q', 'main'])
  const worktree = join(pair.parent, 'wt-a')
  sh(root, ['worktree', 'add', '-q', '-b', 'wt-branch', worktree, 'main'])
  return { root, bare: pair.bare.dir, worktree: realpathSync(worktree), parent: pair.parent }
}

const wt = (path: string) => `worktree:${path}` as const

function makePlan(root: string): Plan {
  return plan(sweep([root], { remotes: [''], offline: true, provider: 'none', cwd: root }))
}

const NOW = () => new Date('2026-11-19T10:00:00Z')

function apply(
  fx: Fixture,
  p: Plan,
  approval: Approval,
  opts: RunOptions = {},
): { receipt: Receipt; steps: string[] } {
  const archive = {}
  const preview = check(p, approval, { cwd: fx.root, archive })
  const receipt = run(preview, { cwd: fx.root, now: NOW, ...opts })
  return { receipt, steps: preview.steps.map((s) => s.action) }
}

const archiveBranches = (fx: Fixture): string[] =>
  sh(fx.bare, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/archive'])
    .split('\n')
    .filter(Boolean)

function dirty(fx: Fixture): void {
  writeFileSync(join(fx.worktree, 'tracked.txt'), 'one\nchanged\n')
  writeFileSync(join(fx.worktree, 'new.txt'), 'new\n')
}

describe('archive before delete', () => {
  test('a dirty worktree is snapshotted, pushed and then removed', () => {
    const fx = buildFixture()
    dirty(fx)
    const p = makePlan(fx.root)
    const row = wt(fx.worktree)
    const approval = { select: [row], allow: ['discard-archived' as const] }

    // Without the archive risk the row stays: it needs discard-archived.
    const refused = check(p, { select: [row] }, { cwd: fx.root, archive: {} })
    expect(refused.dropped).toMatchObject([
      { reason: 'not-allowed', detail: 'needs discard-archived' },
    ])

    const statusBefore = sh(fx.worktree, ['status', '--porcelain'])
    const indexBefore = sh(fx.worktree, ['ls-files', '-s'])
    const seen: string[] = []
    const { receipt, steps } = apply(fx, p, approval, {
      onStep: (_i, _n, step) => {
        if (step.action !== 'remove-worktree') return
        // Until its own remove step, the worktree's index and files are as they were.
        seen.push(sh(fx.worktree, ['status', '--porcelain']), sh(fx.worktree, ['ls-files', '-s']))
      },
    })
    expect(steps).toEqual(['archive', 'remove-worktree'])
    expect(receipt.status).toBe('complete')
    expect(seen).toEqual([statusBefore, indexBefore])
    expect(existsSync(fx.worktree)).toBe(false)

    const step = receipt.steps[0]!
    expect(step.archive?.ref).toBe(
      'refs/heads/archive/' + `${fx.root.split('/').pop()}-local-2026-11-19`,
    )
    const branch = step.archive!.ref
    expect(sh(fx.bare, ['rev-parse', branch])).toBe(step.archive!.sha)
    // The archive commit's tree is the remote default branch's.
    expect(sh(fx.bare, ['rev-parse', `${branch}^{tree}`])).toBe(
      sh(fx.bare, ['rev-parse', 'main^{tree}']),
    )
    expect(sh(fx.bare, ['rev-parse', `${branch}^1`])).toBe(sh(fx.bare, ['rev-parse', 'main']))
    // Its second parent holds both files.
    expect(step.archive!.parents.map((x) => [x.parent, x.rows])).toEqual([[2, [row]]])
    expect(sh(fx.bare, ['show', `${branch}^2:tracked.txt`])).toBe('one\nchanged')
    expect(sh(fx.bare, ['show', `${branch}^2:new.txt`])).toBe('new')
    expect(sh(fx.bare, ['log', '-1', '--format=%B', branch])).toContain(
      `parent 2: ${step.archive!.parents[0]!.sha}`,
    )
  })

  test('a secret-shaped file is left out, so the row needs discard-changes as well', () => {
    const fx = buildFixture()
    dirty(fx)
    writeFileSync(join(fx.worktree, '.env.local'), 'TOKEN=1\n')
    const p = makePlan(fx.root)
    const row = wt(fx.worktree)

    const only = check(
      p,
      { select: [row], allow: ['discard-archived'] },
      { cwd: fx.root, archive: {} },
    )
    expect(only.dropped).toMatchObject([{ reason: 'not-allowed', detail: 'needs discard-changes' }])
    expect(only.steps).toEqual([])

    const { receipt } = apply(fx, p, { select: [row], allow: ['discard-changes'] })
    expect(receipt.status).toBe('complete')
    const archive = receipt.steps[0]!.archive!
    expect(archive.parents[0]!.leftOut).toEqual([{ path: '.env.local', reason: 'secret' }])
    expect(sh(fx.bare, ['ls-tree', '-r', '--name-only', `${archive.ref}^2`]).split('\n')).toEqual([
      'new.txt',
      'tracked.txt',
    ])
    expect(sh(fx.bare, ['log', '-1', '--format=%B', archive.ref])).toContain(
      'left out (secret): .env.local',
    )
  })

  test('a change made after the archive stops the remove', () => {
    const fx = buildFixture()
    dirty(fx)
    const { receipt } = apply(
      fx,
      makePlan(fx.root),
      { select: [wt(fx.worktree)], allow: ['discard-archived'] },
      {
        onStepDone: (_i, _n, step) => {
          if (step.action === 'archive') writeFileSync(join(fx.worktree, 'late.txt'), 'late\n')
        },
      },
    )
    expect(receipt.status).toBe('failed')
    expect(receipt.steps.map((s) => [s.action, s.result])).toEqual([
      ['archive', 'ok'],
      ['remove-worktree', 'failed'],
    ])
    expect(receipt.steps[1]!.error).toContain('changed since it was archived')
    expect(existsSync(join(fx.worktree, 'late.txt'))).toBe(true)
  })

  test('a staged change its working file no longer shows is not held, so it needs discard-changes', () => {
    const fx = buildFixture()
    writeFileSync(join(fx.worktree, 'tracked.txt'), 'staged\n')
    sh(fx.worktree, ['add', 'tracked.txt'])
    writeFileSync(join(fx.worktree, 'tracked.txt'), 'one\n')
    const p = makePlan(fx.root)
    const row = wt(fx.worktree)
    const { receipt } = apply(fx, p, { select: [row], allow: ['discard-archived'] })
    expect(receipt.status).toBe('failed')
    expect(receipt.steps[0]).toMatchObject({ action: 'archive', result: 'failed' })
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('an unlanded branch is archived, then deleted', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const tip = sh(fx.root, ['rev-parse', 'unmerged'])
    const { receipt, steps } = apply(fx, p, {
      select: ['branch:unmerged'],
      allow: ['discard-archived'],
    })
    expect(steps).toEqual(['archive', 'delete-branch'])
    expect(receipt.status).toBe('complete')
    expect(sh(fx.bare, ['rev-parse', `${receipt.steps[0]!.archive!.ref}^2`])).toBe(tip)
    expect(sh(fx.root, ['branch', '--list', 'unmerged'])).toBe('')
  })

  test('a refused push leaves every row in place and fails at the archive step', () => {
    const fx = buildFixture()
    dirty(fx)
    const hook = join(fx.bare, 'hooks', 'pre-receive')
    writeFileSync(hook, '#!/bin/sh\nexit 1\n')
    chmodSync(hook, 0o755)
    const { receipt } = apply(fx, makePlan(fx.root), {
      select: [wt(fx.worktree), 'branch:unmerged'],
      allow: ['discard-archived'],
    })
    expect(receipt.status).toBe('failed')
    expect(receipt.steps.map((s) => [s.action, s.result])).toEqual([
      ['archive', 'failed'],
      ['remove-worktree', 'skipped'],
      ['delete-branch', 'skipped'],
    ])
    expect(existsSync(fx.worktree)).toBe(true)
    expect(sh(fx.root, ['branch', '--list', 'unmerged'])).toContain('unmerged')
    expect(archiveBranches(fx)).toEqual([])
  })

  test('two runs on one day push two distinct archive branches', () => {
    const fx = buildFixture()
    const first = apply(fx, makePlan(fx.root), {
      select: ['branch:unmerged'],
      allow: ['discard-archived'],
    })
    sh(fx.root, ['branch', 'unmerged-2', 'main'])
    sh(fx.root, ['checkout', '-q', 'unmerged-2'])
    sh(fx.root, ['commit', '--allow-empty', '-m', 'wip: second'])
    sh(fx.root, ['checkout', '-q', 'main'])
    const second = apply(fx, makePlan(fx.root), {
      select: ['branch:unmerged-2'],
      allow: ['discard-archived'],
    })
    const refs = [first, second].map((r) => r.receipt.steps[0]!.archive!.ref)
    expect(new Set(refs).size).toBe(2)
    expect(archiveBranches(fx)).toHaveLength(2)
  })

  test('discard-archived without archive is refused, and no archive means no archive step', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    expect(() =>
      check(p, { select: ['branch:unmerged'], allow: ['discard-archived'] }, { cwd: fx.root }),
    ).toThrow(RepoCleanerError)
    const plain = check(
      p,
      { select: ['branch:unmerged'], allow: ['abandon-unmerged'] },
      { cwd: fx.root },
    )
    expect(plain.steps.map((s) => s.action)).toEqual(['delete-branch'])
  })

  test('abandon-unmerged named for a row still allows it, and the archive is made anyway', () => {
    const fx = buildFixture()
    const { receipt, steps } = apply(fx, makePlan(fx.root), {
      select: ['branch:unmerged'],
      allow: ['abandon-unmerged'],
    })
    expect(steps).toEqual(['archive', 'delete-branch'])
    expect(receipt.status).toBe('complete')
  })
})

describe('what the archive covers', () => {
  const worktreeRow = (evidence: Record<string, unknown>, risks: string[]): Row =>
    ({
      kind: 'worktree',
      id: 'worktree:/w',
      name: '/w',
      risks,
      evidence: { onDisk: true, ...evidence },
    }) as unknown as Row
  const git = () => ({ statusEntries: () => [] }) as unknown as Git

  test('submodule work keeps abandon-unmerged and discard-changes', () => {
    const sub = {
      path: 's',
      populated: true,
      head: null,
      recorded: null,
      unpushedCommits: 1,
      stashes: 0,
    }
    const row = worktreeRow({ submodules: [{ ...sub, dirtyFiles: 2 }] }, [
      'abandon-unmerged',
      'discard-changes',
    ])
    expect(coverageOf(row, {}, git).covers).toEqual([])
    const plain = worktreeRow({}, ['abandon-unmerged', 'discard-changes'])
    expect(coverageOf(plain, {}, git).covers).toEqual(['abandon-unmerged', 'discard-changes'])
  })

  test('a worktree whose directory is gone is not covered', () => {
    expect(
      coverageOf(worktreeRow({ onDisk: false }, ['abandon-unmerged']), {}, git).covers,
    ).toEqual([])
  })

  test('secret-shaped names, globs and size caps leave a file out', () => {
    for (const name of [
      '.env',
      '.env.local',
      'a/server.pem',
      'k.key',
      'id_rsa',
      'id_ed25519.pub',
    ]) {
      expect(leftOutReason(name, '/nowhere', {})).toBe('secret')
    }
    expect(leftOutReason('notes.txt', '/nowhere', {})).toBeNull()
    expect(leftOutReason('a/b.log', '/nowhere', { exclude: ['*.log'] })).toBe('excluded')
    expect(leftOutReason('a/b.log', '/nowhere', { exclude: ['b/*.log'] })).toBeNull()
    expect(leftOutReason('a/b.log', '/nowhere', { exclude: ['a/**'] })).toBe('excluded')
    expect(leftOutReason('a/x/b', '/nowhere', { exclude: ['a/**/b'] })).toBe('excluded')
    expect(leftOutReason('a/xb', '/nowhere', { exclude: ['a/**/b'] })).toBeNull()
    expect(leftOutReason('secrets/p.txt', '/nowhere', { exclude: ['secrets'] })).toBe('excluded')
    expect(leftOutReason('.NPMRC', '/nowhere', {})).toBe('secret')
  })

  test('a file over the size cap is left out of the snapshot', () => {
    const fx = buildFixture()
    writeFileSync(join(fx.worktree, 'big.bin'), 'x'.repeat(100))
    const swept = sweep([fx.root], { remotes: [''], offline: true, provider: 'none', cwd: fx.root })
    const live = swept.repos[0]!.rows.find((r) => r.id === wt(fx.worktree))!
    const cover = coverageOf(live, { maxFileBytes: 10 }, (p) => new Git(p))
    expect(cover.leftOut).toEqual([{ path: 'big.bin', reason: 'too-large' }])
    expect(cover.covers).toEqual([])
  })
})
