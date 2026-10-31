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
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { Git, PUSH_REJECTIONS } from '@osdlc/typed-git'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import { sh } from './helpers.ts'
import {
  ApplyRefused,
  applyPlan,
  networkRemoteKey,
  type Grant,
  type RowSelection,
} from '../src/apply.ts'
import { PLAN_VERSION, parsePlan, planRepo, readPlan, writePlan, type Plan } from '../src/plan.ts'
import type { Receipt, RowRef } from '../src/receipt.ts'
import { summarizeReceipt } from '../src/render.ts'
import { sweepRepo } from '../src/sweep.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

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

describe('applyPlan fetches as the plan did', () => {
  /** A plan of `merged-a`'s local row, and a push to `main` the worker has not fetched. */
  function setup(fetch: boolean) {
    const fx = buildFixture()
    const { repo, items } = sweepRepo(fx.root, { noGh: true, cwd: fx.root, fetch })
    const plan: Plan = {
      version: PLAN_VERSION,
      created_at: new Date().toISOString(),
      repos: [planRepo(repo!.root, { remote: null, noGh: true, fetch }, items)],
    }
    const other = join(realpathSync(mkdtempSync(join(tmpdir(), 'rc-other-'))), 'c')
    cleanups.push(() => rmSync(dirname(other), { recursive: true, force: true }))
    sh(dirname(other), ['clone', '-q', fx.bare, other])
    sh(other, ['commit', '-q', '--allow-empty', '-m', 'moved on'])
    sh(other, ['push', '-q', 'origin', 'main'])
    return { fx, plan, remoteMain: sh(fx.bare, ['rev-parse', 'main']) }
  }
  const run = (fx: Fixture, plan: Plan, fetch?: boolean) =>
    applyPlan(plan, [{ category: 'local_branch', id: 'merged-a' }], [], {
      callerCwd: fx.root,
      dryRun: false,
      receiptPath: null,
      planPath: 'plan.json',
      ...(fetch === undefined ? {} : { fetch }),
    })

  test('a plan swept after a fetch is re-checked after one', () => {
    const { fx, plan, remoteMain } = setup(true)
    expect(plan.repos[0]!.fetch).toBe(true)
    expect(run(fx, plan).status).toBe('complete')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).toBe(remoteMain)
  })

  test('a plan that did not fetch is not fetched', () => {
    const { fx, plan, remoteMain } = setup(false)
    expect(run(fx, plan).status).toBe('complete')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).not.toBe(remoteMain)
  })

  test('the caller can ask for a fetch the plan did not record', () => {
    const { fx, plan, remoteMain } = setup(false)
    expect(run(fx, plan, true).status).toBe('complete')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).toBe(remoteMain)
  })

  test('a failed fetch fails the run before any step', () => {
    const { fx, plan } = setup(true)
    sh(fx.root, ['remote', 'set-url', 'origin', join(tmpdir(), 'rc-missing.git')])
    expect(() => run(fx, plan)).toThrow(/fetch failed/)
    expect(refs(fx.root)).toContain('refs/heads/merged-a ')
  })

  test('a plan written before the field reads as not fetched', () => {
    const plan = parsePlan(
      JSON.stringify({
        version: PLAN_VERSION,
        created_at: 'x',
        repos: [{ root: '/r', remote: null, no_gh: true, rows: [] }],
      }),
      'old.json',
    )
    expect(plan.repos[0]!.fetch).toBe(false)
  })
})

describe('keeping a remote branch (#583)', () => {
  const KEEP = { category: 'remote_branch', id: 'origin/merged-a' } as const
  const LOCAL = { category: 'local_branch', id: 'merged-a' } as const

  /** A push to `merged-a` on the remote from another clone. */
  function moveRemote(fx: Fixture): string {
    const other = join(realpathSync(mkdtempSync(join(tmpdir(), 'rc-keep-'))), 'c')
    cleanups.push(() => rmSync(dirname(other), { recursive: true, force: true }))
    sh(dirname(other), ['clone', '-q', '-b', 'merged-a', fx.bare, other])
    sh(other, ['commit', '-q', '--allow-empty', '-m', 'more'])
    sh(other, ['push', '-q', 'origin', 'merged-a'])
    return sh(fx.bare, ['rev-parse', 'merged-a'])
  }
  const run = (fx: Fixture, plan: Plan, extra: Partial<Parameters<typeof applyPlan>[3]> = {}) =>
    applyPlan(plan, [LOCAL], [], {
      callerCwd: fx.root,
      dryRun: false,
      receiptPath: null,
      planPath: 'plan.json',
      keep: [KEEP],
      ...extra,
    })

  test('the remote branch stays, its tip checked first; the local branch goes', () => {
    const fx = buildFixture()
    const receipt = run(fx, makePlan(fx.root))
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => [s.action, s.result])).toEqual([
      ['verify-remote', 'ok'],
      ['delete-local', 'ok'],
      ['prune-worktrees', 'ok'],
    ])
    expect(receipt.steps[0]!.verification).toBe('tip unchanged; kept')
    expect(remoteHeads(fx.bare)).toContain('refs/heads/merged-a')
    expect(refs(fx.root)).not.toContain('refs/heads/merged-a ')
    expect(summarizeReceipt(receipt).deleted).toEqual({
      worktree: 0,
      local_branch: 1,
      remote_branch: 0,
    })
  })

  test('a kept branch that moved since the plan refuses the run, touching nothing', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    moveRemote(fx)
    expect(() => run(fx, plan)).toThrow(ApplyRefused)
    expect(() => run(fx, plan)).toThrow(/kept remote_branch:origin\/merged-a moved since the plan/)
    expect(refs(fx.root)).toContain('refs/heads/merged-a ')
  })

  test('one that moves after the re-check stops the run at its tip check', () => {
    const fx = buildFixture()
    let moved = ''
    const receipt = run(fx, makePlan(fx.root), { onStart: () => (moved = moveRemote(fx)) })
    expect(receipt.status).toBe('failed')
    expect(receipt.steps[0]!.action).toBe('verify-remote')
    expect(receipt.steps[0]!.error).toContain(`moved to ${moved}`)
    expect(receipt.steps[1]!.result).toBe('pending')
    expect(refs(fx.root)).toContain('refs/heads/merged-a ')
    expect(summarizeReceipt(receipt).notRun).toBe(1)
  })

  test('only a remote branch row can be kept, and not one also selected', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    expect(() => run(fx, plan, { keep: [LOCAL] })).toThrow(/--keep takes a remote_branch row/)
    expect(() =>
      applyPlan(plan, [LOCAL, KEEP], [], {
        callerCwd: fx.root,
        dryRun: true,
        receiptPath: null,
        planPath: 'plan.json',
        keep: [KEEP],
      }),
    ).toThrow(/both selected and kept/)
  })

  test('with no rows named, every other row applies and the kept one is checked', () => {
    const fx = buildFixture()
    const receipt = applyPlan(makePlan(fx.root), [], [], {
      callerCwd: fx.root,
      dryRun: true,
      receiptPath: null,
      planPath: 'plan.json',
      keep: [KEEP],
    })
    expect(receipt.steps[0]!.action).toBe('verify-remote')
    expect(receipt.steps.some((s) => s.action === 'delete-remote' && s.row?.id === KEEP.id)).toBe(
      false,
    )
    expect(receipt.steps.some((s) => s.action === 'delete-local' && s.row?.id === 'merged-a')).toBe(
      true,
    )
  })
})

describe('applyPlan', () => {
  test('onStepDone hears each finished step, even when the receipt then cannot be saved', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    const receiptDir = join(fx.root, '.receipts')
    const done: string[] = []
    const run = () =>
      applyPlan(plan, [{ category: 'local_branch', id: 'merged-a' }], [], {
        callerCwd: fx.root,
        dryRun: false,
        receiptPath: join(receiptDir, 'r.json'),
        planPath: 'plan.json',
        // The receipt is saved once before the first step; lock its directory
        // once that has happened, so the save after the step fails.
        onStep: () => chmodSync(receiptDir, 0o500),
        onStepDone: (_i, _n, step) => done.push(`${step.action}:${step.result}`),
      })
    cleanups.push(() => chmodSync(receiptDir, 0o700))
    expect(run).toThrow()
    expect(done).toEqual(['delete-local:ok'])
  })

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
    // The summary, git's reason once in parentheses, then the reference text.
    const error = receipt.steps[0]!.error!
    expect(error).toMatch(/^\[remote rejected\] \([^()]+\): /)
    expect(error.slice(error.indexOf('): ') + 3)).toBe(PUSH_REJECTIONS['hook-declined'].message)
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

  test('a worktree directory whose .git is gone is swept, then pruned and left in place', () => {
    const fx = buildFixture()
    rmSync(join(fx.worktree, '.git'))
    writeFileSync(join(fx.worktree, 'left.txt'), 'kept\n')

    const sweep = sweepRepo(fx.root, { noGh: true, cwd: fx.root })
    expect(sweep.error).toBeNull()
    const row = sweep.items.find((i) => i.id === fx.worktree)!
    expect(row).toMatchObject({
      classification: 'safe-to-delete',
      commands: [expect.stringContaining('worktree prune')],
    })
    expect(row.facts).toMatchObject({ on_disk: false, directory_left: true })

    const { receipt } = apply(fx, makePlan(fx.root), [{ category: 'worktree', id: fx.worktree }])
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]!.action).toBe('prune-worktrees')
    expect(sh(fx.root, ['worktree', 'list'])).not.toContain(fx.worktree)
    expect(readFileSync(join(fx.worktree, 'left.txt'), 'utf-8')).toBe('kept\n')
  })

  test('a prune row whose .git came back is dropped, not turned into a remove', () => {
    const fx = buildFixture()
    const dotGit = readFileSync(join(fx.worktree, '.git'), 'utf-8')
    rmSync(join(fx.worktree, '.git'))
    const plan = makePlan(fx.root)
    writeFileSync(join(fx.worktree, '.git'), dotGit)

    const { receipt } = apply(fx, plan, [{ category: 'worktree', id: fx.worktree }])
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['facts-changed'])
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a branch name two repositories share applies in both', () => {
    const a = buildFixture()
    const b = buildFixture()
    const plan: Plan = {
      ...makePlan(a.root),
      repos: [...makePlan(a.root).repos, ...makePlan(b.root).repos],
    }
    const receipt = applyPlan(plan, [], [], {
      callerCwd: a.root,
      dryRun: false,
      receiptPath: null,
      planPath: '(test)',
    })
    expect(receipt.status).toBe('complete')
    expect(refs(a.root)).not.toContain('refs/heads/merged-a ')
    expect(refs(b.root)).not.toContain('refs/heads/merged-a ')
    // Named without a repository, the shared row is still ambiguous.
    expect(() =>
      applyPlan(plan, [{ category: 'local_branch', id: 'merged-b' }], [], {
        callerCwd: a.root,
        dryRun: true,
        receiptPath: null,
        planPath: '(test)',
      }),
    ).toThrow('pass --repo-root')
  })

  test('two clones of one remote delete its branch once; the second row is a duplicate', () => {
    const fx = buildFixture()
    const second = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-clone-')))
    cleanups.push(() => rmSync(second, { recursive: true, force: true }))
    sh(second, ['clone', '-q', fx.bare, 'b'])
    const b = join(second, 'b')
    const plan: Plan = {
      ...makePlan(fx.root),
      repos: [...makePlan(fx.root).repos, ...makePlan(b).repos],
    }
    // Pin by the roots git reported, which are resolved (`/private/var` on macOS).
    const [rootA, rootB] = plan.repos.map((r) => r.root) as [string, string]
    const rows: RowSelection[] = [
      { category: 'remote_branch', id: 'origin/merged-a', repo: rootA },
      { category: 'remote_branch', id: 'origin/merged-a', repo: rootB },
    ]
    const receipt = applyPlan(plan, rows, [], {
      callerCwd: fx.root,
      dryRun: false,
      receiptPath: null,
      planPath: '(test)',
    })
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.filter((s) => s.action === 'delete-remote')).toHaveLength(1)
    expect(receipt.dropped).toMatchObject([{ repo: b, id: 'origin/merged-a', reason: 'duplicate' }])
    expect(remoteHeads(fx.bare)).not.toContain('refs/heads/merged-a')
  })

  test('a clone whose URL reaches the remote through insteadOf counts as the same remote', () => {
    const fx = buildFixture()
    const other = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-clone-')))
    cleanups.push(() => rmSync(other, { recursive: true, force: true }))
    sh(other, ['clone', '-q', fx.bare, 'b'])
    const b = join(other, 'b')
    sh(b, ['config', `url.${fx.bare}.insteadOf`, 'alias:project'])
    sh(b, ['remote', 'set-url', 'origin', 'alias:project'])
    const plan: Plan = {
      ...makePlan(fx.root),
      repos: [...makePlan(fx.root).repos, ...makePlan(b).repos],
    }
    const [rootA, rootB] = plan.repos.map((r) => r.root) as [string, string]
    const receipt = applyPlan(
      plan,
      [
        { category: 'remote_branch', id: 'origin/merged-a', repo: rootA },
        { category: 'remote_branch', id: 'origin/merged-a', repo: rootB },
      ],
      [],
      { callerCwd: fx.root, dryRun: true, receiptPath: null, planPath: '(test)' },
    )
    expect(receipt.dropped.map((d) => [d.repo, d.reason])).toEqual([[rootB, 'duplicate']])
  })

  test('local remotes `x` and `x.git` are different remotes', () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-remotes-')))
    cleanups.push(() => rmSync(parent, { recursive: true, force: true }))
    const roots: string[] = []
    for (const bare of ['project', 'project.git']) {
      sh(parent, ['init', '-q', '--bare', '-b', 'main', bare])
      const work = join(parent, `work-${bare}`)
      sh(parent, ['clone', '-q', join(parent, bare), work])
      sh(work, ['commit', '-q', '--allow-empty', '-m', 'init'])
      sh(work, ['push', '-q', '-u', 'origin', 'main'])
      sh(work, ['push', '-q', 'origin', 'main:refs/heads/topic'])
      roots.push(work)
    }
    const plan: Plan = {
      version: PLAN_VERSION,
      created_at: 'x',
      repos: roots.map((root) => {
        const { repo, items } = sweepRepo(root, { noGh: true, cwd: root })
        return planRepo(repo!.root, { remote: null, noGh: true }, items)
      }),
    }
    const receipt = applyPlan(plan, [], [], {
      callerCwd: parent,
      dryRun: true,
      receiptPath: null,
      planPath: '(test)',
    })
    expect(receipt.dropped.filter((d) => d.reason === 'duplicate')).toEqual([])
    expect(receipt.steps.filter((s) => s.action === 'delete-remote')).toHaveLength(2)
  })

  test('safeOnly keeps the review-row guard on rows that are named', () => {
    const fx = buildFixture()
    const receipt = applyPlan(makePlan(fx.root), [{ category: 'worktree', id: fx.worktree }], [], {
      callerCwd: fx.root,
      dryRun: true,
      receiptPath: null,
      planPath: '(test)',
      safeOnly: true,
    })
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['needs-review'])
  })

  test('swept items stand in for the re-sweep', () => {
    const fx = buildFixture()
    const { repo, items } = sweepRepo(fx.root, { noGh: true, cwd: fx.root })
    const pinned = items.map((i) => (i.id === 'merged-a' ? { ...i, deletable: false } : i))
    const receipt = applyPlan(
      makePlan(fx.root),
      [{ category: 'local_branch', id: 'merged-a' }],
      [],
      {
        callerCwd: fx.root,
        dryRun: true,
        receiptPath: null,
        planPath: '(test)',
        swept: new Map([[repo!.root, pinned]]),
      },
    )
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['not-deletable'])
  })

  test('rows dropped before the run are recorded first in the receipt file', () => {
    const fx = buildFixture()
    const earlier = {
      repo: fx.root,
      category: 'local_branch' as const,
      id: 'unmerged',
      reason: 'needs-review' as const,
      detail: 'from the preview',
    }
    const receiptPath = join(fx.root, 'r.json')
    applyPlan(makePlan(fx.root), [{ category: 'local_branch', id: 'merged-a' }], [], {
      callerCwd: fx.root,
      dryRun: false,
      receiptPath,
      planPath: '(test)',
      dropped: [earlier],
    })
    const saved = JSON.parse(readFileSync(receiptPath, 'utf-8')) as Receipt
    expect(saved.dropped).toEqual([earlier])
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

  test('no rows selects every safe-to-delete row; review rows are dropped, not run', () => {
    const fx = buildFixture()
    const { receipt } = apply(fx, makePlan(fx.root), [])
    expect(receipt.status).toBe('complete')
    // Review rows run only when named: the worktree (no disposability signal
    // without gh) and the unmerged branch.
    expect(receipt.dropped.map((d) => [d.id, d.reason])).toEqual([
      [fx.worktree, 'needs-review'],
      ['unmerged', 'needs-review'],
    ])
    expect(refs(fx.root)).not.toContain('refs/heads/merged-a ')
    expect(refs(fx.root)).not.toContain('refs/heads/merged-b ')
    expect(refs(fx.root)).toContain('refs/heads/unmerged ')
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a null receiptPath applies without writing a receipt', () => {
    const fx = buildFixture()
    const receipt = applyPlan(
      makePlan(fx.root),
      [{ category: 'local_branch', id: 'merged-a' }],
      [],
      {
        callerCwd: fx.root,
        dryRun: false,
        receiptPath: null,
        planPath: '(swept)',
      },
    )
    expect(receipt.status).toBe('complete')
    expect(existsSync(join(fx.root, '.receipts'))).toBe(false)
  })

  test('a plan with no rows is an argument error', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    for (const repo of plan.repos) repo.rows = []
    expect(() => apply(fx, plan, [])).toThrow('no rows')
  })

  test('rejects a row that is not in the plan', () => {
    const fx = buildFixture()
    const plan = makePlan(fx.root)
    expect(() => apply(fx, plan, [{ category: 'local_branch', id: 'main' }])).toThrow(
      'not in the plan',
    )
  })
})

describe('networkRemoteKey', () => {
  test('one key for every form of a network URL, the whole path kept', () => {
    const forms = [
      'git@github.com:acme/api.git',
      'ssh://git@github.com/acme/api',
      'https://github.com/acme/api/',
      'https://user@GitHub.com/acme/api.git',
      'github.com:acme/api',
    ]
    expect(new Set(forms.map(networkRemoteKey))).toEqual(new Set(['github.com/acme/api']))
    expect(networkRemoteKey('https://gitlab.com/a/b/c')).not.toBe(
      networkRemoteKey('https://gitlab.com/z/b/c'),
    )
    expect(networkRemoteKey('https://host:8443/o/r')).toBe('host:8443/o/r')
  })

  test('a path on this machine is not a network URL', () => {
    for (const path of [
      '/srv/git/api.git',
      '../api',
      'C:\\repos\\api',
      'C:/repos/api',
      'file:///srv/api',
    ]) {
      expect(networkRemoteKey(path)).toBeNull()
    }
  })
})

describe('plan files', () => {
  test('parsePlan names its source in the error', () => {
    expect(() => parsePlan('{', 'stdin')).toThrow('cannot read plan stdin')
    expect(() => parsePlan('{}', 'stdin')).toThrow('bad plan stdin')
  })

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
