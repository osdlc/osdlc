/**
 * `--keep-failed`: a failed PR's worktree is kept for a person, a later run leaves it alone until
 * the PR moves, and `--retry-failed` and `--discard-kept` remove it. Real git, a fake `gh`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import { prUpdateConfigSchema, type PrUpdateConfig } from '../src/config.ts'
import type { Ports } from '../src/ports.ts'
import { renderUpdateText, runUpdate, type UpdateArgs } from '../src/update.ts'

const ARGS: UpdateArgs = {
  repo: ['o/r'],
  noFetch: true,
  noDrafts: false,
  limit: 100,
  remote: 'origin',
  apply: true,
  pr: [],
  trust: false,
  retryFailed: false,
  restack: false,
}

describe('update --keep-failed', () => {
  let fx: ReturnType<typeof makeBareAndWorker>
  let verifyOk: boolean

  const real = spawnRunner('git')
  const git: CommandRunner = {
    run: (argv, opts) => real.run(argv, { ...opts, env: { ...IDENTITY, ...opts.env } }),
  }
  const gh: CommandRunner = {
    run: () => {
      fx.worker.git.fetch('origin')
      const prs = ['topic'].map((head, i) => ({
        number: i + 1,
        state: 'OPEN',
        title: head,
        url: `https://github.com/o/r/pull/${i + 1}`,
        baseRefName: 'main',
        headRefName: head,
        headRefOid: fx.worker.git.resolveRef(`origin/${head}`),
      }))
      return { exitCode: 0, stdout: JSON.stringify(prs), stderr: '' }
    },
  }
  const runVerb = (): CommandResult =>
    verifyOk
      ? { exitCode: 0, stdout: '', stderr: '' }
      : { exitCode: 3, stdout: 'ran 4 tests\n', stderr: 'FAIL widget\n' }

  async function update(patch: Partial<UpdateArgs> = {}, cfgPatch: Record<string, unknown> = {}) {
    const cfg = {
      ...prUpdateConfigSchema.parse({}),
      verify: 'check',
      max_failed_attempts: 0,
      ...cfgPatch,
    } as PrUpdateConfig
    const ports: Ports = {
      locate: () => fx.worker.dir,
      runVerb,
      resolveVerifyVerbs: async () => ['check'],
    }
    return runUpdate(
      { ...ARGS, ...patch },
      {
        projectRoot: fx.worker.dir,
        dryRun: false,
        git,
        gh,
        cfg,
        ports,
      },
    )
  }

  const kept = () => join(fx.worker.dir, '.pr-update', 'failed', 'o-r-1')
  const worktrees = () => fx.worker.git.worktrees().map((w) => w.path)

  beforeEach(() => {
    verifyOk = false
    fx = makeBareAndWorker({ initialBranch: 'main' })
    fx.worker.commit('initial', { 'shared.txt': 'base\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.checkout('main', { branch: 'topic' })
    fx.worker.commit('topic work', { 'topic.txt': 'topic\n' })
    fx.worker.git.push('origin', 'topic')
    fx.worker.git.checkout('main')
    fx.worker.commit('main moves', { 'main.txt': 'main\n' })
    fx.worker.git.push('origin', 'main')
  })
  afterEach(() => fx.cleanup())

  test('a failed verify keeps the built tree on a PR branch with its log, uncommitted', async () => {
    const out = await update({ keepFailed: true })
    expect(out.results.map((r) => r.status)).toEqual(['failed'])
    expect(out.results[0]!.keptWorktree).toBe(kept())
    expect(renderUpdateText(out)).toContain(`kept: ${kept()}`)

    const tree = fx.worker.git.at(kept())
    expect(tree.currentBranch()).toBe('pr-update/failed-o-r-1')
    expect(existsSync(join(kept(), 'main.txt'))).toBe(true)
    expect(existsSync(join(kept(), 'topic.txt'))).toBe(true)
    const log = readFileSync(join(kept(), '.pr-update-verify.log'), 'utf8')
    expect(log).toContain('$ check')
    expect(log).toContain('exit status: 3')
    expect(log).toContain('FAIL widget')
    expect(tree.statusEntries()).toEqual([])
    expect(worktrees()).toContain(realpathSync(kept()))
  })

  test('nothing is kept without the option', async () => {
    const out = await update()
    expect(out.results[0]!.keptWorktree).toBeUndefined()
    expect(existsSync(kept())).toBe(false)
  })

  test('pr_update.keep_failed turns it on, and --no-keep-failed turns it off', async () => {
    expect((await update({}, { keep_failed: true })).results[0]!.keptWorktree).toBe(kept())
    await update({ discardKept: true })
    const off = await update({ keepFailed: false }, { keep_failed: true })
    expect(off.results[0]!.keptWorktree).toBeUndefined()
  })

  test('a rehearsal keeps nothing', async () => {
    const out = await update({ keepFailed: true, apply: false })
    expect(out.results[0]!.keptWorktree).toBeUndefined()
    expect(existsSync(kept())).toBe(false)
  })

  test('a later run skips the PR while its head and base are unchanged', async () => {
    await update({ keepFailed: true })
    const again = await update({ keepFailed: true })
    expect(again.results).toEqual([])
    expect(again.skipped).toEqual([
      { repo: 'o/r', number: 1, head: 'topic', reason: `failed worktree kept at ${kept()}` },
    ])
    expect(existsSync(kept())).toBe(true)
  })

  test('--retry-failed discards the kept worktree and attempts the PR again', async () => {
    await update({ keepFailed: true })
    verifyOk = true
    const out = await update({ retryFailed: true })
    expect(out.results.map((r) => r.status)).toEqual(['updated'])
    expect(out.discarded).toEqual([kept()])
    expect(existsSync(kept())).toBe(false)
    expect(worktrees()).not.toContain(realpathSync(fx.worker.dir) + '/.pr-update/failed/o-r-1')
    expect(fx.worker.git.resolveRef('pr-update/failed-o-r-1')).toBeNull()
  })

  test('a PR whose base moved is attempted again, and its old worktree goes', async () => {
    await update({ keepFailed: true })
    fx.worker.commit('main moves again', { 'more.txt': 'x\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.fetch('origin')
    const out = await update({ keepFailed: true })
    expect(out.results.map((r) => r.status)).toEqual(['failed'])
    expect(out.discarded).toEqual([kept()])
    expect(out.results[0]!.keptWorktree).toBe(kept())
  })

  test('--discard-kept removes every kept worktree, and the run goes on', async () => {
    await update({ keepFailed: true })
    verifyOk = true
    const out = await update({ discardKept: true })
    expect(out.discarded).toEqual([kept()])
    expect(out.results.map((r) => r.status)).toEqual(['updated'])
    expect(existsSync(kept())).toBe(false)
    expect(renderUpdateText(out)).toContain(`discarded kept worktree ${kept()}`)
  })

  test('--discard-kept without --apply is refused', async () => {
    await expect(update({ discardKept: true, apply: false })).rejects.toThrow('needs --apply')
  })

  test('the run continues in a fresh worktree after one PR is kept', async () => {
    fx.worker.git.checkout('main', { branch: 'second' })
    fx.worker.commit('second work', { 'second.txt': 's\n' })
    fx.worker.git.push('origin', 'second')
    fx.worker.git.checkout('main')
    fx.worker.commit('main moves', { 'later.txt': 'l\n' })
    fx.worker.git.push('origin', 'main')
    let calls = 0
    const out = await runUpdate(
      { ...ARGS, keepFailed: true },
      {
        projectRoot: fx.worker.dir,
        dryRun: false,
        git,
        gh: {
          run: () => {
            fx.worker.git.fetch('origin')
            const prs = ['topic', 'second'].map((head, i) => ({
              number: i + 1,
              state: 'OPEN',
              title: head,
              url: `https://github.com/o/r/pull/${i + 1}`,
              baseRefName: 'main',
              headRefName: head,
              headRefOid: fx.worker.git.resolveRef(`origin/${head}`),
            }))
            return { exitCode: 0, stdout: JSON.stringify(prs), stderr: '' }
          },
        },
        cfg: {
          ...prUpdateConfigSchema.parse({}),
          verify: 'check',
          max_failed_attempts: 0,
        } as PrUpdateConfig,
        ports: {
          locate: () => fx.worker.dir,
          // Only the first PR's verify fails.
          runVerb: () => (calls++ === 0 ? { exitCode: 1, stdout: '', stderr: 'no\n' } : ok),
          resolveVerifyVerbs: async () => ['check'],
        },
      },
    )
    expect(out.results.map((r) => r.status)).toEqual(['failed', 'updated'])
    expect(out.results[0]!.keptWorktree).toBe(kept())
    expect(out.results[1]!.keptWorktree).toBeUndefined()
  })
})

const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' }
