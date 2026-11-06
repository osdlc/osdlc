/**
 * Worktrees with submodules: the sweep reads each submodule, and `apply`
 * removes a clean one with `--force`, which plain `git worktree remove` needs
 * for any worktree with a checked-out submodule.
 *
 * Fixture: a superproject `worker` (remote `store.git`) whose `main` records a
 * submodule `sub` (remote `sub/store.git`), which records a submodule `inner`
 * of its own (remote `inner/store.git`). A linked worktree `wt` on `feat`
 * checks both out; `feat` is merged into `main` and pushed, so the worktree
 * is otherwise safe to delete.
 */

import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import { sh } from './helpers.ts'
import { applyPlan, type ApplyOptions, type Grant } from '../src/apply.ts'
import { PLAN_VERSION, planRepo, type Plan } from '../src/plan.ts'
import type { Receipt } from '../src/receipt.ts'
import { inspectSubmodules, submoduleHazards, worktreeGitDir } from '../src/submodules.ts'
import { sweepRepo } from '../src/sweep.ts'
import type { Scope, SweepItem } from '../src/types.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

/** Submodule clones from a path need `file` transport, which git disables by default. */
const FILE = ['-c', 'protocol.file.allow=always']

interface Fixture {
  root: string
  worktree: string
  /** The worktree's private git dir, where its submodules keep theirs. */
  gitDir: string
}

/** A bare remote and a worker pushed to it, with one commit. */
function pushedRepo(): { worker: string; bare: string } {
  const pair = makeBareAndWorker()
  cleanups.push(pair.cleanup)
  sh(pair.worker.dir, ['commit', '--allow-empty', '-m', 'initial'])
  sh(pair.worker.dir, ['push', '-q', '-u', 'origin', 'main'])
  return { worker: realpathSync(pair.worker.dir), bare: realpathSync(pair.bare.dir) }
}

function buildFixture(opts: { nested?: boolean } = {}): Fixture {
  const sub = pushedRepo()
  if (opts.nested === true) {
    const inner = pushedRepo()
    sh(sub.worker, [...FILE, 'submodule', 'add', '-q', inner.bare, 'inner'])
    sh(sub.worker, ['commit', '-q', '-m', 'add inner'])
    sh(sub.worker, ['push', '-q', 'origin', 'main'])
  }
  const top = pushedRepo()
  const root = top.worker
  sh(root, [...FILE, 'submodule', 'add', '-q', sub.bare, 'sub'])
  sh(root, ['commit', '-q', '-m', 'add sub'])
  sh(root, ['push', '-q', 'origin', 'main'])

  const worktree = join(root, '..', 'wt')
  sh(root, ['worktree', 'add', '-q', '-b', 'feat', worktree, 'main'])
  const wt = realpathSync(worktree)
  sh(wt, [...FILE, 'submodule', 'update', '-q', '--init', '--recursive'])
  sh(wt, ['commit', '--allow-empty', '-m', 'feat: work'])
  sh(root, ['merge', '-q', '--no-ff', '-m', 'Merge feat', 'feat'])
  sh(root, ['push', '-q', 'origin', 'main'])
  const gitDir = new Git(wt).gitDir()!
  return { root, worktree: wt, gitDir }
}

function worktreeRow(fx: Fixture): SweepItem {
  const { items } = sweepRepo(fx.root, { noProvider: true, cwd: fx.root, scope: ['worktrees'] })
  return items.find((it) => it.category === 'worktree' && it.id === fx.worktree)!
}

function planOf(
  fx: Fixture,
  scope: Scope[] = ['worktrees'],
): {
  plan: Plan
  items: SweepItem[]
} {
  const { repo, items } = sweepRepo(fx.root, { noProvider: true, cwd: fx.root, scope })
  const plan: Plan = {
    version: PLAN_VERSION,
    created_at: new Date().toISOString(),
    repos: [planRepo(repo!.root, { remote: 'origin', noProvider: true }, items)],
  }
  return { plan, items }
}

function run(
  fx: Fixture,
  plan: Plan,
  opts: Partial<ApplyOptions> = {},
  grants: Grant[] = [],
): Receipt {
  return applyPlan(plan, [{ category: 'worktree', id: fx.worktree }], grants, {
    callerCwd: fx.root,
    dryRun: false,
    receiptPath: null,
    planPath: 'plan.json',
    ...opts,
  })
}

describe('inspectSubmodules', () => {
  test('a clean, pushed submodule needs the force and loses nothing', () => {
    const fx = buildFixture()
    const report = inspectSubmodules(new Git(fx.root), fx.worktree)
    expect(report.forceRequired).toBe(true)
    expect(report.submodules).toMatchObject([
      { path: 'sub', populated: true, dirtyFiles: 0, unpushedCommits: 0, stashes: 0, error: null },
    ])
    expect(report.submodules[0]!.gitDir).toBe(join(fx.gitDir, 'modules', 'sub'))
    expect(submoduleHazards(report)).toEqual([])
  })

  test('a worktree without submodules reports none and needs no force', () => {
    const fx = buildFixture()
    const plain = join(fx.root, '..', 'plain')
    sh(fx.root, ['worktree', 'add', '-q', '--detach', plain, 'main~2'])
    const report = inspectSubmodules(new Git(fx.root), realpathSync(plain))
    expect(report).toMatchObject({ submodules: [], forceRequired: false })
  })

  test('reads nested submodules through their parents', () => {
    const fx = buildFixture({ nested: true })
    const inner = join(fx.worktree, 'sub', 'inner')
    sh(inner, ['commit', '--allow-empty', '-m', 'local only'])
    const report = inspectSubmodules(new Git(fx.root), fx.worktree)
    expect(report.submodules.map((s) => s.path)).toEqual(['sub', 'sub/inner'])
    expect(report.unpushed.map((s) => [s.path, s.unpushedCommits])).toEqual([['sub/inner', 1]])
    // The new inner commit shows in `sub` as a changed gitlink.
    expect(report.dirty.map((s) => s.path)).toEqual(['sub'])
  })

  test('counts a stash, which lives in the worktree-private git dir', () => {
    const fx = buildFixture()
    const sub = join(fx.worktree, 'sub')
    writeFileSync(join(sub, 'scratch.txt'), 'wip\n')
    sh(sub, ['stash', 'push', '-q', '--include-untracked'])
    const report = inspectSubmodules(new Git(fx.root), fx.worktree)
    expect(report.unpushed).toMatchObject([{ path: 'sub', stashes: 1, unpushedCommits: 0 }])
    expect(submoduleHazards(report, { discard: true })).toEqual([
      'submodule(s) sub (1 stash) hold work no remote has',
    ])
  })

  test('finds the git dir a deinit leaves behind, and the work in it', () => {
    const fx = buildFixture()
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'local only'])
    sh(fx.worktree, ['submodule', 'deinit', '-q', '-f', 'sub'])
    const report = inspectSubmodules(new Git(fx.root), fx.worktree)
    expect(report.forceRequired).toBe(true)
    expect(report.submodules).toMatchObject([
      { path: 'sub', populated: false, recorded: expect.any(String) },
      { path: 'sub', populated: false, recorded: null, unpushedCommits: 1 },
    ])
  })

  test('reads a gone worktree through its git dir', () => {
    const fx = buildFixture()
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'local only'])
    rmSync(fx.worktree, { recursive: true, force: true })
    const common = new Git(fx.root).gitCommonDir()!
    expect(worktreeGitDir(common, fx.worktree)).toBe(fx.gitDir)
    const report = inspectSubmodules(new Git(fx.root), fx.worktree, { gitDir: fx.gitDir })
    expect(report.unpushed).toMatchObject([{ path: 'sub', unpushedCommits: 1 }])
  })
})

describe('sweeping a worktree with submodules', () => {
  test('clean and pushed: safe to delete, removed with --force', () => {
    const fx = buildFixture()
    const row = worktreeRow(fx)
    expect(row.classification).toBe('safe-to-delete')
    expect(row.deletable).toBe(true)
    expect(row.facts['submodules_force']).toBe(true)
    expect(row.reason).toMatch(/submodules are clean and pushed, so the remove is forced/)
    expect(row.commands).toEqual([`git -C ${fx.root} worktree remove --force ${fx.worktree}`])
    expect(row.facts['submodules']).toMatchObject([
      { path: 'sub', populated: true, dirty_files: 0, unpushed_commits: 0 },
    ])
  })

  test('an unpushed submodule commit blocks the worktree', () => {
    const fx = buildFixture()
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'local only'])
    const row = worktreeRow(fx)
    expect(row.deletable).toBe(false)
    expect(row.facts['blockers']).toContain('submodule-unpushed')
    expect(row.investigationParts.join(' ')).toMatch(/sub \(1 unpushed commit\)/)
  })

  test('a dirty submodule needs discard-changes', () => {
    const fx = buildFixture()
    writeFileSync(join(fx.worktree, 'sub', 'scratch.txt'), 'wip\n')
    const row = worktreeRow(fx)
    expect(row.classification).toBe('needs-investigation')
    expect(row.requires).toEqual(['discard-changes'])
    expect(row.facts['submodule_dirty_files']).toBe(1)
    expect(row.reason).toMatch(/1 in submodule\(s\) sub/)
  })

  test('hidden index flags inside a submodule block, as in the worktree itself', () => {
    const fx = buildFixture()
    const sub = join(fx.worktree, 'sub')
    writeFileSync(join(sub, 'tracked.txt'), 'x\n')
    sh(sub, ['add', 'tracked.txt'])
    sh(sub, ['commit', '-q', '-m', 'tracked'])
    sh(sub, ['push', '-q', 'origin', 'HEAD:refs/heads/tracked'])
    sh(sub, ['fetch', '-q', 'origin'])
    sh(sub, ['update-index', '--skip-worktree', 'tracked.txt'])
    const row = worktreeRow(fx)
    expect(row.facts['blockers']).toContain('hidden-index-flags')
    expect(row.facts['hidden_index_paths']).toEqual(['sub/tracked.txt'])
  })

  test('a gone worktree whose git dir keeps unpushed submodule work is not pruned', () => {
    const fx = buildFixture()
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'local only'])
    rmSync(fx.worktree, { recursive: true, force: true })
    const row = worktreeRow(fx)
    expect(row.facts['on_disk']).toBe(false)
    expect(row.deletable).toBe(false)
    expect(row.facts['blockers']).toEqual(['submodule-unpushed'])
  })
})

describe('applying a worktree with submodules', () => {
  test('removes a clean one, which plain `worktree remove` refuses', () => {
    const fx = buildFixture()
    const plain = new Git(fx.root).try.worktreeRemove(fx.worktree)
    expect(plain.ok).toBe(false)

    const { plan } = planOf(fx)
    const receipt = run(fx, plan)
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]).toMatchObject({
      action: 'remove-worktree',
      command: `git -C ${fx.root} worktree remove --force ${fx.worktree}`,
      result: 'ok',
    })
    expect(existsSync(fx.worktree)).toBe(false)
    // The superproject's own submodule git dir is untouched.
    expect(existsSync(join(fx.root, '.git', 'modules', 'sub'))).toBe(true)
  })

  test('removes a dirty one with the discard-changes grant', () => {
    const fx = buildFixture()
    writeFileSync(join(fx.worktree, 'sub', 'scratch.txt'), 'wip\n')
    const { plan } = planOf(fx)
    const receipt = run(fx, plan, {}, [{ name: 'discard-changes', row: null }])
    expect(receipt.status).toBe('complete')
    expect(existsSync(fx.worktree)).toBe(false)
  })

  test('drops the row when a submodule changed after the plan', () => {
    const fx = buildFixture()
    const { plan } = planOf(fx)
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'late'])
    const receipt = run(fx, plan)
    expect(receipt.dropped).toMatchObject([{ id: fx.worktree, reason: 'not-deletable' }])
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('refuses the forced remove when a submodule gained work after the re-check', () => {
    const fx = buildFixture()
    const { plan, items } = planOf(fx)
    // Re-check against the earlier sweep, as a preview does; the work lands
    // between it and the remove.
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'late'])
    const receipt = run(fx, plan, { swept: new Map([[fx.root, items]]) })
    expect(receipt.status).toBe('failed')
    expect(receipt.steps[0]!.error).toMatch(/refused: .*sub \(1 unpushed commit\)/)
    expect(existsSync(join(fx.worktree, 'sub'))).toBe(true)
  })

  test('refuses the forced remove when the worktree itself got dirty after the re-check', () => {
    const fx = buildFixture()
    const { plan, items } = planOf(fx)
    writeFileSync(join(fx.worktree, 'new.txt'), 'late\n')
    const receipt = run(fx, plan, { swept: new Map([[fx.root, items]]) })
    expect(receipt.status).toBe('failed')
    expect(receipt.steps[0]!.error).toMatch(/refused: .*1 modified or untracked file/)
    expect(existsSync(join(fx.worktree, 'new.txt'))).toBe(true)
  })

  test("the closing prune leaves a gone worktree's unpushed submodule work alone", () => {
    const fx = buildFixture()
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'local only'])
    rmSync(fx.worktree, { recursive: true, force: true })
    sh(fx.root, ['branch', 'merged-x', 'main'])
    sh(fx.root, ['push', '-q', 'origin', 'merged-x'])
    const { plan } = planOf(fx, ['local-branches'])
    const receipt = applyPlan(plan, [{ category: 'local_branch', id: 'merged-x' }], [], {
      callerCwd: fx.root,
      dryRun: false,
      receiptPath: null,
      planPath: 'plan.json',
    })
    expect(receipt.status).toBe('complete')
    const prune = receipt.steps.find((s) => s.action === 'prune-worktrees')!
    expect(prune.verification).toMatch(/^not pruned: .*sub \(1 unpushed commit\)/)
    expect(existsSync(join(fx.gitDir, 'modules', 'sub'))).toBe(true)
  })
})
