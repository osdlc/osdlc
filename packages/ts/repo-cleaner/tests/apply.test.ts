/**
 * `applyPlan` on a worker repository with a bare remote.
 *
 * Fixture rows:
 *   - `merged-a`, `merged-b`: merged into main and pushed — safe to delete
 *     locally and on the remote, no authorization needed.
 *   - `unmerged`: one commit main lacks — needs `abandon-unmerged`.
 *   - worktree `wt-a` on `wt-branch` at main: clean, deletable.
 */

import { afterEach, describe, expect, test } from 'vitest'
import { chmodSync, existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import { applyPlan, type Grant } from '../src/apply.ts'
import { PLAN_VERSION, planRepo, readPlan, writePlan, type Plan } from '../src/plan.ts'
import type { Receipt, RowRef } from '../src/receipt.ts'
import { sweepRepo } from '../src/sweep.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function sh(cwd: string, args: string[]): string {
  return new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()
}

interface Fixture {
  root: string
  bare: string
  worktree: string
}

function buildFixture(): Fixture {
  const pair = makeBareAndWorker()
  cleanups.push(pair.cleanup)
  const root = pair.worker.dir
  const commit = (msg: string): void => {
    sh(root, ['commit', '--allow-empty', '-m', msg])
  }
  commit('initial')
  sh(root, ['push', '-q', '-u', 'origin', 'main'])
  for (const name of ['merged-a', 'merged-b']) {
    sh(root, ['checkout', '-q', '-b', name])
    commit(`feat: ${name}`)
    sh(root, ['push', '-q', '-u', 'origin', name])
    sh(root, ['checkout', '-q', 'main'])
    sh(root, ['merge', '-q', '--no-ff', '-m', `Merge ${name}`, name])
  }
  sh(root, ['push', '-q', 'origin', 'main'])
  sh(root, ['checkout', '-q', '-b', 'unmerged'])
  commit('wip: unmerged')
  sh(root, ['checkout', '-q', 'main'])
  const worktree = join(pair.parent, 'wt-a')
  sh(root, ['worktree', 'add', '-q', '-b', 'wt-branch', worktree, 'main'])
  // git reports worktree paths resolved (`/private/var` on macOS).
  return { root, bare: pair.bare.dir, worktree: realpathSync(worktree) }
}

function makePlan(root: string): Plan {
  const { repo, items } = sweepRepo(root, { noGh: true, cwd: root })
  return {
    version: PLAN_VERSION,
    created_at: new Date().toISOString(),
    repos: [planRepo(repo!.root, { remote: null, noGh: true }, items)],
  }
}

function apply(
  fx: Fixture,
  plan: Plan,
  rows: RowRef[],
  grants: Grant[] = [],
  dryRun = false,
): { receipt: Receipt; receiptPath: string } {
  const receiptPath = join(fx.root, '.receipts', 'test.json')
  const receipt = applyPlan(plan, rows, grants, {
    callerCwd: fx.root,
    dryRun,
    receiptPath,
    planPath: 'plan.json',
  })
  return { receipt, receiptPath }
}

const refs = (root: string): string =>
  sh(root, ['for-each-ref', '--format=%(refname) %(objectname)'])
const remoteHeads = (bare: string): string => sh(bare, ['for-each-ref', '--format=%(refname)'])

describe('applyPlan', () => {
  test('runs worktree, local, remote, prune in order and verifies each', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    const { receipt, receiptPath } = apply(fx, plan, [
      { category: 'remote_branch', id: 'origin/merged-a' },
      { category: 'local_branch', id: 'merged-a' },
      { category: 'worktree', id: fx.worktree },
    ])

    expect(receipt.status).toBe('complete')
    expect(receipt.dropped).toEqual([])
    expect(receipt.steps.map((s) => s.action)).toEqual([
      'remove-worktree',
      'delete-local',
      'delete-remote',
      'prune-worktrees',
    ])
    expect(receipt.steps.every((s) => s.result === 'ok')).toBe(true)
    expect(existsSync(fx.worktree)).toBe(false)
    expect(refs(fx.root)).not.toContain('refs/heads/merged-a ')
    expect(remoteHeads(fx.bare)).not.toContain('refs/heads/merged-a')
    expect(new Git(fx.root).configGet('branch.merged-a.remote')).toBeNull()
    expect((JSON.parse(readFileSync(receiptPath, 'utf-8')) as Receipt).status).toBe('complete')
  })

  test('drops a branch that moved after the plan and leaves it alone', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    sh(fx.root, ['checkout', '-q', 'merged-a'])
    sh(fx.root, ['commit', '--allow-empty', '-m', 'late work'])
    sh(fx.root, ['checkout', '-q', 'main'])
    const before = refs(fx.root)

    const { receipt } = apply(fx, plan, [{ category: 'local_branch', id: 'merged-a' }])

    expect(receipt.dropped.map((d) => d.reason)).toEqual(['facts-changed'])
    expect(receipt.status).toBe('complete')
    expect(refs(fx.root)).toBe(before)
  })

  test('drops a row needing abandon-unmerged unless it is authorized', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    const row: RowRef = { category: 'local_branch', id: 'unmerged' }

    const refused = apply(fx, plan, [row]).receipt
    expect(refused.dropped.map((d) => d.reason)).toEqual(['not-authorized'])
    expect(refs(fx.root)).toContain('refs/heads/unmerged ')

    const other: RowRef = { category: 'local_branch', id: 'merged-a' }
    const wrongRow = apply(fx, plan, [row, other], [{ name: 'abandon-unmerged', row: other }])
    expect(wrongRow.receipt.dropped.map((d) => d.reason)).toEqual(['not-authorized'])

    const allowed = apply(fx, plan, [row], [{ name: 'abandon-unmerged', row: null }]).receipt
    expect(allowed.dropped).toEqual([])
    expect(allowed.status).toBe('complete')
    expect(refs(fx.root)).not.toContain('refs/heads/unmerged ')
  })

  test('stops at a failing remote delete and records the failure', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    const hook = join(fx.bare, 'hooks', 'pre-receive')
    writeFileSync(hook, '#!/bin/sh\necho rejected >&2\nexit 1\n')
    chmodSync(hook, 0o755)

    const { receipt, receiptPath } = apply(fx, plan, [
      { category: 'remote_branch', id: 'origin/merged-a' },
      { category: 'remote_branch', id: 'origin/merged-b' },
    ])

    expect(receipt.status).toBe('failed')
    expect(receipt.steps.map((s) => s.result)).toEqual(['failed', 'pending', 'pending'])
    expect(receipt.steps[0]!.error).toContain('rejected')
    expect(remoteHeads(fx.bare)).toContain('refs/heads/merged-b')
    expect((JSON.parse(readFileSync(receiptPath, 'utf-8')) as Receipt).status).toBe('failed')
  })

  test('dry run changes no ref and writes no receipt', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    const before = refs(fx.root)

    const { receipt, receiptPath } = apply(
      fx,
      plan,
      [
        { category: 'local_branch', id: 'merged-a' },
        { category: 'remote_branch', id: 'origin/merged-a' },
      ],
      [],
      true,
    )

    expect(receipt.status).toBe('dry-run')
    expect(receipt.steps.every((s) => s.result === 'would-run')).toBe(true)
    expect(refs(fx.root)).toBe(before)
    expect(existsSync(receiptPath)).toBe(false)
  })

  test('drops rows that are gone or no longer deletable', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    sh(fx.root, ['branch', '-D', 'merged-a'])
    sh(fx.root, ['worktree', 'add', '-q', join(fx.worktree, '..', 'wt-b'), 'merged-b'])

    const { receipt } = apply(fx, plan, [
      { category: 'local_branch', id: 'merged-a' },
      { category: 'local_branch', id: 'merged-b' },
    ])

    expect(receipt.dropped.map((d) => [d.id, d.reason])).toEqual([
      ['merged-a', 'gone'],
      ['merged-b', 'not-deletable'],
    ])
    expect(refs(fx.root)).toContain('refs/heads/merged-b ')
  })

  test('drops a planned worktree whose edits skip-worktree hides', () => {
    const fx = buildFixture()
    writeFileSync(join(fx.root, 'tracked.txt'), 'x\n')
    sh(fx.root, ['add', 'tracked.txt'])
    sh(fx.root, ['commit', '-q', '-m', 'track'])
    sh(fx.worktree, ['merge', '-q', '--ff-only', 'main'])
    const plan = makePlan(fx.root)
    expect(plan.repos[0]!.rows.some((r) => r.id === fx.worktree)).toBe(true)
    sh(fx.worktree, ['update-index', '--skip-worktree', 'tracked.txt'])
    writeFileSync(join(fx.worktree, 'tracked.txt'), 'hidden edit\n')

    const { receipt, receiptPath } = apply(fx, plan, [{ category: 'worktree', id: fx.worktree }])

    expect(receipt.dropped).toMatchObject([
      { id: fx.worktree, reason: 'not-deletable', detail: 'blocked: hidden-index-flags' },
    ])
    expect(receipt.steps).toEqual([])
    expect(readFileSync(join(fx.worktree, 'tracked.txt'), 'utf-8')).toBe('hidden edit\n')
    expect((JSON.parse(readFileSync(receiptPath, 'utf-8')) as Receipt).dropped).toEqual(
      receipt.dropped,
    )
  })

  test('a locked worktree stays out of a new plan and is dropped from an old one', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    sh(fx.root, ['worktree', 'lock', fx.worktree])

    expect(makePlan(fx.root).repos[0]!.rows.some((r) => r.id === fx.worktree)).toBe(false)
    const { receipt } = apply(fx, plan, [{ category: 'worktree', id: fx.worktree }])

    expect(receipt.dropped.map((d) => [d.reason, d.detail])).toEqual([
      ['not-deletable', 'blocked: locked-worktree'],
    ])
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a row named twice runs once', () => {
    const fx = buildFixture()
    const row: RowRef = { category: 'local_branch', id: 'merged-a' }
    const { receipt } = apply(fx, makePlan(fx.root), [row, row])
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => s.action)).toEqual(['delete-local', 'prune-worktrees'])
  })

  test('prunes a worktree whose directory is gone', () => {
    const fx = buildFixture()
    rmSync(fx.worktree, { recursive: true, force: true })
    const { receipt } = apply(fx, makePlan(fx.root), [{ category: 'worktree', id: fx.worktree }])
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]!.verification).toBe('unregistered')
  })

  test('force-removes a dirty worktree only with discard-changes', () => {
    const fx = buildFixture()
    writeFileSync(join(fx.worktree, 'scratch.txt'), 'wip\n')
    const plan = makePlan(fx.root)
    const row: RowRef = { category: 'worktree', id: fx.worktree }

    expect(apply(fx, plan, [row]).receipt.dropped.map((d) => d.reason)).toEqual(['not-authorized'])

    const { receipt } = apply(fx, plan, [row], [{ name: 'discard-changes', row }])
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]!.command).toContain('--force')
    expect(existsSync(fx.worktree)).toBe(false)
  })

  test('rejects a row that is not in the plan', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    expect(() => apply(fx, plan, [{ category: 'local_branch', id: 'main' }])).toThrow(
      'not in the plan',
    )
  })
})

describe('plan files', () => {
  test('a written plan reads back and applies', () => {
    const fx = buildFixture()
    const path = join(fx.root, '.plans', 'p.json')
    writePlan(path, makePlan(fx.root))
    const { receipt } = apply(fx, readPlan(path), [{ category: 'local_branch', id: 'merged-a' }])
    expect(receipt.status).toBe('complete')
  })

  test('a version 1 plan without a branch key still reads and applies', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root) as unknown as { repos: Array<Record<string, unknown>> }
    for (const repo of plan.repos) delete repo['branch']
    const path = join(fx.root, 'v1.json')
    writeFileSync(path, JSON.stringify(plan))
    const { receipt } = apply(fx, readPlan(path), [{ category: 'local_branch', id: 'merged-a' }])
    expect(receipt.status).toBe('complete')
  })

  test('a host annotate hook decides what the re-check sees', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    const receipt = applyPlan(plan, [{ category: 'local_branch', id: 'merged-a' }], [], {
      callerCwd: fx.root,
      dryRun: true,
      receiptPath: join(fx.root, 'unused.json'),
      planPath: 'plan.json',
      annotate: (_repo, items) => items.map((item) => ({ ...item, deletable: false })),
    })
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['not-deletable'])
  })
})
