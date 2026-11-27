/**
 * The executor, against real git.
 *
 * Every assertion here is about what git actually does, so these tests use a
 * real repository, not a fake `CommandRunner`. The cases that matter are the
 * ones a fake runner cannot reproduce: what a conflicted rebase leaves in the
 * index, whether `--force-with-lease` pinned to an old sha is refused, whether
 * the temporary worktree is really removed.
 *
 * The origin is a bare repository. A non-bare one refuses a push to the branch
 * it has checked out. That would make `main`, the base every fixture moves
 * forward, the one branch the tests could not move.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import type { CommandResult } from '@osdlc/command-seam'
import { forwarded } from './support-signal.ts'

vi.mock('@osdlc/command-seam', async (original) =>
  (await import('./support-signal.ts')).mockForwarding(original),
)
import type { Generator, PushPreview, Repair, RepairRequest, RepairResult } from '../src/ports.ts'
import { toResult } from '../src/update.ts'
import { NothingDetectedError } from '../src/detect.ts'
import { targetGitEnv } from '../src/update/execute.ts'
import { ownedUnder } from '../src/update/registrations.ts'
import {
  WORK_BRANCH,
  scratchBranch,
  describeOutcome,
  isStalePush,
  tally,
  updateAll,
  updateOne,
  type RunVerb,
  type UpdateOutcome,
  type UpdateResult,
  type UpdateSettings,
  type UpdateTarget,
} from '../src/update/execute.ts'

const SETTINGS: UpdateSettings = {
  remote: 'origin',
  resolvers: [],
  lockfileInstall: null,
  verifyVerbs: [],
}

function settings(patch: Partial<UpdateSettings> = {}): UpdateSettings {
  return { ...SETTINGS, ...patch }
}

function target(patch: Partial<UpdateTarget> = {}): UpdateTarget {
  return {
    repo: 'o/r',
    number: 1,
    head: 'topic',
    base: 'main',
    headOid: null,
    baseOid: null,
    strategy: 'merge',
    ...patch,
  }
}

const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' }
const nope: CommandResult = { exitCode: 1, stdout: '', stderr: 'boom\n' }

/** A verb runner that records what it was asked to run. */
function recorder(result: CommandResult = ok): RunVerb & { calls: string[] } {
  const calls: string[] = []
  const fn = (verb: string): CommandResult => {
    calls.push(verb)
    return result
  }
  return Object.assign(fn, { calls })
}

describe('the executor against real git', () => {
  let fx: ReturnType<typeof makeBareAndWorker>
  let wtRoot: string

  beforeEach(() => {
    fx = makeBareAndWorker({ initialBranch: 'main' })
    // A bare repository starts empty. `main` has to exist before a branch can start from it.
    fx.worker.commit('initial', { 'README.md': 'fixture\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.fetch('origin')
    wtRoot = join(fx.worker.dir, '.pr-update', 'test')
  })
  afterEach(() => fx.cleanup())

  /**
   * A PR branch off `main`, plus `n` commits landed on `main` afterwards so
   * the branch is really behind. Returns the branch's pushed head sha.
   */
  function makeBehindPr(
    branch: string,
    files: Record<string, string>,
    mainFiles: Record<string, string>,
  ): string {
    const { git } = fx.worker
    git.checkout('main', { branch })
    fx.worker.commit(`${branch} work`, files)
    git.push('origin', branch)
    const oid = git.resolveRef('HEAD')!

    git.checkout('main')
    fx.worker.commit('main moves', mainFiles)
    git.push('origin', 'main')
    git.fetch('origin')
    return oid
  }

  /** The worktree the executor would be handed, created and torn down by hand. */
  async function inWorktree<T>(fn: (git: Git) => T | Promise<T>): Promise<T> {
    const { git } = fx.worker
    git.worktreeAdd(wtRoot, { detach: true, startPoint: 'origin/main' })
    try {
      return await fn(git.at(wtRoot))
    } finally {
      git.try.worktreeRemove(wtRoot, { force: true })
      git.try.worktreePrune()
      git.try.deleteBranch(scratchBranch(wtRoot), { force: true })
    }
  }

  test('a branch already current is reported without doing anything', async () => {
    const { git } = fx.worker
    git.checkout('main', { branch: 'current' })
    fx.worker.commit('work', { 'a.txt': 'a\n' })
    git.push('origin', 'current')
    git.fetch('origin')

    const run = recorder()
    const out = await inWorktree((wt) =>
      updateOne(wt, target({ head: 'current' }), SETTINGS, run, {
        apply: true,
        worktree: wtRoot,
      }),
    )
    expect(out.status).toBe('up-to-date')
    // No integration, no rebuild, no push: the common answer must cost nothing.
    expect(run.calls).toEqual([])
  })

  test('a clean merge is pushed, and the PR branch really moves', async () => {
    makeBehindPr('clean-m', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker
    const before = git.resolveRef('origin/clean-m')

    const out = await inWorktree((wt) =>
      updateOne(wt, target({ head: 'clean-m' }), SETTINGS, recorder(), {
        apply: true,
        worktree: wtRoot,
      }),
    )
    expect(out.status).toBe('updated')

    git.fetch('origin')
    const after = git.resolveRef('origin/clean-m')
    expect(after).not.toBe(before)
    // A merge never rewrites: the old tip must still be reachable.
    expect(git.isAncestor(before!, after!)).toBe(true)
  })

  test('the merge commit names the PR branches, not the temporary local branch', async () => {
    makeBehindPr('msg-m', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker
    const out = await inWorktree((wt) =>
      updateOne(wt, target({ head: 'msg-m' }), SETTINGS, recorder(), {
        apply: true,
        worktree: wtRoot,
      }),
    )
    expect(out.status).toBe('updated')
    git.fetch('origin')
    const baseSha = git.resolveRef('origin/main')
    const msg = execFileSync('git', ['log', '-1', '--format=%B', 'origin/msg-m'], {
      cwd: fx.worker.dir,
      encoding: 'utf8',
    })
    expect(msg.split('\n')[0]).toBe('Merge main into msg-m')
    expect(msg).toContain(`Base: main at ${baseSha}`)
    expect(msg).not.toContain('pr-update/')
  })

  describe('a child of a parent rebased in an earlier run', () => {
    /** `parent` off main, `child` off `parent`, then `parent` rewritten with a commit that edits the same file. */
    function makeStack(): string {
      const { git } = fx.worker
      git.checkout('main', { branch: 'parent' })
      fx.worker.commit('parent work', { 'p.txt': 'one\n' })
      git.push('origin', 'parent')
      git.checkout('parent', { branch: 'child' })
      fx.worker.commit('child work', { 'c.txt': 'c\n' })
      git.push('origin', 'child')
      const childOid = git.resolveRef('HEAD')!
      git.checkout('parent')
      git.try.resetHard('main')
      fx.worker.commit('parent work, resolved', { 'p.txt': 'two\n' })
      git.push('origin', 'parent', { forceWithLease: true })
      git.fetch('origin')
      return childOid
    }

    test('git finds the old parent head in the reflog, so the old commits are not replayed', async () => {
      const oid = makeStack()
      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'child', base: 'parent', headOid: oid, strategy: 'rebase' }),
          SETTINGS,
          recorder(),
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out.status).toBe('updated')
      const { git } = fx.worker
      git.fetch('origin')
      const own = execFileSync('git', ['log', '--format=%s', 'origin/parent..origin/child'], {
        cwd: fx.worker.dir,
        encoding: 'utf8',
      })
      expect(own.trim()).toBe('child work')
    })
  })

  test('a clean rebase rewrites, and the old tip is left behind', async () => {
    const oid = makeBehindPr('clean-r', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker

    const out = await inWorktree((wt) =>
      updateOne(
        wt,
        target({ head: 'clean-r', headOid: oid, strategy: 'rebase' }),
        SETTINGS,
        recorder(),
        {
          apply: true,
          worktree: wtRoot,
        },
      ),
    )
    expect(out.status).toBe('updated')

    git.fetch('origin')
    const after = git.resolveRef('origin/clean-r')!
    expect(after).not.toBe(oid)
    // The whole point of a rebase: the branch now sits on top of main.
    expect(git.isAncestor(git.resolveRef('origin/main')!, after)).toBe(true)
    expect(git.isAncestor(oid, after)).toBe(false)
  })

  test('a dry run predicts the update and pushes nothing', async () => {
    makeBehindPr('dry', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker
    const before = git.resolveRef('origin/dry')

    const out = await inWorktree((wt) =>
      updateOne(wt, target({ head: 'dry' }), SETTINGS, recorder(), {
        apply: false,
        worktree: wtRoot,
      }),
    )
    expect(out).toEqual({
      status: 'updated',
      resolved: [],
      pushed: false,
      builtOid: expect.any(String),
    })

    git.fetch('origin')
    expect(git.resolveRef('origin/dry')).toBe(before!)
  })

  test('a conflict nothing claims is reported, not guessed at', async () => {
    // Both sides edit the same line of the same source file.
    makeBehindPr('conf', { 'shared.ts': 'branch\n' }, { 'shared.ts': 'main\n' })
    const { git } = fx.worker
    const before = git.resolveRef('origin/conf')

    const out = await inWorktree((wt) =>
      updateOne(wt, target({ head: 'conf' }), SETTINGS, recorder(), {
        apply: true,
        worktree: wtRoot,
      }),
    )
    expect(out.status).toBe('conflict')
    if (out.status !== 'conflict') throw new Error('unreachable')
    expect(out.needsHuman).toEqual([{ path: 'shared.ts', why: 'no resolver claims it' }])

    git.fetch('origin')
    expect(git.resolveRef('origin/conf')).toBe(before!)
  })

  test('a configured resolver rebuilds the artifact and the merge lands', async () => {
    makeBehindPr('gen', { 'build/out.txt': 'branch\n' }, { 'build/out.txt': 'main\n' })

    // Stands in for a real generator. It rewrites the whole artifact, which
    // is why its output is the resolution.
    const regen: RunVerb = (verb, cwd) => {
      if (verb === 'regen') writeFileSync(join(cwd, 'build', 'out.txt'), 'regenerated\n')
      return ok
    }
    const cfg = settings({ resolvers: [{ paths: ['build/**'], run: 'regen' }] })

    const out = await inWorktree((wt) =>
      updateOne(wt, target({ head: 'gen' }), cfg, regen, { apply: true, worktree: wtRoot }),
    )
    expect(out.status).toBe('updated')

    const { git } = fx.worker
    git.fetch('origin')
    const content = git.showAtRev('origin/gen', 'build/out.txt')
    expect(content).toBe('regenerated\n')
  })

  test('a resolver that fails leaves the branch untouched', async () => {
    makeBehindPr('badgen', { 'build/out.txt': 'branch\n' }, { 'build/out.txt': 'main\n' })
    const { git } = fx.worker
    const before = git.resolveRef('origin/badgen')
    const cfg = settings({ resolvers: [{ paths: ['build/**'], run: 'regen' }] })

    const out = await inWorktree((wt) =>
      updateOne(wt, target({ head: 'badgen' }), cfg, recorder(nope), {
        apply: true,
        worktree: wtRoot,
      }),
    )
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') throw new Error('unreachable')
    expect(out.reason).toContain('regen')

    git.fetch('origin')
    expect(git.resolveRef('origin/badgen')).toBe(before!)
  })

  test('a failing verify verb blocks the push', async () => {
    makeBehindPr('verify', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker
    const before = git.resolveRef('origin/verify')

    const out = await inWorktree((wt) =>
      updateOne(
        wt,
        target({ head: 'verify' }),
        settings({ verifyVerbs: ['check'] }),
        recorder(nope),
        {
          apply: true,
          worktree: wtRoot,
        },
      ),
    )
    expect(out.status).toBe('failed')

    git.fetch('origin')
    expect(git.resolveRef('origin/verify')).toBe(before!)
  })

  test('verifyVerbs resolves in the PR worktree, and its verbs gate the push', async () => {
    makeBehindPr('late', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker
    const before = git.resolveRef('origin/late')
    const seen: string[] = []

    const out = await inWorktree((wt) =>
      updateOne(
        wt,
        target({ head: 'late', number: 7 }),
        settings({
          verifyVerbs: async (worktree, pr) => {
            seen.push(`${worktree}#${pr}`)
            return ['check']
          },
        }),
        recorder(nope),
        { apply: true, worktree: wtRoot },
      ),
    )
    expect(out.status).toBe('failed')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/#7$/)
    git.fetch('origin')
    expect(git.resolveRef('origin/late')).toBe(before!)
  })

  test('a verifyVerbs that throws fails that PR with its message and pushes nothing', async () => {
    makeBehindPr('nodetect', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker
    const before = git.resolveRef('origin/nodetect')

    const out = await inWorktree((wt) =>
      updateOne(
        wt,
        target({ head: 'nodetect' }),
        settings({
          verifyVerbs: async () => {
            throw new Error('verify: detect found no test command')
          },
        }),
        recorder(nope),
        { apply: true, worktree: wtRoot },
      ),
    )
    if (out.status !== 'failed') throw new Error('unreachable')
    expect(out.reason).toContain('found no test command')
    git.fetch('origin')
    expect(git.resolveRef('origin/nodetect')).toBe(before!)
  })

  test('a verifyVerbs that finds nothing to detect fails that PR without recording an attempt', async () => {
    makeBehindPr('nothing', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker
    const before = git.resolveRef('origin/nothing')

    const out = await inWorktree((wt) =>
      updateOne(
        wt,
        target({ head: 'nothing' }),
        settings({
          verifyVerbs: async () => {
            throw new NothingDetectedError('verify: detect found no test command')
          },
        }),
        recorder(nope),
        { apply: true, worktree: wtRoot },
      ),
    )
    expect(out).toMatchObject({ status: 'failed', unrecorded: true })
    git.fetch('origin')
    expect(git.resolveRef('origin/nothing')).toBe(before!)
  })

  test('a rebase with no known head sha is refused rather than force-pushed blind', async () => {
    // Without a sha the lease has nothing to check. The executor does not
    // force-push on someone's behalf without one.
    makeBehindPr('nopin', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker
    const before = git.resolveRef('origin/nopin')

    const out = await inWorktree((wt) =>
      updateOne(
        wt,
        target({ head: 'nopin', headOid: null, strategy: 'rebase' }),
        SETTINGS,
        recorder(),
        {
          apply: true,
          worktree: wtRoot,
        },
      ),
    )
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') throw new Error('unreachable')
    expect(out.reason).toContain('without a known head sha')

    git.fetch('origin')
    expect(git.resolveRef('origin/nopin')).toBe(before!)
  })

  test.each(['merge', 'rebase'] as const)(
    'a tracking ref that does not match the PR head is refused before a %s',
    async (strategy) => {
      makeBehindPr('lagging', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      const { git } = fx.worker
      const before = git.resolveRef('origin/lagging')
      // The code host says the PR moved on; the local tracking ref never saw it.
      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'lagging', headOid: 'f'.repeat(40), strategy }),
          SETTINGS,
          recorder(),
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out.status).toBe('failed')
      if (out.status !== 'failed') throw new Error('unreachable')
      expect(out.reason).toContain('does not match the PR head; re-run with a fetch')
      git.fetch('origin')
      expect(git.resolveRef('origin/lagging')).toBe(before!)
    },
  )

  test('a stale lease refuses the force-push rather than overwriting', async () => {
    const oid = makeBehindPr('raced', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker

    // Somebody pushes to the PR branch after the run observed `oid`.
    git.checkout('raced')
    fx.worker.commit('their work', { 'theirs.txt': 'theirs\n' })
    git.push('origin', 'raced')
    const theirs = git.resolveRef('HEAD')!
    git.checkout('main')
    git.fetch('origin')

    const out = await inWorktree((wt) =>
      updateOne(
        wt,
        target({ head: 'raced', headOid: oid, strategy: 'rebase' }),
        SETTINGS,
        recorder(),
        {
          apply: true,
          worktree: wtRoot,
        },
      ),
    )
    expect(out.status).toBe('failed')

    // Their commit survives. That is why the lease is pinned.
    git.fetch('origin')
    expect(git.resolveRef('origin/raced')).toBe(theirs)
  })

  test('a push the lease refuses is reported as a race to re-run', async () => {
    const oid = makeBehindPr('leased', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const { git } = fx.worker

    // Somebody pushes after the run observed `oid`, and this checkout's
    // tracking ref still says `oid`, so only the lease can catch it.
    git.checkout('leased')
    fx.worker.commit('their work', { 'theirs.txt': 'theirs\n' })
    git.push('origin', 'leased')
    const theirs = git.resolveRef('HEAD')!
    git.checkout('main')
    git.rawChecked(['update-ref', 'refs/remotes/origin/leased', oid])

    const out = await inWorktree((wt) =>
      updateOne(
        wt,
        target({ head: 'leased', headOid: oid, strategy: 'rebase' }),
        SETTINGS,
        recorder(),
        { apply: true, worktree: wtRoot },
      ),
    )
    expect(out.status === 'failed' ? out.reason : out.status).toMatch(
      /^push rejected — leased moved since the run started; re-run$/,
    )
    git.fetch('origin')
    expect(git.resolveRef('origin/leased')).toBe(theirs)
  })

  test('a push a remote hook declines is a failure to inspect, not a race', async () => {
    const oid = makeBehindPr('guarded', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
    const hook = join(fx.bare.dir, 'hooks', 'pre-receive')
    writeFileSync(hook, '#!/bin/sh\necho "no pushes today" >&2\nexit 1\n')
    chmodSync(hook, 0o755)

    const out = await inWorktree((wt) =>
      updateOne(
        wt,
        target({ head: 'guarded', headOid: oid, strategy: 'rebase' }),
        SETTINGS,
        recorder(),
        { apply: true, worktree: wtRoot },
      ),
    )
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') throw new Error('unreachable')
    expect(out.reason).toMatch(/^push guarded: rejected \(.*hook declined: no pushes today\)$/)
    expect(out.reason).not.toContain('re-run')
    fx.worker.git.fetch('origin')
    expect(fx.worker.git.resolveRef('origin/guarded')).toBe(oid)
  })

  describe('the fallback chain', () => {
    /** Two commits that both touch `build/out.txt`; `main` moves it too. Returns the pushed head. */
    function makeTwoStopPr(branch: string, secondFile: string): string {
      const { git } = fx.worker
      git.checkout('main', { branch })
      fx.worker.commit('one', { 'build/out.txt': 'branch one\n' })
      fx.worker.commit('two', { [secondFile]: 'branch two\n' })
      git.push('origin', branch)
      const oid = git.resolveRef('HEAD')!
      git.checkout('main')
      fx.worker.commit('main moves', { 'build/out.txt': 'main\n', 'shared.ts': 'main\n' })
      git.push('origin', 'main')
      git.fetch('origin')
      return oid
    }

    const resolvers = [{ paths: ['build/**'], run: 'regen' }]
    /** A rebuild verb that writes the generated file, as a real generator would. */
    function regen(): RunVerb & { calls: string[] } {
      const calls: string[] = []
      const fn = (verb: string, cwd: string): CommandResult => {
        calls.push(verb)
        writeFileSync(join(cwd, 'build/out.txt'), 'generated\n')
        return ok
      }
      return Object.assign(fn, { calls })
    }

    /** A repair that fixes `shared.ts` and records what state the worktree was in. */
    function inspectingRepair(): Repair & { calls: RepairRequest[]; midMerge: (string | null)[] } {
      const calls: RepairRequest[] = []
      const midMerge: (string | null)[] = []
      const fn = async (req: RepairRequest): Promise<RepairResult> => {
        calls.push(req)
        midMerge.push(fx.worker.git.at(req.worktree).resolveRef('MERGE_HEAD'))
        writeFileSync(join(req.worktree, 'shared.ts'), 'both\n')
        return { ok: true, note: 'fixed' }
      }
      return Object.assign(fn, { calls, midMerge })
    }

    test('AC-3: a claimed conflict at a later stop is resolved there and pushed as a rebase', async () => {
      const oid = makeTwoStopPr('twice', 'build/out.txt')
      const verb = regen()
      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'twice', headOid: oid, strategy: 'rebase' }),
          settings({ resolvers }),
          verb,
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out).toMatchObject({ status: 'updated', pushed: true })
      expect(out).not.toHaveProperty('strategyFallback')
      // Once per stop: both commits conflicted.
      expect(verb.calls).toEqual(['regen', 'regen'])
      const { git } = fx.worker
      git.fetch('origin')
      expect(git.showAtRev('origin/twice', 'build/out.txt')).toBe('generated\n')
      expect(git.isAncestor(git.resolveRef('origin/main')!, git.resolveRef('origin/twice')!)).toBe(
        true,
      )
      // A rebase leaves no merge commit.
      expect(git.logSubject('origin/twice')).not.toContain('Merge')
    })

    test('a rebase continues past a stop without firing the commit hooks', async () => {
      const oid = makeTwoStopPr('hooked', 'build/out.txt')
      // `rebase --continue` runs prepare-commit-msg (not commit-msg or pre-commit).
      const hook = join(fx.worker.dir, '.git', 'hooks', 'prepare-commit-msg')
      writeFileSync(hook, '#!/bin/sh\nexit 1\n')
      chmodSync(hook, 0o755)
      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'hooked', headOid: oid, strategy: 'rebase' }),
          settings({ resolvers }),
          regen(),
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out).toMatchObject({ status: 'updated', pushed: true })
    })

    test('AC-4: an unclaimed conflict at a later stop is retried as a merge, repaired once', async () => {
      const oid = makeTwoStopPr('fall', 'shared.ts')
      const repair = inspectingRepair()
      const { git } = fx.worker
      const results = await updateAll(
        git,
        [target({ head: 'fall', headOid: oid, strategy: 'rebase' })],
        settings({ resolvers, repair, repairOn: ['conflict'] }),
        regen(),
        { apply: true, worktreeRoot: wtRoot },
      )
      const [result] = results
      expect(result!.outcome).toMatchObject({ status: 'updated', pushed: true })
      expect(result!.outcome).toHaveProperty('strategyFallback')
      expect((result!.outcome as { strategyFallback: string }).strategyFallback).toContain(
        'shared.ts',
      )
      // The report shows what ran, not what was planned.
      expect(result!.strategy).toBe('merge')
      expect(toResult(result!)).toMatchObject({ strategy: 'merge' })
      expect(toResult(result!).strategyFallback).toContain('shared.ts')
      // Never during a rebase: the repair saw an open merge.
      expect(repair.calls).toHaveLength(1)
      expect(repair.midMerge[0]).not.toBeNull()
      git.fetch('origin')
      expect(git.logSubject('origin/fall')).toBe('Merge main into fall')
      expect(git.showAtRev('origin/fall', 'shared.ts')).toBe('both\n')
      // The abandoned rebase left nothing pushed in its own right: history was not rewritten.
      expect(git.isAncestor(oid, git.resolveRef('origin/fall')!)).toBe(true)
    })

    test('AC-4: with on_rebase_conflict: fail it is reported, and repair is not called', async () => {
      const oid = makeTwoStopPr('stay', 'shared.ts')
      const repair = inspectingRepair()
      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'stay', headOid: oid, strategy: 'rebase' }),
          settings({ resolvers, repair, repairOn: ['conflict'], onRebaseConflict: 'fail' }),
          regen(),
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out.status).toBe('conflict')
      if (out.status !== 'conflict') throw new Error('unreachable')
      expect(out.needsHuman.map((c) => c.path)).toEqual(['shared.ts'])
      expect(out).not.toHaveProperty('strategyFallback')
      expect(repair.calls).toEqual([])
      const { git } = fx.worker
      git.fetch('origin')
      expect(git.resolveRef('origin/stay')).toBe(oid)
    })

    describe('on_rebase_conflict: repair', () => {
      /** Fixes whatever path it is given, and keeps each request. */
      function stopRepair(
        result: RepairResult = { ok: true, note: 'fixed' },
      ): Repair & { calls: RepairRequest[]; midRebase: boolean[] } {
        const calls: RepairRequest[] = []
        const midRebase: boolean[] = []
        const fn = async (req: RepairRequest): Promise<RepairResult> => {
          calls.push(req)
          midRebase.push(fx.worker.git.at(req.worktree).resolveRef('REBASE_HEAD') !== null)
          for (const p of req.paths) writeFileSync(join(req.worktree, p), 'repaired\n')
          return result
        }
        return Object.assign(fn, { calls, midRebase })
      }
      const run = (
        branch: string,
        oid: string,
        extra: Partial<UpdateSettings>,
        apply = true,
      ): Promise<UpdateOutcome> =>
        inWorktree((wt) =>
          updateOne(
            wt,
            target({ head: branch, headOid: oid, strategy: 'rebase' }),
            settings({ onRebaseConflict: 'repair', repairOn: ['conflict'], ...extra }),
            regen(),
            { apply, worktree: wtRoot },
          ),
        )

      test('repairs the stop the resolvers cannot clear, then pushes a rebase', async () => {
        const oid = makeTwoStopPr('rr', 'shared.ts')
        const repair = stopRepair()
        const out = await run('rr', oid, { resolvers, repair })
        expect(out).toMatchObject({
          status: 'updated',
          pushed: true,
          repaired: [{ kind: 'conflict', note: 'fixed' }],
        })
        expect(out).not.toHaveProperty('strategyFallback')
        expect(repair.calls).toHaveLength(1)
        expect(repair.midRebase).toEqual([true])
        expect(repair.calls[0]).toMatchObject({
          kind: 'conflict',
          paths: ['shared.ts'],
          replaying: { subject: 'two', onto: 'origin/main' },
        })
        expect(repair.calls[0]!.replaying!.sha).toMatch(/^[0-9a-f]{40}$/)
        const { git } = fx.worker
        git.fetch('origin')
        expect(git.showAtRev('origin/rr', 'shared.ts')).toBe('repaired\n')
        expect(git.logSubject('origin/rr')).toBe('two')
      })

      test('past max_rebase_stops the rebase is aborted and reported, not merged', async () => {
        const oid = makeTwoStopPr('cap', 'shared.ts')
        const repair = stopRepair()
        const out = await run('cap', oid, { repair, maxRebaseStops: 1 })
        expect(out.status).toBe('conflict')
        if (out.status !== 'conflict') throw new Error('unreachable')
        expect(out.needsHuman[0]!.why).toContain('after 1 repaired stop')
        expect(out).not.toHaveProperty('strategyFallback')
        expect(repair.calls).toHaveLength(1)
        const { git } = fx.worker
        git.fetch('origin')
        expect(git.resolveRef('origin/cap')).toBe(oid)
      })

      test('a failed repair reports a conflict with the reason', async () => {
        const oid = makeTwoStopPr('bad', 'shared.ts')
        const repair = stopRepair({ ok: false, note: 'unsure' })
        const out = await run('bad', oid, { resolvers, repair })
        if (out.status !== 'conflict') throw new Error(`got ${out.status}`)
        expect(out.needsHuman[0]!.why).toContain('gave up')
        expect(repair.calls).toHaveLength(1)
        const { git } = fx.worker
        git.fetch('origin')
        expect(git.resolveRef('origin/bad')).toBe(oid)
      })

      test('a rehearsal never calls the repair', async () => {
        const oid = makeTwoStopPr('dry', 'shared.ts')
        const repair = stopRepair()
        const out = await run('dry', oid, { resolvers, repair }, false)
        expect(out.status).toBe('conflict')
        expect(repair.calls).toEqual([])
      })
    })

    test('a fallback merge with no repair is reported as a conflict, strategy merge', async () => {
      const oid = makeTwoStopPr('norep', 'shared.ts')
      const { git } = fx.worker
      const [result] = await updateAll(
        git,
        [target({ head: 'norep', headOid: oid, strategy: 'rebase' })],
        settings({ resolvers }),
        regen(),
        { apply: true, worktreeRoot: wtRoot },
      )
      expect(result!.outcome.status).toBe('conflict')
      expect(result!.strategy).toBe('merge')
      expect(toResult(result!).strategyFallback).toContain('shared.ts')
    })
  })

  describe('confirmPush', () => {
    /** A `confirmPush` that gives one answer and records each preview it saw. */
    function asker(yes: boolean): ((p: PushPreview) => boolean) & { seen: PushPreview[] } {
      const seen: PushPreview[] = []
      return Object.assign(
        (p: PushPreview) => {
          seen.push(p)
          return yes
        },
        { seen },
      )
    }

    test('a declined force-push leaves the branch at its old sha', async () => {
      const oid = makeBehindPr('no', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      const confirm = asker(false)
      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'no', headOid: oid, strategy: 'rebase' }),
          settings({ confirmPush: confirm }),
          recorder(),
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out).toEqual({
        status: 'updated',
        builtOid: expect.any(String),
        resolved: [],
        pushed: false,
        declined: 'push declined',
      })
      expect(describeOutcome(out)).toBe('push declined')
      expect(confirm.seen).toHaveLength(1)

      fx.worker.git.fetch('origin')
      expect(fx.worker.git.resolveRef('origin/no')).toBe(oid)
    })

    test('a confirmed force-push lands, and the preview listed the rebased commits', async () => {
      const oid = makeBehindPr('yes', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      const confirm = asker(true)
      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ number: 7, head: 'yes', headOid: oid, strategy: 'rebase' }),
          settings({ confirmPush: confirm }),
          recorder(),
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out).toMatchObject({ status: 'updated', pushed: true })

      const [p] = confirm.seen
      expect(p).toMatchObject({ number: 7, head: 'yes', base: 'main', replaced: 1 })
      // The rebased commit and the base commit under it, newest first.
      expect(p!.commits.map((c) => c.split(' ').slice(1).join(' '))).toEqual([
        'yes work',
        'main moves',
      ])
      expect(p!.diffstat).toContain('b.txt')

      fx.worker.git.fetch('origin')
      expect(fx.worker.git.resolveRef('origin/yes')).not.toBe(oid)
    })

    test('a merge push is never previewed', async () => {
      makeBehindPr('merge', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      const confirm = asker(false)
      const out = await inWorktree((wt) =>
        updateOne(wt, target({ head: 'merge' }), settings({ confirmPush: confirm }), recorder(), {
          apply: true,
          worktree: wtRoot,
        }),
      )
      expect(out).toMatchObject({ status: 'updated', pushed: true })
      expect(confirm.seen).toEqual([])
    })

    test('a rehearsal is never previewed', async () => {
      const oid = makeBehindPr('dry-r', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      const confirm = asker(true)
      await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'dry-r', headOid: oid, strategy: 'rebase' }),
          settings({ confirmPush: confirm }),
          recorder(),
          { apply: false, worktree: wtRoot },
        ),
      )
      expect(confirm.seen).toEqual([])
    })

    test('a confirmPush that throws counts as no and pushes nothing', async () => {
      const oid = makeBehindPr('throws', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'throws', headOid: oid, strategy: 'rebase' }),
          settings({
            confirmPush: () => {
              throw new Error('no tty')
            },
          }),
          recorder(),
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out).toMatchObject({ status: 'updated', declined: 'push not confirmed: no tty' })
      fx.worker.git.fetch('origin')
      expect(fx.worker.git.resolveRef('origin/throws')).toBe(oid)
    })
  })

  describe('generators and repair', () => {
    /** A repair that records its requests and runs `edit` in the worktree. */
    function fakeRepair(
      edit: (worktree: string) => void = () => {},
      result: RepairResult = { ok: true, note: 'fixed' },
    ): Repair & { calls: RepairRequest[] } {
      const calls: RepairRequest[] = []
      const fn = async (req: RepairRequest): Promise<RepairResult> => {
        calls.push(req)
        edit(req.worktree)
        return result
      }
      return Object.assign(fn, { calls })
    }

    const writeShared = (content: string) => (wt: string) =>
      writeFileSync(join(wt, 'shared.ts'), content)

    test('a generator claims a conflicted path and the merge lands', async () => {
      makeBehindPr('gen2', { 'api.schema.json': 'branch\n' }, { 'api.schema.json': 'main\n' })
      const gen: Generator = {
        name: 'schema',
        claims: (p) => p.endsWith('.schema.json'),
        run: (wt) => {
          writeFileSync(join(wt, 'api.schema.json'), 'generated\n')
          return ok
        },
      }

      const out = await inWorktree((wt) =>
        updateOne(wt, target({ head: 'gen2' }), settings({ generators: [gen] }), recorder(), {
          apply: true,
          worktree: wtRoot,
        }),
      )
      expect(out).toEqual({
        status: 'updated',
        builtOid: expect.any(String),
        resolved: [{ kind: 'generator', path: 'api.schema.json', generator: 'schema' }],
        pushed: true,
        pushedOid: expect.any(String),
      })
      const { git } = fx.worker
      git.fetch('origin')
      expect(git.showAtRev('origin/gen2', 'api.schema.json')).toBe('generated\n')
    })

    test('a repair that fixes the conflict is committed and pushed by pr-update', async () => {
      makeBehindPr('rep', { 'shared.ts': 'branch\n' }, { 'shared.ts': 'main\n' })
      const repair = fakeRepair(writeShared('both\n'))

      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'rep' }),
          settings({ repair, repairOn: ['conflict'] }),
          recorder(),
          {
            apply: true,
            worktree: wtRoot,
          },
        ),
      )
      expect(out).toEqual({
        status: 'updated',
        builtOid: expect.any(String),
        resolved: [],
        pushed: true,
        pushedOid: expect.any(String),
        repaired: [{ kind: 'conflict', note: 'fixed' }],
      })
      expect(repair.calls).toHaveLength(1)
      expect(repair.calls[0]).toMatchObject({
        kind: 'conflict',
        pr: 1,
        base: 'main',
        head: 'rep',
        paths: ['shared.ts'],
      })

      const { git } = fx.worker
      git.fetch('origin')
      expect(git.showAtRev('origin/rep', 'shared.ts')).toBe('both\n')
      // The merge commit is the executor's own, not one the repair made.
      expect(git.logSubject('origin/rep')).toBe('Merge main into rep')
    })

    test('a repair that commits is rejected and nothing is pushed', async () => {
      makeBehindPr('sneaky', { 'shared.ts': 'branch\n' }, { 'shared.ts': 'main\n' })
      const { git } = fx.worker
      const before = git.resolveRef('origin/sneaky')
      const repair = fakeRepair((wt) => {
        writeShared('both\n')(wt)
        const w = git.at(wt)
        w.add(['.'])
        w.commit({ message: 'repair commit', noVerify: true })
      })

      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'sneaky' }),
          settings({ repair, repairOn: ['conflict'] }),
          recorder(),
          {
            apply: true,
            worktree: wtRoot,
          },
        ),
      )
      expect(out.status).toBe('failed')
      if (out.status !== 'failed') throw new Error('unreachable')
      expect(out.reason).toContain('moved HEAD')

      git.fetch('origin')
      expect(git.resolveRef('origin/sneaky')).toBe(before!)
    })

    test('a repair that creates a ref is rejected', async () => {
      makeBehindPr('reffy', { 'shared.ts': 'branch\n' }, { 'shared.ts': 'main\n' })
      const { git } = fx.worker
      const repair = fakeRepair((wt) => {
        writeShared('both\n')(wt)
        git.at(wt).raw(['tag', 'repair-was-here'])
      })

      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'reffy' }),
          settings({ repair, repairOn: ['conflict'] }),
          recorder(),
          {
            apply: true,
            worktree: wtRoot,
          },
        ),
      )
      expect(out.status).toBe('failed')
      if (out.status !== 'failed') throw new Error('unreachable')
      expect(out.reason).toContain('refs/tags/repair-was-here')
    })

    test('a repair that leaves conflict markers fails and leaves no integration behind', async () => {
      makeBehindPr('marked', { 'shared.ts': 'branch\n' }, { 'shared.ts': 'main\n' })
      const { git } = fx.worker
      const before = git.resolveRef('origin/marked')
      const repair = fakeRepair()

      let mergeHead: string | null = 'unset'
      const out = await inWorktree(async (wt) => {
        const res = await updateOne(
          wt,
          target({ head: 'marked' }),
          settings({ repair, repairOn: ['conflict'] }),
          recorder(),
          { apply: true, worktree: wtRoot },
        )
        mergeHead = wt.resolveRef('MERGE_HEAD')
        return res
      })
      expect(out.status).toBe('failed')
      if (out.status !== 'failed') throw new Error('unreachable')
      expect(out.reason).toContain('conflict markers in shared.ts')
      expect(mergeHead).toBeNull()

      git.fetch('origin')
      expect(git.resolveRef('origin/marked')).toBe(before!)
    })

    test('a rehearsal never calls the repair', async () => {
      makeBehindPr('rehearse', { 'shared.ts': 'branch\n' }, { 'shared.ts': 'main\n' })
      const repair = fakeRepair(writeShared('both\n'))

      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'rehearse' }),
          settings({ repair, repairOn: ['conflict'] }),
          recorder(),
          {
            apply: false,
            worktree: wtRoot,
          },
        ),
      )
      expect(out.status).toBe('conflict')
      expect(repair.calls).toEqual([])
    })

    test('a kind not in `repairOn` is not repaired', async () => {
      makeBehindPr('notOn', { 'shared.ts': 'branch\n' }, { 'shared.ts': 'main\n' })
      const repair = fakeRepair(writeShared('both\n'))

      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'notOn' }),
          settings({ repair, repairOn: ['verify-failed'] }),
          recorder(),
          {
            apply: true,
            worktree: wtRoot,
          },
        ),
      )
      expect(out.status).toBe('conflict')
      expect(repair.calls).toEqual([])
    })

    test('a failed verify gets one repair and one re-run', async () => {
      makeBehindPr('vfix', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      const runs = recorder()
      let fixed = false
      const verify: RunVerb = (verb, cwd) => (runs(verb, cwd), fixed ? ok : nope)
      const repair = fakeRepair((wt) => {
        writeFileSync(join(wt, 'fix.txt'), 'fix\n')
        fixed = true
      })

      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'vfix' }),
          settings({ verifyVerbs: ['check'], repair, repairOn: ['verify-failed'] }),
          verify,
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out).toMatchObject({
        status: 'updated',
        pushed: true,
        repaired: [{ kind: 'verify-failed', note: 'fixed' }],
      })
      expect(runs.calls).toEqual(['check', 'check'])
      expect(repair.calls.map((r) => r.kind)).toEqual(['verify-failed'])
      expect(repair.calls[0]!.reason).toContain('boom')

      const { git } = fx.worker
      git.fetch('origin')
      expect(git.showAtRev('origin/vfix', 'fix.txt')).toBe('fix\n')
    })

    test('a file outside the integration that already held marker-like lines is not blamed on a verify repair', async () => {
      // doc.md is on main before the branch forks, so the integration never changes it.
      const { git } = fx.worker
      fx.worker.commit('docs', { 'doc.md': '<<<<<<< example\nquoted\n>>>>>>> example\n' })
      git.push('origin', 'main')
      makeBehindPr('vmark', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      let fixed = false
      const verify: RunVerb = () => (fixed ? ok : nope)
      // A formatter-style repair that rewrites the marker-bearing doc.
      const repair = fakeRepair((wt) => {
        writeFileSync(join(wt, 'doc.md'), '<<<<<<< example\nquoted, reformatted\n>>>>>>> example\n')
        fixed = true
      })
      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'vmark' }),
          settings({ verifyVerbs: ['check'], repair, repairOn: ['verify-failed'] }),
          verify,
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(repair.calls[0]!.paths).not.toContain('doc.md')
      expect(out).toMatchObject({ status: 'updated', pushed: true })
    })

    test('a verify that writes only to stdout is named by its last line (final gate)', async () => {
      makeBehindPr('vstdout', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      const runs = recorder({
        exitCode: 1,
        stdout: 'running 3 tests\n  x adds\n\n1 test failed\n\n',
        stderr: '',
      })
      const out = await inWorktree((wt) =>
        updateOne(wt, target({ head: 'vstdout' }), settings({ verifyVerbs: ['check'] }), runs, {
          apply: true,
          worktree: wtRoot,
        }),
      )
      expect(out).toMatchObject({
        status: 'failed',
        reason: 'verify `check` failed: 1 test failed',
      })
    })

    test('a verify that still fails after the repair reports failed', async () => {
      makeBehindPr('vstill', { 'a.txt': 'a\n' }, { 'b.txt': 'b\n' })
      const { git } = fx.worker
      const before = git.resolveRef('origin/vstill')
      const runs = recorder(nope)
      const repair = fakeRepair()

      const out = await inWorktree((wt) =>
        updateOne(
          wt,
          target({ head: 'vstill' }),
          settings({ verifyVerbs: ['check'], repair, repairOn: ['verify-failed'] }),
          runs,
          { apply: true, worktree: wtRoot },
        ),
      )
      expect(out.status).toBe('failed')
      if (out.status !== 'failed') throw new Error('unreachable')
      expect(out.reason).toContain('after repair')
      expect(runs.calls).toEqual(['check', 'check'])
      expect(repair.calls).toHaveLength(1)

      git.fetch('origin')
      expect(git.resolveRef('origin/vstill')).toBe(before!)
    })

    test('a generator that fails leaves the branch untouched', async () => {
      makeBehindPr('badgen2', { 'api.schema.json': 'branch\n' }, { 'api.schema.json': 'main\n' })
      const { git } = fx.worker
      const before = git.resolveRef('origin/badgen2')
      const gen: Generator = { name: 'schema', claims: () => true, run: () => nope }

      const out = await inWorktree((wt) =>
        updateOne(wt, target({ head: 'badgen2' }), settings({ generators: [gen] }), recorder(), {
          apply: true,
          worktree: wtRoot,
        }),
      )
      expect(out).toEqual({ status: 'failed', reason: 'generator `schema` failed: boom' })
      git.fetch('origin')
      expect(git.resolveRef('origin/badgen2')).toBe(before!)
    })

    /** Run a conflict repair on a fresh `branch` and return the outcome. */
    async function repairConflict(
      branch: string,
      repair: Repair,
      strategy: 'merge' | 'rebase' = 'merge',
    ): Promise<{ out: UpdateOutcome; before: string; mergeHead: string | null }> {
      const oid = makeBehindPr(branch, { 'shared.ts': 'branch\n' }, { 'shared.ts': 'main\n' })
      let mergeHead: string | null = null
      const out = await inWorktree(async (wt) => {
        const res = await updateOne(
          wt,
          target({ head: branch, headOid: oid, strategy }),
          settings({ repair, repairOn: ['conflict'] }),
          recorder(),
          { apply: true, worktree: wtRoot },
        )
        mergeHead = wt.resolveRef('MERGE_HEAD')
        return res
      })
      return { out, before: oid, mergeHead }
    }

    function expectFailedUnpushed(
      r: Awaited<ReturnType<typeof repairConflict>>,
      branch: string,
      reason: string,
    ): void {
      expect(r.out.status).toBe('failed')
      if (r.out.status !== 'failed') throw new Error('unreachable')
      expect(r.out.reason).toContain(reason)
      expect(r.mergeHead).toBeNull()
      const { git } = fx.worker
      git.fetch('origin')
      expect(git.resolveRef(`origin/${branch}`)).toBe(r.before)
    }

    test('a repair that gives up reports failed with its note', async () => {
      const r = await repairConflict(
        'giveup',
        fakeRepair(() => {}, { ok: false, note: 'no idea' }),
      )
      expectFailedUnpushed(r, 'giveup', 'gave up — no idea')
    })

    test('a repair that throws reports failed', async () => {
      const r = await repairConflict(
        'throws',
        fakeRepair(() => {
          throw new Error('model unavailable')
        }),
      )
      expectFailedUnpushed(r, 'throws', 'threw: model unavailable')
    })

    test('a repair that leaves whitespace errors is rejected', async () => {
      const r = await repairConflict('ws', fakeRepair(writeShared('both  \n')))
      expectFailedUnpushed(r, 'ws', 'git diff --check')
    })

    test('a new file the repair writes is checked too', async () => {
      const r = await repairConflict(
        'newfile',
        fakeRepair((wt) => {
          writeShared('both\n')(wt)
          writeFileSync(join(wt, 'scratch.md'), '<<<<<<< HEAD\nx\n>>>>>>> main\n')
        }),
      )
      expectFailedUnpushed(r, 'newfile', 'conflict markers in scratch.md')
    })

    test('a repair planned under rebase lands on a merge', async () => {
      const r = await repairConflict('rebrep', fakeRepair(writeShared('both\n')), 'rebase')
      expect(r.out).toMatchObject({ status: 'updated', pushed: true })
      const { git } = fx.worker
      git.fetch('origin')
      expect(git.showAtRev('origin/rebrep', 'shared.ts')).toBe('both\n')
      // Repair is never called during a rebase, so the rebase was abandoned for a merge.
      expect(r.out).toHaveProperty('strategyFallback')
      expect(git.logSubject('origin/rebrep')).toBe('Merge main into rebrep')
      expect(git.isAncestor(git.resolveRef('origin/main')!, git.resolveRef('origin/rebrep')!)).toBe(
        true,
      )
    })

    test('the report names each repair', async () => {
      const outcome = {
        status: 'updated' as const,
        resolved: [],
        pushed: true,
        repaired: [{ kind: 'conflict' as const, note: 'fixed' }],
      }
      expect(describeOutcome(outcome)).toBe('updated (repaired conflict)')
      expect(toResult({ ...target(), outcome }).repaired).toEqual(outcome.repaired)
    })

    describe('rerere', () => {
      /**
       * PRs off one `main`, each changing `shared.ts` the same way (and a file of its own), then
       * `main` changes `shared.ts`: the same conflict in each. Returns each branch's head.
       */
      function makeSiblings(...branches: string[]): string[] {
        const { git } = fx.worker
        const oids = branches.map((branch) => {
          git.checkout('main', { branch })
          fx.worker.commit(`${branch} work`, { 'shared.ts': 'branch\n', [`${branch}.txt`]: 'x\n' })
          git.push('origin', branch)
          const oid = git.resolveRef('HEAD')!
          git.checkout('main')
          return oid
        })
        fx.worker.commit('main moves', { 'shared.ts': 'main\n' })
        git.push('origin', 'main')
        git.fetch('origin')
        return oids
      }

      const rrCache = (): string => join(fx.worker.git.gitCommonDir()!, 'rr-cache')

      /** The resolutions rerere has recorded in the repository: its `postimage` files. */
      function postimages(): string[] {
        if (!existsSync(rrCache())) return []
        return readdirSync(rrCache()).flatMap((id) =>
          readdirSync(join(rrCache(), id))
            .filter((f) => f.startsWith('postimage'))
            .map((f) => `${id}/${f}`),
        )
      }

      const runAll = (
        targets: UpdateTarget[],
        patch: Partial<UpdateSettings>,
        apply = true,
      ): Promise<UpdateResult[]> =>
        updateAll(fx.worker.git, targets, settings(patch), recorder(), {
          apply,
          worktreeRoot: wtRoot,
        })

      /** A generator that claims `shared.ts` and writes it, and counts its runs. */
      function sharedGenerator(): Generator & { runs: string[] } {
        const runs: string[] = []
        return {
          name: 'shared',
          claims: (p) => p === 'shared.ts',
          run: (wt) => {
            runs.push(wt)
            writeFileSync(join(wt, 'shared.ts'), 'generated\n')
            return ok
          },
          runs,
        }
      }

      test('a repair resolves the first sibling; rerere replays it for the second', async () => {
        makeSiblings('sib1', 'sib2')
        const repair = fakeRepair(writeShared('both\n'))
        const results = await runAll(
          [target({ number: 1, head: 'sib1' }), target({ number: 2, head: 'sib2' })],
          { repair, repairOn: ['conflict'] },
        )
        expect(results.map((r) => r.outcome.status)).toEqual(['updated', 'updated'])
        expect(repair.calls.map((c) => c.pr)).toEqual([1])
        expect(results[1]!.outcome).not.toHaveProperty('repaired')
        const { git } = fx.worker
        git.fetch('origin')
        expect(git.showAtRev('origin/sib2', 'shared.ts')).toBe('both\n')
      })

      test('a resolver resolves the first sibling; rerere replays it for the second', async () => {
        makeSiblings('gen1', 'gen2')
        const gen = sharedGenerator()
        const results = await runAll(
          [target({ number: 1, head: 'gen1' }), target({ number: 2, head: 'gen2' })],
          { generators: [gen] },
        )
        expect(results.map((r) => r.outcome.status)).toEqual(['updated', 'updated'])
        expect(gen.runs).toHaveLength(1)
        const { git } = fx.worker
        git.fetch('origin')
        expect(git.showAtRev('origin/gen2', 'shared.ts')).toBe('generated\n')
      })

      test('a resolution recorded at a rebase stop is replayed at the next', async () => {
        const [a, b] = makeSiblings('reb1', 'reb2')
        const repair = fakeRepair(writeShared('both\n'))
        const results = await runAll(
          [
            target({ number: 1, head: 'reb1', headOid: a!, strategy: 'rebase' }),
            target({ number: 2, head: 'reb2', headOid: b!, strategy: 'rebase' }),
          ],
          { repair, repairOn: ['conflict'], onRebaseConflict: 'repair' },
        )
        expect(results.map((r) => r.outcome.status)).toEqual(['updated', 'updated'])
        expect(results.map((r) => r.strategy)).toEqual(['rebase', 'rebase'])
        expect(repair.calls.map((c) => c.pr)).toEqual([1])
        const { git } = fx.worker
        git.fetch('origin')
        expect(git.showAtRev('origin/reb2', 'shared.ts')).toBe('both\n')
      })

      test('a resolution recorded in one run is replayed in the next', async () => {
        makeSiblings('run1', 'run2')
        const repair = fakeRepair(writeShared('both\n'))
        const patch = { repair, repairOn: ['conflict' as const] }
        await runAll([target({ number: 1, head: 'run1' })], patch)
        const [second] = await runAll([target({ number: 2, head: 'run2' })], patch)
        expect(second!.outcome).toMatchObject({ status: 'updated', pushed: true })
        expect(repair.calls.map((c) => c.pr)).toEqual([1])
      })

      test('a rejected repair leaves nothing a later PR replays', async () => {
        makeSiblings('rej1', 'rej2')
        // It resolves the conflict and commits, which rerere records, and is rejected for it.
        const sneaky = fakeRepair((wt) => {
          writeShared('sneaky\n')(wt)
          const w = fx.worker.git.at(wt)
          w.add(['.'])
          w.commit({ message: 'repair commit', noVerify: true })
        })
        const [first] = await runAll([target({ number: 1, head: 'rej1' })], {
          repair: sneaky,
          repairOn: ['conflict'],
        })
        expect(first!.outcome.status).toBe('failed')
        expect(postimages()).toEqual([])
        const [second] = await runAll([target({ number: 2, head: 'rej2' })], {})
        expect(second!.outcome.status).toBe('conflict')
      })

      test.each(['merge', 'rebase'] as const)(
        'a resolution verify rejected is not replayed in a later run (%s)',
        async (strategy) => {
          const [o1, o2] = makeSiblings('v1', 'v2')
          // Fails while `shared.ts` holds the bad resolution.
          const verify: RunVerb = (_verb, wt) =>
            readFileSync(join(wt, 'shared.ts'), 'utf8') === 'bad\n' ? nope : ok
          const run = (number: number, head: string, headOid: string, repair: Repair) =>
            updateAll(
              fx.worker.git,
              [target({ number, head, headOid, strategy })],
              settings({
                repair,
                repairOn: ['conflict'],
                onRebaseConflict: 'repair',
                verifyVerbs: ['check'],
              }),
              verify,
              { apply: true, worktreeRoot: wtRoot },
            )
          const [first] = await run(1, 'v1', o1!, fakeRepair(writeShared('bad\n')))
          expect(first!.outcome.status).toBe('failed')
          expect(postimages()).toEqual([])
          const good = fakeRepair(writeShared('good\n'))
          const [second] = await run(2, 'v2', o2!, good)
          expect(good.calls).toHaveLength(1)
          expect(second!.outcome).toMatchObject({ status: 'updated', pushed: true })
          fx.worker.git.fetch('origin')
          expect(fx.worker.git.showAtRev('origin/v2', 'shared.ts')).toBe('good\n')
        },
      )

      test("a person's own resolution recorded meanwhile stays when the PR fails", async () => {
        const [, o2] = makeSiblings('p1', 'p2')
        const { git } = fx.worker
        git.raw(['config', 'rerere.enabled', 'true'])
        // The person's own merge in their checkout stops at the same conflict. Its preimage is
        // variant 0, with no resolution yet, so git records pr-update's in variant 1.
        git.checkout('origin/p1', { branch: 'mine', noTrack: true })
        expect(git.raw(['merge', 'origin/main']).exitCode).toBe(1)
        let during: string[] = []
        let committed = -1
        const verify: RunVerb = () => {
          // While verify runs, the person commits their own resolution.
          writeFileSync(join(fx.worker.dir, 'shared.ts'), 'mine\n')
          git.raw(['add', 'shared.ts'])
          committed = git.raw(['commit', '--no-edit', '--no-verify']).exitCode
          during = postimages()
          return nope
        }
        const [out] = await updateAll(
          git,
          [target({ number: 2, head: 'p2', headOid: o2! })],
          settings({
            repair: fakeRepair(writeShared('bad\n')),
            repairOn: ['conflict'],
            verifyVerbs: ['check'],
          }),
          verify,
          { apply: true, worktreeRoot: wtRoot },
        )
        expect(committed).toBe(0)
        expect(during).toHaveLength(2)
        expect(out!.outcome.status).toBe('failed')
        const left = postimages()
        expect(left).toHaveLength(1)
        expect(readFileSync(join(rrCache(), left[0]!), 'utf8')).toBe('mine\n')
      })

      test('a resolution in a push the person declined is not replayed in a later run', async () => {
        const [o1, o2] = makeSiblings('d1', 'd2')
        const run = (
          number: number,
          head: string,
          headOid: string,
          repair: Repair,
          confirm: boolean,
        ): Promise<UpdateResult[]> =>
          updateAll(
            fx.worker.git,
            [target({ number, head, headOid, strategy: 'rebase' })],
            settings({
              repair,
              repairOn: ['conflict'],
              onRebaseConflict: 'repair',
              confirmPush: () => confirm,
            }),
            recorder(),
            { apply: true, worktreeRoot: wtRoot },
          )
        const [first] = await run(1, 'd1', o1!, fakeRepair(writeShared('bad\n')), false)
        expect(first!.outcome).toMatchObject({ status: 'updated', pushed: false })
        expect(first!.outcome).toHaveProperty('declined', 'push declined')
        expect(postimages()).toEqual([])
        const good = fakeRepair(writeShared('good\n'))
        const [second] = await run(2, 'd2', o2!, good, true)
        expect(good.calls).toHaveLength(1)
        expect(second!.outcome).toMatchObject({ status: 'updated', pushed: true })
        fx.worker.git.fetch('origin')
        expect(fx.worker.git.showAtRev('origin/d2', 'shared.ts')).toBe('good\n')
      })

      test('a rebase aborted after a repaired stop leaves nothing a later PR replays', async () => {
        const { git } = fx.worker
        git.checkout('main', { branch: 'two' })
        fx.worker.commit('one', { 'build/out.txt': 'branch one\n' })
        fx.worker.commit('two', { 'shared.ts': 'branch two\n' })
        git.push('origin', 'two')
        const oid = git.resolveRef('HEAD')!
        git.checkout('main')
        fx.worker.commit('main moves', { 'build/out.txt': 'main\n', 'shared.ts': 'main\n' })
        git.push('origin', 'main')
        git.fetch('origin')
        const repair = fakeRepair((wt) => writeFileSync(join(wt, 'build/out.txt'), 'repaired\n'))
        // The first stop is repaired and continued; the second is past the cap.
        const [result] = await runAll([target({ head: 'two', headOid: oid, strategy: 'rebase' })], {
          repair,
          repairOn: ['conflict'],
          onRebaseConflict: 'repair',
          maxRebaseStops: 1,
        })
        expect(result!.outcome.status).toBe('conflict')
        expect(repair.calls).toHaveLength(1)
        expect(postimages()).toEqual([])
      })

      /**
       * `other` and the `siblings` off one base: `other` changes `shared.ts` to `other`, a
       * conflict of its own. Then a recorded resolution of the siblings' conflict (`both`), from
       * an `--apply` run on the first sibling, with rerere on in the repository's own config.
       */
      async function recordedWithRerereOn(other: string, ...siblings: string[]): Promise<string[]> {
        const { git } = fx.worker
        git.checkout('main', { branch: other })
        fx.worker.commit(`${other} work`, { 'shared.ts': 'other\n' })
        git.push('origin', other)
        git.checkout('main')
        makeSiblings(...siblings)
        const first = siblings[0]!
        git.raw(['config', 'rerere.enabled', 'true'])
        await runAll([target({ number: 1, head: first })], {
          repair: fakeRepair(writeShared('both\n')),
          repairOn: ['conflict'],
        })
        const recorded = postimages()
        expect(recorded).toHaveLength(1)
        return recorded
      }

      test('a rehearsal neither records nor replays, with rerere on in the repository', async () => {
        const recorded = await recordedWithRerereOn('dry3', 'dry1', 'dry2')
        // The same conflict is not replayed, so with no repair in a rehearsal it stays.
        const [same] = await runAll([target({ number: 2, head: 'dry2' })], {}, false)
        expect(same!.outcome.status).toBe('conflict')
        // Another conflict a generator resolves is not recorded.
        const [other] = await runAll(
          [target({ number: 3, head: 'dry3' })],
          { generators: [sharedGenerator()] },
          false,
        )
        expect(other!.outcome).toMatchObject({ status: 'updated', pushed: false })
        expect(postimages()).toEqual(recorded)
      })

      test('rerere: false neither records nor replays, with rerere on in the repository', async () => {
        const recorded = await recordedWithRerereOn('off3', 'off1', 'off2')
        const repair = fakeRepair(writeShared('both\n'))
        const results = await runAll(
          [target({ number: 2, head: 'off2' }), target({ number: 3, head: 'off3' })],
          { repair, repairOn: ['conflict'], rerere: false },
        )
        expect(results.map((r) => r.outcome.status)).toEqual(['updated', 'updated'])
        expect(repair.calls.map((c) => c.pr)).toEqual([2, 3])
        expect(postimages()).toEqual(recorded)
      })

      test("the person's own rerere.enabled=false does not turn it off", async () => {
        makeSiblings('own1', 'own2')
        fx.worker.git.raw(['config', 'rerere.enabled', 'false'])
        const repair = fakeRepair(writeShared('both\n'))
        await runAll([target({ number: 1, head: 'own1' }), target({ number: 2, head: 'own2' })], {
          repair,
          repairOn: ['conflict'],
        })
        expect(repair.calls.map((c) => c.pr)).toEqual([1])
      })
    })
  })
})

describe('submodules in the update worktree', () => {
  let fx: ReturnType<typeof makeBareAndWorker>
  let wtRoot: string
  let subDir: string
  let s1: string
  let s2: string
  let s3: string
  const GIT_ENV = ['GIT_ALLOW_PROTOCOL'] as const
  const savedEnv = Object.fromEntries(GIT_ENV.map((k) => [k, process.env[k]]))

  beforeEach(() => {
    // Lets the fixture's `submodule add` and the verb use a local-path URL; both refuse `file` by default.
    process.env.GIT_ALLOW_PROTOCOL = 'file'
    subDir = mkdtempSync(join(tmpdir(), 'pr-update-sub-'))
    const sub = new Git(subDir)
    sub.rawChecked(['init', '-b', 'main'])
    sub.rawChecked(['config', 'user.email', 't@t'])
    sub.rawChecked(['config', 'user.name', 't'])
    const commit = (n: string): string => {
      writeFileSync(join(subDir, 'f.txt'), `${n}\n`)
      sub.add(['.'])
      sub.commit({ message: n })
      return sub.resolveRef('HEAD')!
    }
    s1 = commit('one')
    s2 = commit('two')
    s3 = commit('three')

    fx = makeBareAndWorker({ initialBranch: 'main' })
    fx.worker.commit('initial', { 'README.md': 'fixture\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.fetch('origin')
    wtRoot = join(fx.worker.dir, '.pr-update', 'test')
  })
  afterEach(() => {
    fx.cleanup()
    rmSync(subDir, { recursive: true, force: true })
    for (const k of GIT_ENV) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
  })

  /** A gitlink at `deps/sub` pinned to `sha`, committed on the checked-out branch. */
  function pin(sha: string, addSubmodule = false): void {
    const { git } = fx.worker
    if (addSubmodule) {
      git.rawChecked(['submodule', 'add', subDir, 'deps/sub'])
    }
    git.rawChecked(['update-index', '--add', '--cacheinfo', `160000,${sha},deps/sub`])
    git.commit({ message: `pin ${sha.slice(0, 7)}` })
  }

  /** A commit on main that stages only `b.txt`, so `add` does not pick up the untracked `deps/sub` checkout. */
  function moveMain(): void {
    writeFileSync(join(fx.worker.dir, 'b.txt'), 'b\n')
    fx.worker.git.add(['b.txt'])
    fx.worker.git.commit({ message: 'main moves' })
  }

  /** `sub-pr` pins the submodule at s1; main then moves by `onMain`. */
  function makeBehindPr(onMain: () => void): void {
    const { git } = fx.worker
    git.checkout('main', { branch: 'sub-pr' })
    pin(s1, true)
    git.push('origin', 'sub-pr')
    git.checkout('main')
    onMain()
    git.push('origin', 'main')
    git.fetch('origin')
  }

  async function update(set: Partial<UpdateSettings>, run: RunVerb): Promise<UpdateOutcome> {
    const { git } = fx.worker
    git.worktreeAdd(wtRoot, { detach: true, startPoint: 'origin/main' })
    try {
      return await updateOne(git.at(wtRoot), target({ head: 'sub-pr' }), settings(set), run, {
        apply: false,
        worktree: wtRoot,
      })
    } finally {
      git.try.worktreeRemove(wtRoot, { force: true })
      git.try.worktreePrune()
      git.try.deleteBranch(scratchBranch(wtRoot), { force: true })
    }
  }

  /** A verify verb that records whether the submodule's files are on disk when it runs. */
  function sees(): RunVerb & { seen: boolean[] } {
    const seen: boolean[] = []
    const fn = (): CommandResult => {
      seen.push(existsSync(join(wtRoot, 'deps', 'sub', 'f.txt')))
      return ok
    }
    return Object.assign(fn, { seen })
  }

  test('the submodule is checked out before verify runs', async () => {
    makeBehindPr(moveMain)
    const run = sees()
    const out = await update({ verifyVerbs: ['test'] }, run)
    expect(out.status).toBe('updated')
    expect(run.seen).toEqual([true])
  })

  test('submodules: off leaves it alone', async () => {
    makeBehindPr(moveMain)
    const run = sees()
    await update({ verifyVerbs: ['test'], submodules: 'off' }, run)
    expect(run.seen).toEqual([false])
  })

  test('a repository without .gitmodules is not touched', async () => {
    const { git } = fx.worker
    git.checkout('main', { branch: 'sub-pr' })
    fx.worker.commit('work', { 'a.txt': 'a\n' })
    git.push('origin', 'sub-pr')
    git.checkout('main')
    moveMain()
    git.push('origin', 'main')
    git.fetch('origin')
    const out = await update({}, recorder())
    expect(out.status).toBe('updated')
  })

  test('a submodule that will not check out is its own, unrecorded failure', async () => {
    makeBehindPr(moveMain)
    rmSync(join(subDir, '.git'), { recursive: true, force: true })
    const out = await update({}, recorder())
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') throw new Error('unreachable')
    expect(out.reason).toMatch(/^submodule setup failed: /)
    expect(out.unrecorded).toBe(true)
  })

  /** Commit `build/out.txt` alone: the `commit` helper's `add -A` would also stage the checkout's HEAD. */
  function editOut(text: string): void {
    mkdirSync(join(fx.worker.dir, 'build'), { recursive: true })
    writeFileSync(join(fx.worker.dir, 'build', 'out.txt'), `${text}\n`)
    fx.worker.git.add(['build/out.txt'])
    fx.worker.git.commit({ message: `${text} work` })
  }

  test('a pointer base moved is not restaged to the PR commit when an unrelated file conflicts', async () => {
    const { git } = fx.worker
    pin(s1, true)
    git.push('origin', 'main')
    git.checkout('main', { branch: 'sub-pr' })
    editOut('pr')
    git.push('origin', 'sub-pr')
    // Main moves the pointer cleanly and edits the same generated file, which conflicts.
    git.checkout('main')
    editOut('main')
    pin(s2)
    git.push('origin', 'main')
    git.fetch('origin')

    git.worktreeAdd(wtRoot, { detach: true, startPoint: 'origin/main' })
    try {
      const wt = git.at(wtRoot)
      const out = await updateOne(
        wt,
        target({ head: 'sub-pr' }),
        settings({ resolvers: [{ paths: ['build/**'], run: 'regen' }] }),
        (verb, cwd) => {
          if (verb === 'regen') writeFileSync(join(cwd, 'build', 'out.txt'), 'regenerated\n')
          return ok
        },
        { apply: false, worktree: wtRoot },
      )
      expect(out.status).toBe('updated')
      expect(wt.rawChecked(['ls-tree', 'HEAD', 'deps/sub']).stdout + '').toContain(s2)
    } finally {
      git.try.worktreeRemove(wtRoot, { force: true })
      git.try.worktreePrune()
      git.try.deleteBranch(scratchBranch(wtRoot), { force: true })
    }
  })

  test("a PR's submodule URL is not left in the repository config", async () => {
    makeBehindPr(moveMain)
    const urls = (): string => {
      try {
        return fx.worker.git.rawChecked(['config', '--get-regexp', '^submodule\\..*\\.url$']).stdout
      } catch {
        return ''
      }
    }
    // A PR whose `.gitmodules` names another URL than the one the repository has.
    fx.worker.git.rawChecked(['config', 'submodule.deps/sub.url', '/nowhere/else'])
    const out = await update({}, recorder())
    expect(out.status).toBe('updated')
    expect(urls()).toBe('submodule.deps/sub.url /nowhere/else\n')
  })

  test("the previous PR's submodule is gone before the next PR's resolution is staged", async () => {
    const { git } = fx.worker
    git.checkout('main', { branch: 'sub-pr' })
    pin(s1, true)
    git.push('origin', 'sub-pr')
    git.checkout('main', { branch: 'plain' })
    editOut('plain')
    git.push('origin', 'plain')
    git.checkout('main')
    editOut('main')
    git.push('origin', 'main')
    git.fetch('origin')

    git.worktreeAdd(wtRoot, { detach: true, startPoint: 'origin/main' })
    try {
      const wt = git.at(wtRoot)
      const cfg = settings({ resolvers: [{ paths: ['build/**'], run: 'regen' }] })
      const run: RunVerb = (verb, cwd) => {
        if (verb === 'regen') writeFileSync(join(cwd, 'build', 'out.txt'), 'regenerated\n')
        return ok
      }
      const o = { apply: false, worktree: wtRoot }
      const first = await updateOne(wt, target({ head: 'sub-pr' }), cfg, run, o)
      expect(first.status).toBe('updated')
      const second = await updateOne(wt, target({ head: 'plain', number: 2 }), cfg, run, o)
      expect(second.status).toBe('updated')
      expect(wt.rawChecked(['ls-tree', 'HEAD', 'deps']).stdout).toBe('')
    } finally {
      git.try.worktreeRemove(wtRoot, { force: true })
      git.try.worktreePrune()
      git.try.deleteBranch(scratchBranch(wtRoot), { force: true })
    }
  })

  test('both sides moving the pointer names the two commits', async () => {
    makeBehindPr(() => pin(s3))
    // The branch moves it too, to s2.
    const { git } = fx.worker
    git.checkout('sub-pr')
    pin(s2)
    git.push('origin', 'sub-pr')
    git.checkout('main')
    git.fetch('origin')
    const out = await update({}, recorder())
    expect(out.status).toBe('conflict')
    if (out.status !== 'conflict') throw new Error('unreachable')
    expect(out.needsHuman).toEqual([
      {
        path: 'deps/sub',
        why: `submodule pointer moved on both sides: base ${s3}, branch ${s2}`,
      },
    ])
  })
})

describe('updateAll', () => {
  let fx: ReturnType<typeof makeBareAndWorker>

  beforeEach(() => {
    fx = makeBareAndWorker({ initialBranch: 'main' })
    fx.worker.commit('initial', { 'README.md': 'fixture\n' })
    fx.worker.git.push('origin', 'main')
    fx.worker.git.fetch('origin')
  })
  afterEach(() => fx.cleanup())

  test('one stuck PR does not stop the ones after it', async () => {
    const { git } = fx.worker
    for (const [branch, file] of [
      ['a', 'shared.ts'],
      ['b', 'other.txt'],
    ] as const) {
      git.checkout('main', { branch })
      fx.worker.commit(`${branch} work`, { [file]: `${branch}\n` })
      git.push('origin', branch)
    }
    git.checkout('main')
    fx.worker.commit('main moves', { 'shared.ts': 'main\n' })
    git.push('origin', 'main')
    git.fetch('origin')

    const streamed: number[] = []
    const results = await updateAll(
      git,
      [target({ number: 1, head: 'a' }), target({ number: 2, head: 'b' })],
      SETTINGS,
      recorder(),
      {
        apply: true,
        worktreeRoot: join(fx.worker.dir, '.pr-update', 'run'),
        onResult: (r) => streamed.push(r.number),
      },
    )
    expect(results.map((r) => r.outcome.status)).toEqual(['conflict', 'updated'])
    // Reported as each PR finishes, so a caller can show progress during a long run.
    expect(streamed).toEqual([1, 2])
    expect(tally(results)).toEqual({ updated: 1, 'up-to-date': 0, conflict: 1, failed: 0 })
  })

  test('a forwarded signal stops the run before the next PR is updated', async () => {
    const { git } = fx.worker
    for (const branch of ['a', 'b']) {
      git.checkout('main', { branch })
      fx.worker.commit(`${branch} work`, { [`${branch}.txt`]: `${branch}\n` })
      git.push('origin', branch)
    }
    git.checkout('main')
    git.fetch('origin')

    const results = await updateAll(
      git,
      [target({ number: 1, head: 'a' }), target({ number: 2, head: 'b' })],
      SETTINGS,
      recorder(),
      {
        apply: true,
        worktreeRoot: join(fx.worker.dir, '.pr-update', 'abort'),
        onResult: () => {
          forwarded.signal = 'SIGINT'
        },
      },
    )
    expect(results.map((r) => r.number)).toEqual([1])
    forwarded.signal = undefined
  })

  test('with a lock, it lets go once the worktree is added and takes it again to remove it', async () => {
    const { git } = fx.worker
    git.checkout('main', { branch: 'a' })
    fx.worker.commit('a work', { 'a.txt': 'a\n' })
    git.push('origin', 'a')
    git.checkout('main')
    git.fetch('origin')

    const worktreeRoot = join(fx.worker.dir, '.pr-update', 'locked')
    const listed = (): boolean =>
      git.worktrees().some((w) => w.path.endsWith(join('.pr-update', 'locked')))
    const events: string[] = []
    await updateAll(git, [target({ number: 1, head: 'a' })], SETTINGS, recorder(), {
      apply: true,
      worktreeRoot,
      lock: {
        added: () => events.push(`added: listed ${listed()}`),
        keeping: () => {
          throw new Error('nothing failed, so nothing is kept')
        },
        removing: (remove) => {
          events.push(`removing: listed ${listed()}`)
          remove()
          events.push(`removed: listed ${listed()}`)
        },
      },
      onResult: (r) => events.push(`result ${r.number}`),
    })
    expect(events).toEqual([
      'added: listed true',
      'result 1',
      'removing: listed true',
      'removed: listed false',
    ])
  })

  test("untracked output one PR's verify left is not committed into the next PR", async () => {
    const { git } = fx.worker
    for (const [branch, file] of [
      ['first', 'a.txt'],
      ['second', 'build/out.txt'],
    ] as const) {
      git.checkout('main', { branch })
      fx.worker.commit(`${branch} work`, { [file]: `${branch}\n` })
      git.push('origin', branch)
    }
    git.checkout('main')
    fx.worker.commit('main moves', { 'build/out.txt': 'main\n' })
    git.push('origin', 'main')
    git.fetch('origin')

    // `check` writes a report that is not ignored, as a test runner's junit file is.
    const runVerb: RunVerb = (verb, cwd) => {
      if (verb === 'check') writeFileSync(join(cwd, 'report.xml'), '<ok/>\n')
      if (verb === 'regen') writeFileSync(join(cwd, 'build', 'out.txt'), 'regenerated\n')
      return ok
    }
    const results = await updateAll(
      git,
      [target({ number: 1, head: 'first' }), target({ number: 2, head: 'second' })],
      settings({ verifyVerbs: ['check'], resolvers: [{ paths: ['build/**'], run: 'regen' }] }),
      runVerb,
      { apply: true, worktreeRoot: join(fx.worker.dir, '.pr-update', 'leftovers') },
    )
    expect(results.map((r) => r.outcome.status)).toEqual(['updated', 'updated'])

    git.fetch('origin')
    // The second PR's merge resolution stages `.`, which would have swept it in.
    expect(git.showAtRev('origin/second', 'build/out.txt')).toBe('regenerated\n')
    expect(git.showAtRev('origin/second', 'report.xml')).toBeNull()
  })

  test('the ephemeral worktree and its scratch branch are gone afterwards', async () => {
    const { git } = fx.worker
    git.checkout('main', { branch: 'solo' })
    fx.worker.commit('work', { 'a.txt': 'a\n' })
    git.push('origin', 'solo')
    git.checkout('main')
    fx.worker.commit('main moves', { 'b.txt': 'b\n' })
    git.push('origin', 'main')
    git.fetch('origin')

    const root = join(fx.worker.dir, '.pr-update', 'teardown')
    await updateAll(git, [target({ head: 'solo' })], SETTINGS, recorder(), {
      apply: true,
      worktreeRoot: root,
    })

    expect(existsSync(root)).toBe(false)
    expect(git.worktrees().some((w) => w.path === root)).toBe(false)
    expect(git.branches().filter((b) => b.startsWith(WORK_BRANCH))).toEqual([])
  })

  test('two runs in one repository at once each get their own scratch branch', async () => {
    const { git } = fx.worker
    for (const name of ['first', 'second']) {
      git.checkout('main', { branch: name })
      fx.worker.commit(name, { [`${name}.txt`]: `${name}\n` })
      git.push('origin', name)
    }
    git.checkout('main')
    fx.worker.commit('main moves', { 'b.txt': 'b\n' })
    git.push('origin', 'main')
    git.fetch('origin')

    const run = (head: string, dir: string) =>
      updateAll(git, [target({ head, number: head === 'first' ? 1 : 2 })], SETTINGS, recorder(), {
        apply: true,
        worktreeRoot: join(fx.worker.dir, '.pr-update', dir),
      })
    const [a, b] = await Promise.all([run('first', '111.1'), run('second', '222.1')])

    expect(a.map((r) => r.outcome.status)).toEqual(['updated'])
    expect(b.map((r) => r.outcome.status)).toEqual(['updated'])
    expect(git.branches().filter((x) => x.startsWith(WORK_BRANCH))).toEqual([])
  })

  test('a scratch worktree left by a dead run is removed before the next run', async () => {
    const { git } = fx.worker
    git.checkout('main', { branch: 'after' })
    fx.worker.commit('work', { 'a.txt': 'a\n' })
    git.push('origin', 'after')
    git.checkout('main')
    fx.worker.commit('main moves', { 'b.txt': 'b\n' })
    git.push('origin', 'main')
    git.fetch('origin')
    // No process has pid 0x7ffffffe, so this worktree's run is dead.
    const stale = join(fx.worker.dir, '.pr-update', '2147483646.1')
    git.worktreeAdd(stale, { branch: WORK_BRANCH, startPoint: 'origin/main' })

    const results = await updateAll(git, [target({ head: 'after' })], SETTINGS, recorder(), {
      apply: true,
      worktreeRoot: join(fx.worker.dir, '.pr-update', 'next'),
    })
    expect(results.map((r) => r.outcome.status)).toEqual(['updated'])
    expect(existsSync(stale)).toBe(false)
  })

  test.each(['there', 'gone'])(
    "a dead run's scratch worktree a person locked stays, with its branch, when its folder is %s",
    async (folder) => {
      const { git } = fx.worker
      git.checkout('main', { branch: 'after' })
      fx.worker.commit('work', { 'a.txt': 'a\n' })
      git.push('origin', 'after')
      git.checkout('main')
      git.fetch('origin')
      const root = join(fx.worker.dir, '.pr-update')
      const stale = join(root, '2147483646.1')
      git.worktreeAdd(stale, { branch: WORK_BRANCH, startPoint: 'origin/main' })
      git.at(stale).commit({ message: 'mine', allowEmpty: true })
      const tip = git.resolveRef(WORK_BRANCH)
      git.raw(['worktree', 'lock', '--reason', 'on my usb drive', stale])
      if (folder === 'gone') rmSync(stale, { recursive: true, force: true })
      // git's refusal and `forget`'s own lock check would keep the tree too; recording the
      // calls shows the locked tree is never offered for removal at all.
      const owned = ownedUnder([root])
      const forgotten: string[] = []
      const records = {
        owns: (path: string) => owned.owns(path),
        forget: (g: Git, path: string, removed: boolean) => {
          forgotten.push(path)
          owned.forget(g, path, removed)
        },
      }

      await updateAll(git, [target({ head: 'after' })], SETTINGS, recorder(), {
        apply: true,
        worktreeRoot: join(root, 'next'),
        records,
      })
      expect(forgotten.filter((p) => p.endsWith('2147483646.1'))).toEqual([])
      expect(git.worktrees().some((w) => w.path.endsWith('2147483646.1'))).toBe(true)
      expect(git.resolveRef(WORK_BRANCH)).toBe(tip)
      expect(existsSync(stale)).toBe(folder === 'there')
    },
  )

  test('ownedUnder leaves a worktree a person locked, folder and record, when it cannot be removed', () => {
    const { git } = fx.worker
    const root = join(fx.worker.dir, '.pr-update')
    const tree = join(root, 'locked')
    git.worktreeAdd(tree, { detach: true, startPoint: 'origin/main' })
    git.raw(['worktree', 'lock', '--reason', 'mine', tree])
    ownedUnder([root]).forget(git, tree, false)
    expect(existsSync(tree)).toBe(true)
    expect(git.worktrees().some((w) => w.path.endsWith('locked'))).toBe(true)
  })

  test('an empty run creates no worktree at all', async () => {
    const { git } = fx.worker
    const root = join(fx.worker.dir, '.pr-update', 'never')
    expect(
      await updateAll(git, [], SETTINGS, recorder(), { apply: true, worktreeRoot: root }),
    ).toEqual([])
    expect(existsSync(root)).toBe(false)
  })
})

describe('isStalePush', () => {
  test('recognizes the rejections that mean "re-run", not "go look"', async () => {
    expect(isStalePush('stale')).toBe(true)
    expect(isStalePush('non-fast-forward')).toBe(true)
    expect(isStalePush('lock-failed')).toBe(true)
    expect(isStalePush('already-exists')).toBe(true)
  })

  test('a rejection that fails the same way on every run is not stale', async () => {
    // Running again would not help, and saying it would mislead the user.
    expect(isStalePush('ref-conflict')).toBe(false)
    expect(isStalePush('hook-declined')).toBe(false)
    expect(isStalePush('tag-exists')).toBe(false)
    expect(isStalePush('atomic-failed')).toBe(false)
    expect(isStalePush('other')).toBe(false)
  })
})

describe('targetGitEnv', () => {
  test('turns hooks and background maintenance off with no parent git config', () => {
    expect(targetGitEnv({})).toEqual({
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/dev/null',
      GIT_CONFIG_KEY_1: 'maintenance.auto',
      GIT_CONFIG_VALUE_1: 'false',
      GIT_CONFIG_KEY_2: 'gc.auto',
      GIT_CONFIG_VALUE_2: '0',
      GIT_CONFIG_PARAMETERS:
        "'core.hooksPath'='/dev/null' 'maintenance.auto'='false' 'gc.auto'='0'",
    })
  })

  test('appends after the git config the parent already set, -c settings included', () => {
    expect(targetGitEnv({ GIT_CONFIG_COUNT: '2', GIT_CONFIG_PARAMETERS: "'gc.auto'='1'" })).toEqual(
      {
        GIT_CONFIG_COUNT: '5',
        GIT_CONFIG_KEY_2: 'core.hooksPath',
        GIT_CONFIG_VALUE_2: '/dev/null',
        GIT_CONFIG_KEY_3: 'maintenance.auto',
        GIT_CONFIG_VALUE_3: 'false',
        GIT_CONFIG_KEY_4: 'gc.auto',
        GIT_CONFIG_VALUE_4: '0',
        GIT_CONFIG_PARAMETERS:
          "'gc.auto'='1' 'core.hooksPath'='/dev/null' 'maintenance.auto'='false' 'gc.auto'='0'",
      },
    )
  })

  test('sets extra config after the rest, so a call can pass the whole set', () => {
    const env = targetGitEnv({}, [['rerere.enabled', 'true']])
    expect(env).toMatchObject({
      GIT_CONFIG_COUNT: '4',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_KEY_3: 'rerere.enabled',
      GIT_CONFIG_VALUE_3: 'true',
    })
    expect(env.GIT_CONFIG_PARAMETERS).toMatch(/'gc\.auto'='0' 'rerere\.enabled'='true'$/)
  })
})
