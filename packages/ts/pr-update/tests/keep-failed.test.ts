/**
 * `--keep-failed`: a failed PR's worktree is kept for a person, a later run leaves it alone until
 * the PR moves, and `--retry-failed` and `--discard-kept` remove it. Real git, a fake `gh`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { IDENTITY, makeBareAndWorker, makeGitFixture } from '@osdlc/typed-git/testing'

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
    expect(worktrees()).toContain(realpathSync.native(kept()))
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
    const out = await update({ apply: false }, { keep_failed: true })
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
    expect(worktrees()).not.toContain(
      join(realpathSync.native(fx.worker.dir), '.pr-update', 'failed', 'o-r-1'),
    )
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

  test('a moved base does not discard a kept worktree a person has edited', async () => {
    await update({ keepFailed: true })
    writeFileSync(join(kept(), 'wip.txt'), 'unfinished\n')
    fx.worker.commit('main moves again', { 'more.txt': 'x\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.fetch('origin')
    const out = await update({ keepFailed: true })
    expect(out.results).toEqual([])
    expect(out.skipped[0]!.reason).toContain('has local changes')
    expect(existsSync(join(kept(), 'wip.txt'))).toBe(true)
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

  describe('a kept tree a person moved off its kept branch (review round 1)', () => {
    const topicOnOrigin = () => fx.bare.git.resolveRef('topic')

    test('one on a branch of their own, with a new file: the PR is not pushed and the tree stays', async () => {
      await update({ keepFailed: true })
      fx.worker.git.at(kept()).rawChecked(['checkout', '-q', '-b', 'my-fix'])
      writeFileSync(join(kept(), 'fix.txt'), 'mine\n')
      fx.worker.commit('main moves again', { 'more.txt': 'x\n' })
      fx.worker.git.push('origin', 'main')
      fx.worker.git.fetch('origin')
      verifyOk = true
      const before = topicOnOrigin()
      const out = await update({ keepFailed: true })
      expect(out.results).toEqual([])
      expect(out.skipped[0]!.reason).toBe(
        `kept worktree ${kept()} has local changes; push them or pass --discard-kept`,
      )
      expect(out.keptRefused).toBeUndefined()
      expect(topicOnOrigin()).toBe(before)
      expect(existsSync(join(kept(), 'fix.txt'))).toBe(true)
    })

    test('one on a detached HEAD, unchanged: the PR is still held back', async () => {
      await update({ keepFailed: true })
      fx.worker.git.at(kept()).rawChecked(['checkout', '-q', '--detach'])
      verifyOk = true
      const before = topicOnOrigin()
      const out = await update({ keepFailed: true })
      expect(out.results).toEqual([])
      expect(out.skipped[0]!.reason).toBe(`failed worktree kept at ${kept()}`)
      expect(out.keptRefused).toBeUndefined()
      expect(topicOnOrigin()).toBe(before)
      expect(existsSync(kept())).toBe(true)
    })

    test('--discard-kept leaves it, with a note naming the branch', async () => {
      await update({ keepFailed: true })
      fx.worker.git.at(kept()).rawChecked(['checkout', '-q', '-b', 'my-fix'])
      verifyOk = true
      const out = await update({ discardKept: true })
      expect(out.discarded ?? []).toEqual([])
      expect(out.keptLeft).toEqual([
        {
          path: kept(),
          reason: `${kept()} is on my-fix, not pr-update/failed-o-r-1, so a person moved it`,
        },
      ])
      expect(renderUpdateText(out)).toContain(`! kept worktree ${kept()} left: `)
      expect(out.results).toEqual([])
      expect(existsSync(kept())).toBe(true)
      expect(fx.worker.git.resolveRef('my-fix')).not.toBeNull()
    })
  })

  test('--keep-failed without --apply is refused', async () => {
    await expect(update({ keepFailed: true, apply: false })).rejects.toThrow('needs --apply')
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

describe('a kept record the checkout supplies', () => {
  // `.pr-update/failed/` is inside the working tree, so a repository can commit a record there.
  let fx: ReturnType<typeof makeBareAndWorker>
  let victim: ReturnType<typeof makeGitFixture>

  const real = spawnRunner('git')
  const git: CommandRunner = {
    run: (argv, opts) => real.run(argv, { ...opts, env: { ...IDENTITY, ...opts.env } }),
  }
  const gh: CommandRunner = {
    run: () => {
      fx.worker.git.fetch('origin')
      const prs = [
        {
          number: 1,
          state: 'OPEN',
          title: 'topic',
          url: 'https://github.com/o/r/pull/1',
          baseRefName: 'main',
          headRefName: 'topic',
          headRefOid: fx.worker.git.resolveRef('origin/topic'),
        },
      ]
      return { exitCode: 0, stdout: JSON.stringify(prs), stderr: '' }
    },
  }
  const update = (patch: Partial<UpdateArgs> = {}) =>
    runUpdate(
      { ...ARGS, ...patch },
      {
        projectRoot: fx.worker.dir,
        dryRun: false,
        git,
        gh,
        cfg: { ...prUpdateConfigSchema.parse({}), verify: 'none' } as PrUpdateConfig,
        ports: {
          locate: () => fx.worker.dir,
          runVerb: () => ok,
          resolveVerifyVerbs: async () => [],
        },
      },
    )
  const keptDir = () => join(fx.worker.dir, '.pr-update', 'failed', 'o-r-1')

  /** Commit a record for #1, with `headOid: null` so the run reads the PR as moved. */
  function plant(record: Record<string, unknown>): void {
    fx.worker.commit('plant a kept record', {
      '.pr-update/failed/o-r-1.json': `${JSON.stringify({
        repo: 'o/r',
        number: 1,
        head: 'topic',
        base: 'main',
        headOid: null,
        baseOid: null,
        path: keptDir(),
        ...record,
      })}\n`,
      '.pr-update/failed/o-r-1/x.txt': 'x\n',
    })
  }

  beforeEach(() => {
    fx = makeBareAndWorker({ initialBranch: 'main' })
    fx.worker.commit('initial', { 'shared.txt': 'base\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.checkout('main', { branch: 'topic' })
    fx.worker.commit('topic work', { 'topic.txt': 'topic\n' })
    fx.worker.git.push('origin', 'topic')
    fx.worker.git.checkout('main')
    fx.worker.commit('main moves', { 'main.txt': 'main\n' })
    fx.worker.git.push('origin', 'main')
    victim = makeGitFixture({ identity: IDENTITY })
    victim.commit('initial', { 'a.txt': 'a\n' })
    victim.git.checkout('main', { branch: 'precious' })
    victim.commit('unmerged work', { 'b.txt': 'b\n' })
    victim.git.checkout('main')
  })
  afterEach(() => {
    fx.cleanup()
    victim.cleanup()
  })

  const victimGitDir = () => realpathSync.native(join(victim.dir, '.git'))

  test.each([
    ['a plain --apply', {}],
    ['--discard-kept', { discardKept: true }],
  ])(
    "one naming another repository's git directory and branch deletes nothing there (%s)",
    async (_, patch) => {
      plant({ branch: 'precious', gitDir: victimGitDir() })
      const precious = victim.git.resolveRef('precious')
      const out = await update(patch)
      expect(victim.git.resolveRef('precious')).toBe(precious)
      expect(out.discarded ?? []).toEqual([])
      expect(existsSync(join(keptDir(), 'x.txt'))).toBe(true)
      expect(existsSync(`${keptDir()}.json`)).toBe(true)
      expect(out.keptRefused?.map((r) => r.record)).toEqual([`${keptDir()}.json`])
      expect(renderUpdateText(out)).toContain(`kept record ${keptDir()}.json left alone`)
      // The PR is still updated: a committed file cannot hold it back.
      expect(out.results.map((r) => r.status)).toEqual(['updated'])
    },
  )

  test('one with a relative path and the kept branch name is refused too', async () => {
    plant({
      branch: 'pr-update/failed-o-r-1',
      gitDir: victimGitDir(),
      path: join('.pr-update', 'failed', 'o-r-1'),
    })
    victim.git.rawChecked(['branch', 'pr-update/failed-o-r-1'])
    // The CLI runs in the checkout, where a relative path names its kept folder.
    const cwd = process.cwd()
    process.chdir(fx.worker.dir)
    const out = await update({ discardKept: true }).finally(() => process.chdir(cwd))
    expect(victim.git.resolveRef('pr-update/failed-o-r-1')).not.toBeNull()
    expect(out.discarded ?? []).toEqual([])
  })

  test.skipIf(process.platform === 'win32')(
    'one whose kept path is a symbolic link to a worktree of the checkout is refused (review round 1)',
    async () => {
      // The person's own worktree, on a branch of theirs.
      const theirs = join(fx.worker.dir, '..', `${basename(fx.worker.dir)}-theirs`)
      fx.worker.git.rawChecked(['worktree', 'add', '-q', '-b', 'mine', theirs, 'main'])
      writeFileSync(join(theirs, 'wip.txt'), 'wip\n')
      fx.worker.commit('plant a kept record', {
        '.pr-update/failed/o-r-1.json': `${JSON.stringify({
          repo: 'o/r',
          number: 1,
          head: 'topic',
          base: 'main',
          headOid: null,
          baseOid: null,
          path: keptDir(),
          branch: 'pr-update/failed-o-r-1',
        })}\n`,
      })
      symlinkSync(theirs, keptDir(), 'dir')
      try {
        const out = await update({ discardKept: true })
        expect(out.keptRefused).toEqual([
          { record: `${keptDir()}.json`, reason: `its path ${keptDir()} is a symbolic link` },
        ])
        expect(out.keptLeft).toBeUndefined()
        expect(out.results.map((r) => r.status)).toEqual(['updated'])
        expect(existsSync(join(theirs, 'wip.txt'))).toBe(true)
        expect(fx.worker.git.resolveRef('mine')).not.toBeNull()
      } finally {
        rmSync(theirs, { recursive: true, force: true })
      }
    },
  )

  test.each([
    ['a plain --apply', {}],
    ['--discard-kept', { discardKept: true }],
  ])(
    'one whose folder is not a worktree of the checkout on its branch is left alone (%s)',
    async (_, patch) => {
      plant({ branch: 'pr-update/failed-o-r-1' })
      fx.worker.git.rawChecked(['branch', 'pr-update/failed-o-r-1'])
      const out = await update(patch)
      expect(existsSync(join(keptDir(), 'x.txt'))).toBe(true)
      expect(existsSync(`${keptDir()}.json`)).toBe(true)
      expect(fx.worker.git.resolveRef('pr-update/failed-o-r-1')).not.toBeNull()
      expect(out.discarded ?? []).toEqual([])
      expect(out.keptRefused?.[0]?.reason).toContain('not a worktree')
    },
  )
})

const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' }
