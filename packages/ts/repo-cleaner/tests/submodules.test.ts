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
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import { sh } from './helpers.ts'
import { check, run as runPreview, type Approval, type RunOptions } from '../src/clean.ts'
import { plan as makePlan, type Plan } from '../src/plan.ts'
import type { Receipt } from '../src/receipt.ts'
import { inspectSubmodules, submoduleHazards, worktreeGitDirs } from '../src/submodules.ts'
import { inspectWorktree, sweep } from '../src/sweep.ts'
import type { Kind, Sweep, WorktreeRow } from '../src/types.ts'

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

function worktreeRow(fx: Fixture): WorktreeRow {
  const { rows } = sweep([fx.root], { cwd: fx.root, only: ['worktree'] }).repos[0]!
  return rows.find((r): r is WorktreeRow => r.kind === 'worktree' && r.name === fx.worktree)!
}

function planOf(
  fx: Fixture,
  only: Kind[] = ['worktree'],
): {
  plan: Plan
  swept: Sweep
} {
  const swept = sweep([fx.root], { cwd: fx.root, only })
  return { plan: makePlan(swept), swept }
}

const wtId = (fx: Fixture): string => `worktree:${fx.worktree}`

/**
 * Check the plan with the worktree picked, then run it. `checkWith` is the
 * sweep the check reads instead of sweeping again, as a preview straight after
 * a sweep does; the run always sweeps again.
 */
function run(
  fx: Fixture,
  plan: Plan,
  opts: Partial<RunOptions> & { checkWith?: Sweep } = {},
  allow: Approval['allow'] = [],
  pick: string[] = [wtId(fx)],
): Receipt {
  const { checkWith, ...runOpts } = opts
  const preview = check(plan, { pick, allow }, { cwd: fx.root, sweep: checkWith })
  return runPreview(preview, { cwd: fx.root, source: 'plan.json', ...runOpts })
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
    expect(worktreeGitDirs(common).get(fx.worktree)).toBe(fx.gitDir)
    const report = inspectSubmodules(new Git(fx.root), fx.worktree, { gitDir: fx.gitDir })
    expect(report.unpushed).toMatchObject([{ path: 'sub', unpushedCommits: 1 }])
  })
})

describe('sweeping a worktree with submodules', () => {
  test('clean and pushed: safe to delete, removed with --force', () => {
    const fx = buildFixture()
    const row = worktreeRow(fx)
    expect(row.verdict).toBe('delete')
    expect(row.action).toBe('remove')
    expect(row.evidence.forcedForSubmodules).toBe(true)
    expect(row.why).toMatch(/submodules are clean and pushed, so the remove is forced/)
    expect(row.commands).toEqual([`git -C ${fx.root} worktree remove --force ${fx.worktree}`])
    expect(row.evidence.submodules).toMatchObject([
      { path: 'sub', populated: true, dirtyFiles: 0, unpushedCommits: 0 },
    ])
  })

  test("an unpushed submodule commit needs abandon-unmerged, as the worktree's own would", () => {
    const fx = buildFixture()
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'local only'])
    const row = worktreeRow(fx)
    expect(row.verdict).toBe('review')
    expect(row.action).toBe('remove')
    expect(row.blockers).toEqual([])
    // The new commit also moves the gitlink, which the superproject shows as a change.
    expect(row.risks).toEqual(['abandon-unmerged', 'discard-changes'])
    expect(row.why).toMatch(/unpushed work in submodule\(s\) sub \(1 unpushed commit\)/)
  })

  test('a submodule stash needs abandon-unmerged alone', () => {
    const fx = buildFixture()
    const sub = join(fx.worktree, 'sub')
    writeFileSync(join(sub, 'scratch.txt'), 'wip\n')
    sh(sub, ['stash', 'push', '-q', '--include-untracked'])
    const row = worktreeRow(fx)
    expect(row.risks).toEqual(['abandon-unmerged'])
    expect(row.why).toMatch(/sub \(1 stash\)/)
  })

  test('a dirty submodule needs discard-changes', () => {
    const fx = buildFixture()
    writeFileSync(join(fx.worktree, 'sub', 'scratch.txt'), 'wip\n')
    const row = worktreeRow(fx)
    expect(row.verdict).toBe('review')
    expect(row.risks).toEqual(['discard-changes'])
    expect(row.evidence.submoduleDirtyFiles).toBe(1)
    expect(row.why).toMatch(/1 in submodule\(s\) sub/)
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
    expect(row.verdict).toBe('blocked')
    expect(row.blockers).toContain('hidden-index-flags')
    expect(row.evidence.hiddenIndexPaths).toEqual(['sub/tracked.txt'])
  })

  test('a gone worktree whose git dir keeps unpushed submodule work needs abandon-unmerged', () => {
    const fx = buildFixture()
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'local only'])
    rmSync(fx.worktree, { recursive: true, force: true })
    const row = worktreeRow(fx)
    expect(row.evidence.onDisk).toBe(false)
    expect(row.verdict).toBe('review')
    expect(row.action).toBe('prune')
    expect(row.risks).toEqual(['abandon-unmerged'])
    expect(row.commands).toEqual([`git -C ${fx.root} worktree remove ${fx.worktree}`])
  })
})

describe('inspectWorktree', () => {
  test('judges one worktree as the sweep does, its submodules included', () => {
    const fx = buildFixture({ nested: true })
    sh(join(fx.worktree, 'sub', 'inner'), ['commit', '--allow-empty', '-m', 'local only'])
    const row = inspectWorktree(fx.worktree, { cwd: fx.root })
    expect(row.kind).toBe('worktree')
    expect(row.id).toBe(wtId(fx))
    expect(row.evidence.forcedForSubmodules).toBe(true)
    expect(row.evidence.submodules).toMatchObject([
      { path: 'sub', populated: true, dirtyFiles: 1, unpushedCommits: 0, stashes: 0 },
      { path: 'sub/inner', populated: true, dirtyFiles: 0, unpushedCommits: 1, stashes: 0 },
    ])
    expect(row.evidence.submoduleDirtyFiles).toBe(1)
    expect(row.verdict).toBe('review')
    expect(row.risks).toEqual(['abandon-unmerged', 'discard-changes'])
    expect(row).toEqual(worktreeRow(fx))
  })

  test('takes a path relative to cwd', () => {
    const fx = buildFixture()
    const row = inspectWorktree('../wt', { cwd: fx.root })
    expect(row.id).toBe(wtId(fx))
    expect(row.evidence.submodules).toMatchObject([
      { path: 'sub', populated: true, dirtyFiles: 0, unpushedCommits: 0, stashes: 0 },
    ])
  })

  test('a path in no repository is not-found', () => {
    const fx = buildFixture()
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-outside-')))
    cleanups.push(() => rmSync(outside, { recursive: true, force: true }))
    expect(() => inspectWorktree(outside, { cwd: fx.root })).toThrow(
      expect.objectContaining({ code: 'not-found' }),
    )
  })
})

describe('running a worktree with submodules', () => {
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
    const receipt = run(fx, plan, {}, ['discard-changes'])
    expect(receipt.status).toBe('complete')
    expect(existsSync(fx.worktree)).toBe(false)
  })

  test('drops the row when a submodule changed after the plan, grant or not', () => {
    const fx = buildFixture()
    const { plan } = planOf(fx)
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'late'])
    const receipt = run(fx, plan, {}, ['abandon-unmerged', 'discard-changes'])
    expect(receipt.dropped).toMatchObject([{ row: wtId(fx), reason: 'changed' }])
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('without abandon-unmerged, a row with unpushed submodule work is dropped', () => {
    const fx = buildFixture()
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'local only'])
    const { plan } = planOf(fx)
    const receipt = run(fx, plan, {}, ['discard-changes'])
    expect(receipt.dropped).toMatchObject([
      { row: wtId(fx), reason: 'not-allowed', detail: 'needs abandon-unmerged' },
    ])
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('with abandon-unmerged, removes a worktree and its unpushed submodule work', () => {
    const fx = buildFixture({ nested: true })
    sh(join(fx.worktree, 'sub', 'inner'), ['commit', '--allow-empty', '-m', 'local only'])
    const { plan } = planOf(fx)
    const receipt = run(fx, plan, {}, [
      { risk: 'abandon-unmerged', row: wtId(fx) },
      { risk: 'discard-changes', row: wtId(fx) },
    ])
    expect(receipt.status).toBe('complete')
    expect(existsSync(fx.worktree)).toBe(false)
    expect(existsSync(fx.gitDir)).toBe(false)
  })

  test('refuses the forced remove when a submodule gained work after the re-check', () => {
    const fx = buildFixture()
    const { plan, swept } = planOf(fx)
    // Checked against the earlier sweep, as a preview does; the work lands
    // after the run's own re-sweep, just before the remove.
    const receipt = run(fx, plan, {
      checkWith: swept,
      onStep: (_i, _n, step) => {
        if (step.action === 'remove-worktree') {
          sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'late'])
        }
      },
    })
    expect(receipt.status).toBe('failed')
    expect(receipt.steps[0]!.error).toMatch(/refused: .*sub \(1 unpushed commit\)/)
    expect(existsSync(join(fx.worktree, 'sub'))).toBe(true)
  })

  test('refuses the forced remove when the worktree itself got dirty after the re-check', () => {
    const fx = buildFixture()
    const { plan, swept } = planOf(fx)
    const receipt = run(fx, plan, {
      checkWith: swept,
      onStep: (_i, _n, step) => {
        if (step.action === 'remove-worktree') writeFileSync(join(fx.worktree, 'new.txt'), 'late\n')
      },
    })
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
    const { plan } = planOf(fx, ['branch'])
    const receipt = run(fx, plan, {}, [], ['branch:merged-x'])
    expect(receipt.status).toBe('complete')
    const prune = receipt.steps.find((s) => s.action === 'prune-worktrees')!
    expect(prune.verification).toMatch(/^not pruned: .*sub \(1 unpushed commit\)/)
    expect(existsSync(join(fx.gitDir, 'modules', 'sub'))).toBe(true)
  })

  test('prunes a gone worktree and its submodule work under abandon-unmerged', () => {
    const fx = buildFixture()
    sh(join(fx.worktree, 'sub'), ['commit', '--allow-empty', '-m', 'local only'])
    rmSync(fx.worktree, { recursive: true, force: true })
    const { plan } = planOf(fx)
    const receipt = run(fx, plan, {}, ['abandon-unmerged'])
    expect(receipt.status).toBe('complete')
    expect(existsSync(fx.gitDir)).toBe(false)
  })
})
