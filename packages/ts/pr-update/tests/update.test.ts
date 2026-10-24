/**
 * `update`'s own orchestration: which rows it acts on, how a result maps to
 * the output schema, the strategy-override precedence, and the `Ports`
 * contract (`resolveVerifyVerbs` is called only when `verify` is not `none`).
 *
 * The trust rules themselves (what makes a verb list from the project safe to
 * run) belong to the host, which tests them against its real trust store. This
 * only checks the package's side of the port: it asks, with the right
 * argument, at the right time.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import { isatty } from 'node:tty'

import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import { prUpdateConfigSchema, type PrUpdateConfig } from '../src/config.ts'
import type { AttemptStore, Ports } from '../src/ports.ts'
import type { SurveyReport } from '../src/survey.ts'
import { attemptsDir, fileAttemptStore, listAttempts } from '../src/update/attempts.ts'
import type { UpdateResult } from '../src/update/execute.ts'
import {
  applyStrategyOverride,
  runUpdate,
  selectTargets,
  toResult,
  UpdateUsageError,
  type UpdateArgs,
} from '../src/update.ts'

function cfg(patch: Record<string, unknown> = {}): PrUpdateConfig {
  return { ...prUpdateConfigSchema.parse({}), ...patch } as PrUpdateConfig
}

// ---------------------------------------------------------------------------
// applyStrategyOverride
// ---------------------------------------------------------------------------

describe('applyStrategyOverride', () => {
  test('undefined leaves the config untouched', () => {
    const c = cfg()
    expect(applyStrategyOverride(c, undefined)).toBe(c)
  })

  test('swaps only strategy — overrides and guards pass through unchanged', () => {
    const c = cfg({
      strategy: 'rebase',
      overrides: [{ base: 'release/*', strategy: 'merge' }],
      guards: { unpushed_local: 'skip', reviewed: 'merge', max_rebase_commits: 20 },
    })
    const swapped = applyStrategyOverride(c, 'merge')
    expect(swapped.strategy).toBe('merge')
    expect(swapped.overrides).toEqual(c.overrides)
    expect(swapped.guards).toEqual(c.guards)
  })
})

// ---------------------------------------------------------------------------
// selectTargets
// ---------------------------------------------------------------------------

function row(patch: Record<string, unknown> = {}) {
  return {
    repo: 'o/r',
    number: 1,
    title: 't',
    url: 'https://github.com/o/r/pull/1',
    base: 'main',
    head: 'topic',
    isDraft: false,
    crossRepo: false,
    headOid: 'sha1',
    baseOid: 'base1',
    ahead: 2,
    behind: 3,
    parent: null,
    blockedBy: null,
    status: 'behind',
    merge: 'clean',
    conflicts: [],
    conflictBaseSha: null,
    reviews: 0,
    unpushedLocal: false,
    strategy: 'rebase',
    strategyRule: 'default',
    strategyReason: 'project default (rebase)',
    ...patch,
  }
}

function report(rows: ReturnType<typeof row>[]): SurveyReport {
  return {
    repos: [],
    prs: rows as SurveyReport['prs'],
    cycles: [],
    counts: {
      total: rows.length,
      upToDate: 0,
      behind: rows.length,
      blocked: 0,
      conflicted: 0,
      unknown: 0,
      rebase: rows.length,
      merge: 0,
      skip: 0,
    },
  }
}

describe('selectTargets', () => {
  test('an actionable row becomes a target', () => {
    const { targets, skipped } = selectTargets(report([row()]), [])
    expect(targets).toEqual([
      {
        repo: 'o/r',
        number: 1,
        head: 'topic',
        base: 'main',
        headOid: 'sha1',
        baseOid: 'base1',
        strategy: 'rebase',
      },
    ])
    expect(skipped).toEqual([])
  })

  test('skip/blocked/unknown/up-to-date are all skipped, with a reason', () => {
    const { targets, skipped } = selectTargets(
      report([
        row({ number: 1, strategy: 'skip', strategyReason: 'head branch is in a fork' }),
        row({ number: 2, status: 'blocked', blockedBy: 9 }),
        row({ number: 3, status: 'unknown', behind: null }),
        row({ number: 4, status: 'up-to-date', behind: 0 }),
      ]),
      [],
    )
    expect(targets).toEqual([])
    expect(skipped.map((s) => s.number)).toEqual([1, 2, 3, 4])
    expect(skipped[1]!.reason).toContain('#9')
  })

  test('--pr narrows to exactly the named numbers, and the rest land in skipped, not nowhere', () => {
    const { targets, skipped } = selectTargets(
      report([row({ number: 1 }), row({ number: 2 })]),
      [2],
    )
    expect(targets.map((t) => t.number)).toEqual([2])
    expect(skipped).toEqual([{ number: 1, head: 'topic', reason: 'not selected by --pr/--branch' }])
  })

  test('--pr naming a number the survey never reported still shows up, in skipped', () => {
    // The loop in `selectTargets` visits only `report.prs`. A mistyped or
    // closed `--pr` number outside that set must still appear in the result.
    const { targets, skipped } = selectTargets(report([row({ number: 1 })]), [1, 999])
    expect(targets.map((t) => t.number)).toEqual([1])
    expect(skipped).toEqual([{ number: 999, head: '', reason: 'not found in survey' }])
  })

  test('every surveyed row lands in exactly one list, with or without --pr', () => {
    const rows = [row({ number: 1 }), row({ number: 2, status: 'up-to-date', behind: 0 })]
    const unfiltered = selectTargets(report(rows), [])
    expect(unfiltered.targets.length + unfiltered.skipped.length).toBe(rows.length)
    const filtered = selectTargets(report(rows), [2])
    expect(filtered.targets.length + filtered.skipped.length).toBe(rows.length)
  })
})

// ---------------------------------------------------------------------------
// toResult
// ---------------------------------------------------------------------------

function updateResult(outcome: UpdateResult['outcome']): UpdateResult {
  return {
    repo: 'o/r',
    number: 1,
    head: 'topic',
    base: 'main',
    headOid: 'sha1',
    baseOid: 'base1',
    strategy: 'rebase',
    outcome,
  }
}

describe('toResult', () => {
  test('a conflict outcome carries structured `conflicts`, not just prose in `detail`', () => {
    const needsHuman = [{ path: 'src/a.ts', why: 'no resolver claims it' }]
    const out = toResult(updateResult({ status: 'conflict', needsHuman }))
    expect(out.status).toBe('conflict')
    expect(out.conflicts).toEqual(needsHuman)
    expect(out.detail).toContain('src/a.ts')
  })

  test('a non-conflict outcome has no `conflicts` key at all', () => {
    const out = toResult(updateResult({ status: 'up-to-date' }))
    expect(out.conflicts).toBeUndefined()
  })

  test('pushed is true only for a pushed update', () => {
    expect(toResult(updateResult({ status: 'updated', resolved: [], pushed: true })).pushed).toBe(
      true,
    )
    expect(toResult(updateResult({ status: 'updated', resolved: [], pushed: false })).pushed).toBe(
      false,
    )
    expect(toResult(updateResult({ status: 'failed', reason: 'boom' })).pushed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// runUpdate — the Ports contract, with zero targets so no worktree is needed
//
// A fixture with no `origin` remote makes `resolveTargets` report zero
// targets (the local repo has no parseable owner/repo, and `args.repo` names
// nothing else) without calling `gh`. `updateAll` returns early on an empty
// target list, so the whole run completes with no real worktree.
// ---------------------------------------------------------------------------

const ARGS: UpdateArgs = {
  repo: [],
  noFetch: true,
  noDrafts: false,
  limit: 100,
  remote: 'origin',
  apply: false,
  pr: [],
  trust: false,
  retryFailed: false,
}

const NO_REMOTE: CommandRunner = { run: () => ({ exitCode: 2, stdout: '', stderr: '' }) }
const UNREACHABLE_GH: CommandRunner = {
  run: () => {
    throw new Error('gh should not be called with zero survey targets')
  },
}

function fakePorts(overrides: Partial<Ports> = {}): Ports {
  return {
    locate: () => null,
    runVerb: (): CommandResult => ({ exitCode: 0, stdout: '', stderr: '' }),
    resolveVerifyVerbs: async () => [],
    ...overrides,
  }
}

describe('runUpdate — the Ports contract', () => {
  test('verify: none never calls resolveVerifyVerbs', async () => {
    let calls = 0
    const ports = fakePorts({
      resolveVerifyVerbs: async () => {
        calls += 1
        return []
      },
    })
    const out = await runUpdate(ARGS, {
      projectRoot: '/repo',
      dryRun: false,
      git: NO_REMOTE,
      gh: UNREACHABLE_GH,
      cfg: cfg({ verify: 'none' }),
      ports,
    })
    expect(calls).toBe(0)
    expect(out.applied).toBe(false)
    expect(out.counts).toEqual({ updated: 0, upToDate: 0, conflict: 0, failed: 0, skipped: 0 })
  })

  test.each(['check', 'test'] as const)(
    "verify: %s calls resolveVerifyVerbs exactly once, naming it, with this run's trust flag",
    async (which) => {
      const seen: { which: string; trust: boolean }[] = []
      const ports = fakePorts({
        resolveVerifyVerbs: async (opts) => {
          seen.push(opts)
          return ['just ci']
        },
      })
      await runUpdate(
        { ...ARGS, trust: true },
        {
          projectRoot: '/repo',
          dryRun: false,
          git: NO_REMOTE,
          gh: UNREACHABLE_GH,
          cfg: cfg({ verify: which }),
          ports,
        },
      )
      expect(seen).toEqual([{ which, trust: true }])
    },
  )

  test('dryRun beats --apply: a global rehearsal never writes', async () => {
    const out = await runUpdate(
      { ...ARGS, apply: true },
      {
        projectRoot: '/repo',
        dryRun: true,
        git: NO_REMOTE,
        gh: UNREACHABLE_GH,
        cfg: cfg(),
        ports: fakePorts(),
      },
    )
    expect(out.applied).toBe(false)
  })
})

describe('runUpdate — confirmPush', () => {
  const UNTOUCHED: CommandRunner = {
    run: () => {
      throw new Error('git should not be called')
    },
  }
  const env = (ports: Ports) => ({
    projectRoot: '/repo',
    dryRun: false,
    git: UNTOUCHED,
    gh: UNTOUCHED,
    cfg: cfg(),
    ports,
  })

  test('--confirm-push without --apply is rejected before any PR is touched', async () => {
    const run = runUpdate({ ...ARGS, confirmPush: true }, env(fakePorts()))
    await expect(run).rejects.toBeInstanceOf(UpdateUsageError)
    await expect(run).rejects.toThrow('--confirm-push needs --apply')
  })

  test.skipIf(isatty(0))('with no port and no terminal it is rejected', async () => {
    const run = runUpdate({ ...ARGS, confirmPush: true, apply: true }, env(fakePorts()))
    await expect(run).rejects.toThrow('--confirm-push needs a terminal on stdin')
  })

  test('a host port stands in for the terminal', async () => {
    const out = await runUpdate(
      { ...ARGS, confirmPush: true, apply: true },
      { ...env(fakePorts({ confirmPush: () => true })), git: NO_REMOTE, gh: UNREACHABLE_GH },
    )
    expect(out.applied).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// runUpdate — failed attempts, against real git
// ---------------------------------------------------------------------------

describe('runUpdate — failed attempts', () => {
  let fx: ReturnType<typeof makeBareAndWorker>
  let gitCalls: string[][]
  let file: string

  /** Real git with a pinned identity, recording every argv. */
  function recordingGit(): CommandRunner {
    const real = spawnRunner('git')
    return {
      run: (argv, opts) => {
        gitCalls.push(argv)
        return real.run(argv, { ...opts, env: { ...IDENTITY, ...opts.env } })
      },
    }
  }

  /** `gh pr list`, answered from the bare store's current refs. */
  function fakeGh(branches: readonly string[]): CommandRunner {
    return {
      run: () => {
        const { git } = fx.worker
        git.fetch('origin')
        const prs = branches.map((head, i) => ({
          number: i + 1,
          state: 'OPEN',
          title: head,
          url: `https://github.com/o/r/pull/${i + 1}`,
          baseRefName: 'main',
          headRefName: head,
          headRefOid: git.resolveRef(`origin/${head}`),
        }))
        return { exitCode: 0, stdout: JSON.stringify(prs), stderr: '' }
      },
    }
  }

  function commitOn(branch: string, files: Record<string, string>): void {
    const { git } = fx.worker
    git.checkout(branch)
    fx.worker.commit(`${branch} moves`, files)
    git.push('origin', branch)
    git.checkout('main')
  }

  function branchOff(branch: string, files: Record<string, string>): void {
    const { git } = fx.worker
    git.checkout('main', { branch })
    fx.worker.commit(`${branch} work`, files)
    git.push('origin', branch)
    git.checkout('main')
  }

  async function update(
    patch: Partial<UpdateArgs> = {},
    opts: {
      cfg?: Record<string, unknown>
      dryRun?: boolean
      branches?: string[]
      ports?: Partial<Ports>
    } = {},
  ) {
    gitCalls = []
    return runUpdate(
      { ...ARGS, repo: ['o/r'], apply: true, ...patch },
      {
        projectRoot: fx.worker.dir,
        dryRun: opts.dryRun ?? false,
        git: recordingGit(),
        gh: fakeGh(opts.branches ?? ['topic']),
        cfg: cfg(opts.cfg),
        ports: fakePorts({
          locate: () => fx.worker.dir,
          attempts: fileAttemptStore(file),
          ...opts.ports,
        }),
      },
    )
  }

  const checkedOut = () => gitCalls.some((a) => a[0] === 'worktree' && a[1] === 'add')
  const failures = () => listAttempts(file) as { head: string; failures: number }[]

  beforeEach(() => {
    fx = makeBareAndWorker({ initialBranch: 'main' })
    fx.worker.commit('initial', { 'shared.txt': 'base\n' })
    fx.worker.git.push('origin', 'main')
    branchOff('topic', { 'shared.txt': 'topic\n' })
    commitOn('main', { 'shared.txt': 'main\n' })
    file = attemptsDir(fx.worker.dir)
  })
  afterEach(() => fx.cleanup())

  test('a declined push reaches the port, leaves the branch, and records no failure', async () => {
    branchOff('clean', { 'c.txt': 'c\n' })
    commitOn('main', { 'd.txt': 'd\n' })
    const before = fx.worker.git.resolveRef('origin/clean')
    const seen: number[] = []
    const out = await update(
      { confirmPush: true, strategy: 'rebase' },
      {
        branches: ['clean'],
        ports: {
          confirmPush: (p) => {
            seen.push(p.number)
            return false
          },
        },
      },
    )
    expect(seen).toEqual([1])
    expect(out.results.map((r) => [r.status, r.pushed, r.detail])).toEqual([
      ['updated', false, 'push declined'],
    ])
    fx.worker.git.fetch('origin')
    expect(fx.worker.git.resolveRef('origin/clean')).toBe(before)
    expect(existsSync(file)).toBe(false)
  })

  test('a dry run with --confirm-push needs no terminal and never asks', async () => {
    branchOff('clean', { 'c.txt': 'c\n' })
    const out = await update(
      { confirmPush: true, strategy: 'rebase' },
      { dryRun: true, branches: ['clean'] },
    )
    expect(out.applied).toBe(false)
  })

  test('AC-1: a second run skips an unclaimed conflict without a checkout', async () => {
    const first = await update()
    expect(first.results.map((r) => r.status)).toEqual(['conflict'])

    const second = await update()
    expect(second.results).toEqual([])
    expect(second.skipped).toEqual([
      {
        number: 1,
        head: 'topic',
        reason: 'failed 1 time(s) at this head and base; waiting for either to move',
      },
    ])
    expect(checkedOut()).toBe(false)
  })

  test('AC-2: a new head commit is attempted again', async () => {
    await update()
    commitOn('topic', { 'other.txt': 'more\n' })
    expect((await update()).results.map((r) => r.number)).toEqual([1])
  })

  test('AC-3: a new base commit is attempted again', async () => {
    await update()
    commitOn('main', { 'unrelated.txt': 'x\n' })
    expect((await update()).results.map((r) => r.number)).toEqual([1])
  })

  test('AC-4: --retry-failed attempts a recorded PR and records the new failure', async () => {
    await update()
    const out = await update({ retryFailed: true })
    expect(out.results.map((r) => r.status)).toEqual(['conflict'])
    expect(failures().map((e) => e.failures)).toEqual([2])
  })

  test('AC-5: max_failed_attempts 0 never skips', async () => {
    const opts = { cfg: { max_failed_attempts: 0 } }
    await update({}, opts)
    expect((await update({}, opts)).results.map((r) => r.number)).toEqual([1])
  })

  test('AC-6: a rehearsal or a dry run leaves the attempts unchanged', async () => {
    await update()
    const before = JSON.stringify(listAttempts(file))
    await update({ apply: false, retryFailed: true })
    await update({ retryFailed: true }, { dryRun: true })
    expect(JSON.stringify(listAttempts(file))).toBe(before)
  })

  test("AC-7: a successful update removes the PR's entries", async () => {
    branchOff('clean', { 'clean.txt': 'c\n' })
    commitOn('main', { 'later.txt': 'l\n' })
    fileAttemptStore(file).recordFailure(
      { repo: 'o/r', head: 'clean', headOid: 'old', base: 'main', baseOid: 'old' },
      'seeded',
    )
    const out = await update({}, { branches: ['topic', 'clean'] })
    expect(out.results.map((r) => [r.head, r.status])).toEqual([
      ['topic', 'conflict'],
      ['clean', 'updated'],
    ])
    expect(failures().map((e) => e.head)).toEqual(['topic'])
  })
})

describe('selectTargets — failed attempts', () => {
  const store = (failures: number): AttemptStore => ({
    get: () => ({ failures, reason: 'boom', at: '2026-01-01T00:00:00Z' }),
    recordFailure: () => {},
    clear: () => {},
  })

  test('skips at the limit and attempts below it', () => {
    const policy = { maxFailedAttempts: 2, retryFailed: false }
    const below = selectTargets(report([row()]), [], { ...policy, attempts: store(1) })
    expect(below.targets).toHaveLength(1)
    const at = selectTargets(report([row()]), [], { ...policy, attempts: store(2) })
    expect(at.skipped[0]!.reason).toContain('failed 2 time(s)')
  })

  test('a row with an unknown sha is never skipped', () => {
    const policy = { maxFailedAttempts: 1, retryFailed: false, attempts: store(5) }
    expect(selectTargets(report([row({ baseOid: null })]), [], policy).targets).toHaveLength(1)
  })
})
