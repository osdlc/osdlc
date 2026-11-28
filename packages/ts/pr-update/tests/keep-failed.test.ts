/**
 * `--keep-failed`: a failed PR's worktree is kept for a person, a later run leaves it alone until
 * the PR moves, and `--retry-failed` and `--discard-kept` remove it. Real git, a fake `gh`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { IDENTITY, makeBareAndWorker, makeGitFixture } from '@osdlc/typed-git/testing'

import { prUpdateConfigSchema, type PrUpdateConfig } from '../src/config.ts'
import type { Ports } from '../src/ports.ts'
import { renderUpdateText, runUpdate, type UpdateArgs } from '../src/update.ts'
import { homeUnder } from './support.ts'

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
  let home: string
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
      targetHome: homeUnder(home),
    }
    const out = await runUpdate(
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
    // Read while its record is there.
    kept()
    return out
  }

  /** #1's record. */
  const record = () => join(home, 'kept', 'github.com', 'o', 'r', '1.json')
  let keptAt: string | undefined
  /** #1's first kept tree, by its record; a path where nothing is while none was kept. */
  const kept = (): string => {
    if (keptAt === undefined && existsSync(record())) {
      keptAt = JSON.parse(readFileSync(record(), 'utf8')).path as string
    }
    return keptAt ?? join(home, 'nothing-kept')
  }
  const worktrees = () => fx.worker.git.worktrees().map((w) => w.path)

  beforeEach(() => {
    verifyOk = false
    keptAt = undefined
    home = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-home-')))
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
  afterEach(() => {
    fx.cleanup()
    rmSync(home, { recursive: true, force: true })
  })

  test('a failed verify keeps the tree where targetHome puts it, nothing in the checkout (one layout)', async () => {
    const out = await update({ keepFailed: true })
    expect(out.results[0]!.keptWorktree).toBe(kept())
    expect(dirname(kept())).toBe(join(home, 'worktrees', 'github.com', 'o', 'r'))
    expect(existsSync(join(fx.worker.dir, '.pr-update'))).toBe(false)
  })

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
    expect(worktrees()).not.toContain(kept())
    expect(fx.worker.git.resolveRef('pr-update/failed-o-r-1')).toBeNull()
  })

  test('a PR whose base moved is attempted again, and its old worktree goes', async () => {
    await update({ keepFailed: true })
    fx.worker.commit('main moves again', { 'more.txt': 'x\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.fetch('origin')
    const old = kept()
    const out = await update({ keepFailed: true })
    expect(out.results.map((r) => r.status)).toEqual(['failed'])
    expect(out.discarded).toEqual([old])
    expect(existsSync(old)).toBe(false)
    const now = JSON.parse(readFileSync(record(), 'utf8')).path as string
    expect(out.results[0]!.keptWorktree).toBe(now)
    expect(existsSync(now)).toBe(true)
  })

  test('a moved base discards the kept worktree, whatever is in it (ownership contract)', async () => {
    await update({ keepFailed: true })
    writeFileSync(join(kept(), 'wip.txt'), 'unfinished\n')
    fx.worker.commit('main moves again', { 'more.txt': 'x\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.fetch('origin')
    const out = await update({ keepFailed: true })
    expect(out.results.map((r) => r.status)).toEqual(['failed'])
    expect(out.discarded).toEqual([kept()])
    expect(existsSync(join(kept(), 'wip.txt'))).toBe(false)
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

  describe('what is in a kept tree never keeps it (ownership contract)', () => {
    const topicOnOrigin = () => fx.bare.git.resolveRef('topic')

    test('one switched to another branch, with a new file, goes when the PR moves; that branch stays', async () => {
      await update({ keepFailed: true })
      fx.worker.git.at(kept()).rawChecked(['checkout', '-q', '-b', 'my-fix'])
      writeFileSync(join(kept(), 'fix.txt'), 'x\n')
      fx.worker.commit('main moves again', { 'more.txt': 'x\n' })
      fx.worker.git.push('origin', 'main')
      fx.worker.git.fetch('origin')
      verifyOk = true
      const out = await update({ keepFailed: true })
      expect(out.results.map((r) => r.status)).toEqual(['updated'])
      expect(out.discarded).toEqual([kept()])
      expect(existsSync(kept())).toBe(false)
      // A branch of the project root's that is not pr-update's is never deleted.
      expect(fx.worker.git.resolveRef('my-fix')).not.toBeNull()
      expect(fx.worker.git.resolveRef('pr-update/failed-o-r-1')).toBeNull()
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

    test('--discard-kept removes one switched to another branch, and leaves that branch', async () => {
      await update({ keepFailed: true })
      fx.worker.git.at(kept()).rawChecked(['checkout', '-q', '-b', 'my-fix'])
      verifyOk = true
      const out = await update({ discardKept: true })
      expect(out.discarded).toEqual([kept()])
      expect(out.keptLeft).toBeUndefined()
      expect(out.results.map((r) => r.status)).toEqual(['updated'])
      expect(existsSync(kept())).toBe(false)
      expect(fx.worker.git.resolveRef('my-fix')).not.toBeNull()
    })

    test('one git will not remove (locked) is listed in keptLeft, and stays', async () => {
      await update({ keepFailed: true })
      fx.worker.git.rawChecked(['worktree', 'lock', kept()])
      const out = await update({ discardKept: true })
      expect(out.discarded ?? []).toEqual([])
      expect(out.keptLeft).toEqual([
        {
          path: kept(),
          reason: expect.stringContaining(`${kept()} stays: git would not remove it`),
        },
      ])
      expect(renderUpdateText(out)).toContain(`! kept worktree ${kept()} left: `)
      expect(existsSync(kept())).toBe(true)
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
          targetHome: homeUnder(home),
        },
      },
    )
    expect(out.results.map((r) => r.status)).toEqual(['failed', 'updated'])
    expect(out.results[0]!.keptWorktree).toBe(kept())
    expect(out.results[1]!.keptWorktree).toBeUndefined()
  })

  test('a run worktree git will not remove at the end of the run is reported, and the PR keeps its outcome (review round 2)', async () => {
    let at = ''
    const out = await runUpdate(
      { ...ARGS },
      {
        projectRoot: fx.worker.dir,
        dryRun: false,
        git,
        gh,
        cfg: {
          ...prUpdateConfigSchema.parse({}),
          verify: 'check',
          max_failed_attempts: 0,
        } as PrUpdateConfig,
        ports: {
          locate: () => fx.worker.dir,
          // Someone locks the run worktree while verify runs.
          runVerb: (_verb, cwd) => {
            at = cwd
            real.run(['worktree', 'lock', cwd], { cwd: fx.worker.dir })
            return { exitCode: 0, stdout: '', stderr: '' }
          },
          resolveVerifyVerbs: async () => ['check'],
          targetHome: homeUnder(home),
        },
      },
    )
    expect(out.results.map((r) => r.status)).toEqual(['updated'])
    expect(out.results[0]!.worktreeLeft).toContain(`${at} stays: git would not remove it`)
    expect(renderUpdateText(out)).toContain(
      `    worktree left: ${at} stays: git would not remove it`,
    )
    expect(existsSync(at)).toBe(true)
  })

  test('when the next run worktree cannot be added after a keep, the kept tree and its record stay, and the run stops (review round 2)', async () => {
    fx.worker.git.checkout('main', { branch: 'second' })
    fx.worker.commit('second work', { 'second.txt': 's\n' })
    fx.worker.git.push('origin', 'second')
    fx.worker.git.checkout('main')
    const real2 = spawnRunner('git')
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
          // The first PR's verify fails, and takes away the ref the next worktree starts from.
          runVerb: () => {
            real2.run(['update-ref', '-d', 'refs/remotes/origin/main'], { cwd: fx.worker.dir })
            return { exitCode: 1, stdout: '', stderr: 'no\n' }
          },
          resolveVerifyVerbs: async () => ['check'],
          targetHome: homeUnder(home),
        },
      },
    )
    expect(out.results.map((r) => r.number)).toEqual([1])
    const [first] = out.results
    expect(first!.status).toBe('failed')
    expect(first!.keptWorktree).toBe(kept())
    expect(first!.keepError).toContain('the next run worktree could not be added')
    expect(existsSync(kept())).toBe(true)
    expect(existsSync(record())).toBe(true)
    expect(fx.worker.git.resolveRef('pr-update/failed-o-r-1')).not.toBeNull()
    expect(worktrees()).toContain(realpathSync.native(kept()))
    expect(renderUpdateText(out)).toContain('the next run worktree could not be added')
  })
})

describe('a forged kept record', () => {
  // A record is JSON on disk, and its path, branch and git directory say what a discard deletes.
  let fx: ReturnType<typeof makeBareAndWorker>
  let home: string
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
          targetHome: homeUnder(home),
        },
      },
    )
  /** The folder a forged record names: a run worktree's place, and #1's record. */
  const keptDir = () => join(home, 'worktrees', 'github.com', 'o', 'r', '123.456')
  const recordPath = () => join(home, 'kept', 'github.com', 'o', 'r', '1.json')

  /** Write #1's record, with `headOid: null` so the run reads the PR as moved, and a folder. */
  function plant(record: Record<string, unknown>, folder = true): void {
    mkdirSync(join(recordPath(), '..'), { recursive: true })
    mkdirSync(join(keptDir(), '..'), { recursive: true })
    writeFileSync(
      recordPath(),
      `${JSON.stringify({
        repo: 'o/r',
        number: 1,
        head: 'topic',
        base: 'main',
        headOid: null,
        baseOid: null,
        path: keptDir(),
        ...record,
      })}\n`,
    )
    if (folder) {
      mkdirSync(keptDir())
      writeFileSync(join(keptDir(), 'x.txt'), 'x\n')
    }
  }

  beforeEach(() => {
    home = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-home-')))
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
    rmSync(home, { recursive: true, force: true })
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
      expect(existsSync(recordPath())).toBe(true)
      expect(out.keptRefused?.map((r) => r.record)).toEqual([recordPath()])
      expect(renderUpdateText(out)).toContain(`kept record ${recordPath()} left alone`)
      // The PR is still updated: a forged record cannot hold it back.
      expect(out.results.map((r) => r.status)).toEqual(['updated'])
    },
  )

  test('one with a relative path and the kept branch name is refused too', async () => {
    plant({
      branch: 'pr-update/failed-o-r-1',
      gitDir: victimGitDir(),
      path: join('r', '123.456'),
    })
    victim.git.rawChecked(['branch', 'pr-update/failed-o-r-1'])
    // Run where the relative path names the kept folder.
    const cwd = process.cwd()
    process.chdir(join(keptDir(), '..', '..'))
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
      plant({ branch: 'pr-update/failed-o-r-1' }, false)
      symlinkSync(theirs, keptDir(), 'dir')
      try {
        const out = await update({ discardKept: true })
        expect(out.keptRefused).toEqual([
          { record: recordPath(), reason: `its path ${keptDir()} is a symbolic link` },
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
      expect(existsSync(recordPath())).toBe(true)
      expect(fx.worker.git.resolveRef('pr-update/failed-o-r-1')).not.toBeNull()
      expect(out.discarded ?? []).toEqual([])
      expect(out.keptRefused?.[0]?.reason).toContain('not a worktree')
    },
  )
})

const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' }
