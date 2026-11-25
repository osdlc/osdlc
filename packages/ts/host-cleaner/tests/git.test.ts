import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import {
  FatalRun,
  ReceiptSchema,
  clean,
  gitPlugin,
  plan,
  survey,
  type Ctx,
  type Plugin,
} from '../src/index.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const sh = (cwd: string, args: string[]): string =>
  new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()

const idle = { alive: () => false, holders: () => [] }

/** A repository whose `wt-branch` is merged and checked out in a clean worktree, plus one unmerged branch. */
function fixture() {
  const pair = makeBareAndWorker()
  cleanups.push(pair.cleanup)
  const root = pair.worker.dir
  sh(root, ['commit', '--allow-empty', '-m', 'initial'])
  sh(root, ['push', '-q', '-u', 'origin', 'main'])
  sh(root, ['checkout', '-q', '-b', 'unmerged'])
  sh(root, ['commit', '--allow-empty', '-m', 'wip'])
  sh(root, ['checkout', '-q', 'main'])
  const worktree = join(pair.parent, 'wt-a')
  sh(root, ['worktree', 'add', '-q', '-b', 'wt-branch', worktree, 'main'])
  sh(worktree, ['commit', '--allow-empty', '-m', 'feat'])
  sh(root, ['merge', '-q', '--no-ff', '-m', 'Merge wt-branch', 'wt-branch'])
  sh(root, ['push', '-q', 'origin', 'main'])
  const ctx: Ctx = { cwd: root, targets: [root], allow: [] }
  const plugin = gitPlugin({
    probe: idle,
    sweep: { remotes: [''], offline: true, provider: 'none' },
  })
  return { root, bare: pair.bare.dir, worktree: realpathSync(worktree), ctx, plugin }
}

/** The git plugin of `fixture`, archiving. */
const archiving = () =>
  gitPlugin({
    probe: idle,
    archive: {},
    sweep: { remotes: [''], offline: true, provider: 'none' },
  })

/** A plugin that acts on every candidate in `prepare`, as orca does, and records which. */
function acting(act: (id: string) => void = () => {}): Plugin & { prepared: string[] } {
  const prepared: string[] = []
  return {
    name: 'acting',
    detect: () => true,
    prepare: (c) => {
      prepared.push(c.id)
      act(c.id)
    },
    prepared,
  }
}

/** The archive branches on the remote, each with its parents after the first. */
const archives = (bare: string): string[][] =>
  sh(bare, ['for-each-ref', '--format=%(refname)', 'refs/heads/archive/'])
    .split('\n')
    .filter((ref) => ref !== '')
    .map((ref) => sh(bare, ['log', '-1', '--format=%P', ref]).split(' ').slice(1))

const branches = (root: string): string => sh(root, ['branch', '--format=%(refname:short)'])

describe('the git plugin', () => {
  test('proposes worktrees and branches, objects with their risks, and a freed branch requires its worktree', () => {
    const fx = fixture()
    const s = survey([fx.plugin], fx.ctx)
    const byId = new Map(s.candidates.map((c) => [c.id, c]))
    const branchId = `branch:${realpathSync(fx.root)}:wt-branch`
    expect(byId.get(branchId)?.requires).toEqual([`worktree:${fx.worktree}`])
    expect(byId.get(`worktree:${fx.worktree}`)).toMatchObject({ owner: 'git' })
    expect(byId.get(`worktree:${fx.worktree}`)?.held).toBeUndefined()
    const unmerged = [...byId.values()].find((c) => c.path.endsWith(':unmerged'))!
    expect(s.objections).toContainEqual(
      expect.objectContaining({
        by: 'git',
        candidate: unmerged.id,
        level: 'protest',
        code: 'abandon-unmerged',
      }),
    )
  })

  test('cleans a worktree, then the branch it freed, through one receipt', () => {
    const fx = fixture()
    const dir = mkdtempSync(join(tmpdir(), 'hc-receipt-'))
    const receiptPath = join(dir, 'receipt.json')
    const s = survey([fx.plugin], fx.ctx)
    const pick = [`worktree:${fx.worktree}`, `branch:${realpathSync(fx.root)}:wt-branch`]
    const receipt = clean(plan(s, { select: pick }), [fx.plugin], fx.ctx, { receiptPath })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual(pick.map((id) => [id, 'ok']))
    expect(receipt.steps[0]!.delete).toBe('directory gone and unregistered')
    expect(existsSync(fx.worktree)).toBe(false)
    expect(branches(fx.root)).not.toContain('wt-branch')
    expect(branches(fx.root)).toContain('unmerged')
    expect(ReceiptSchema.parse(JSON.parse(readFileSync(receiptPath, 'utf8'))).status).toBe(
      'complete',
    )
  })

  test('an unmerged branch needs abandon-unmerged granted by name', () => {
    const fx = fixture()
    const unmerged = survey([fx.plugin], fx.ctx).candidates.find((c) =>
      c.path.endsWith(':unmerged'),
    )!
    const p = plan(survey([fx.plugin], fx.ctx), { select: [unmerged.id] })
    expect(clean(p, [fx.plugin], fx.ctx).dropped[0]).toMatchObject({ reason: 'not-allowed' })
    const granted = { ...fx.ctx, allow: ['abandon-unmerged'] }
    const receipt = clean({ ...p, allow: ['abandon-unmerged'] }, [fx.plugin], granted)
    expect(receipt.steps[0]!.result).toBe('ok')
    expect(branches(fx.root)).not.toContain('unmerged')
  })

  test('a failed archive push throws FatalRun, which stops the run', () => {
    const fx = fixture()
    sh(fx.root, ['remote', 'set-url', 'origin', '/nonexistent/remote.git'])
    sh(fx.root, ['config', 'remote.origin.pushurl', '/nonexistent/remote.git'])
    const plugin = archiving()
    const s = survey([plugin], fx.ctx)
    const target = s.candidates.find((c) => c.path.endsWith(':unmerged'))!
    const allow = { ...fx.ctx, allow: ['abandon-unmerged', 'discard-archived'] }
    expect(() => plugin.prepare!(target, allow)).toThrow(FatalRun)
    expect(() => plugin.delete!(target, allow)).toThrow('was not prepared')
    expect(branches(fx.root)).toContain('unmerged')
  })

  test('a failed archive push stops the run before another plugin acts, and deletes nothing in the repository', () => {
    const fx = fixture()
    writeFileSync(join(fx.worktree, 'wip.txt'), 'wip\n')
    sh(fx.root, ['branch', 'merged', 'main'])
    sh(fx.root, ['config', 'remote.origin.pushurl', '/nonexistent/remote.git'])
    const plugin = archiving()
    const other = acting()
    const pick = [`branch:${realpathSync(fx.root)}:merged`, `worktree:${fx.worktree}`]
    const allow = ['discard-changes']
    const p = plan(survey([plugin, other], fx.ctx), { select: pick, allow })
    const receipt = clean(p, [plugin, other], { ...fx.ctx, allow })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([
      [pick[0], 'failed'],
      [pick[1], 'skipped'],
    ])
    expect(receipt.steps[0]!.error).toContain('archive failed')
    expect(other.prepared).toEqual([])
    expect(branches(fx.root)).toContain('merged')
    expect(readFileSync(join(fx.worktree, 'wip.txt'), 'utf8')).toBe('wip\n')
  })

  test('a run archives a repository once, and a commit two candidates hold once', () => {
    const fx = fixture()
    sh(fx.worktree, ['commit', '--allow-empty', '-m', 'more'])
    sh(fx.root, ['branch', 'copy', 'unmerged'])
    const plugin = archiving()
    const of = (name: string) => `branch:${realpathSync(fx.root)}:${name}`
    const pick = [`worktree:${fx.worktree}`, of('unmerged'), of('copy')]
    const tips = ['wt-branch', 'unmerged'].map((b) => sh(fx.root, ['rev-parse', b]))
    const allow = ['abandon-unmerged']
    const p = plan(survey([plugin], fx.ctx), { select: pick, allow })
    const receipt = clean(p, [plugin], { ...fx.ctx, allow })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual(pick.map((id) => [id, 'ok']))
    expect(receipt.steps.every((x) => x.delete!.includes('refs/heads/archive/'))).toBe(true)
    expect(archives(fx.bare)).toEqual([tips])
  })

  test('only what the run deletes is archived', () => {
    const fx = fixture()
    writeFileSync(join(fx.worktree, 'wip.txt'), 'wip\n')
    const plugin = archiving()
    const pick = [`branch:${realpathSync(fx.root)}:unmerged`]
    const tip = sh(fx.root, ['rev-parse', 'unmerged'])
    const allow = ['abandon-unmerged', 'discard-changes']
    const p = plan(survey([plugin], fx.ctx), { select: pick, allow })
    expect(clean(p, [plugin], { ...fx.ctx, allow }).status).toBe('complete')
    expect(archives(fx.bare)).toEqual([[tip]])
  })

  test('a worktree changed since the archive fails before another plugin acts on it, and stays', () => {
    const fx = fixture()
    writeFileSync(join(fx.worktree, 'wip.txt'), 'wip\n')
    const plugin = archiving()
    // The branch is first, so the archive of both is already pushed when this writes.
    const other = acting(() => writeFileSync(join(fx.worktree, 'late.txt'), 'late\n'))
    const pick = [`branch:${realpathSync(fx.root)}:unmerged`, `worktree:${fx.worktree}`]
    const allow = ['abandon-unmerged', 'discard-changes']
    const p = plan(survey([plugin, other], fx.ctx), { select: pick, allow })
    const receipt = clean(p, [plugin, other], { ...fx.ctx, allow })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([
      [pick[0], 'ok'],
      [pick[1], 'failed'],
    ])
    expect(receipt.steps[1]!.error).toContain('changed since it was archived')
    expect(other.prepared).toEqual([pick[0]])
    expect(existsSync(join(fx.worktree, 'late.txt'))).toBe(true)
  })

  test('a worktree another plugin changes in its own prepare is not deleted', () => {
    const fx = fixture()
    writeFileSync(join(fx.worktree, 'wip.txt'), 'wip\n')
    const plugin = archiving()
    const other = acting(() => writeFileSync(join(fx.worktree, 'late.txt'), 'late\n'))
    const allow = ['discard-changes']
    const p = plan(survey([plugin, other], fx.ctx), { select: [`worktree:${fx.worktree}`], allow })
    const receipt = clean(p, [plugin, other], { ...fx.ctx, allow })
    expect(receipt.steps[0]).toMatchObject({ result: 'failed' })
    expect(receipt.steps[0]!.error).toContain('changed since it was archived')
    expect(existsSync(join(fx.worktree, 'late.txt'))).toBe(true)
  })

  test('with archive, unlanded work in a repository with no remote is refused, merged work is not', () => {
    const fx = fixture()
    sh(fx.root, ['remote', 'remove', 'origin'])
    const plugin = archiving()
    const s = survey([plugin], fx.ctx)
    const unmerged = s.candidates.find((c) => c.path.endsWith(':unmerged'))!
    const noRemote = s.objections.filter((o) => o.code === 'no-remote')
    expect(noRemote.map((o) => [o.candidate, o.level])).toEqual([[unmerged.id, 'refuse']])
  })
})
