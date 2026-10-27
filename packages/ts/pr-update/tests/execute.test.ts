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

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import type { CommandResult } from '@osdlc/command-seam'
import type { Generator, PushPreview, Repair, RepairRequest, RepairResult } from '../src/ports.ts'
import { toResult } from '../src/update.ts'
import { noHooksEnv } from '../src/update/execute.ts'
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
    expect(out).toEqual({ status: 'updated', resolved: [], pushed: false })

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
    expect(isStalePush('other')).toBe(false)
  })
})

describe('noHooksEnv', () => {
  test('turns hooks off with no parent git config', () => {
    expect(noHooksEnv({})).toEqual({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/dev/null',
    })
  })

  test('appends after the git config the parent already set', () => {
    expect(noHooksEnv({ GIT_CONFIG_COUNT: '2' })).toEqual({
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_2: 'core.hooksPath',
      GIT_CONFIG_VALUE_2: '/dev/null',
    })
  })
})
