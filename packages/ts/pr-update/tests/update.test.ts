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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isatty } from 'node:tty'

import type { CodeHost, CodeHostPrDetail } from '@osdlc/code-host'
import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import { forwarded } from './support-signal.ts'
import { prUpdateConfigSchema, type PrUpdateConfig } from '../src/config.ts'
import type { AttemptStore, Ports } from '../src/ports.ts'
import { prKey, type SurveyReport } from '../src/survey.ts'
import { attemptsDir, fileAttemptStore, listAttempts } from '../src/update/attempts.ts'
import type { UpdateResult, UpdateTarget } from '../src/update/execute.ts'
import {
  applyStrategyOverride,
  renderUpdateText,
  restackTarget,
  runUpdate,
  selectTargets,
  toResult,
  UpdateUsageError,
  type UpdateArgs,
  type UpdateOutput,
} from '../src/update.ts'

vi.mock('@osdlc/command-seam', async (original) =>
  (await import('./support-signal.ts')).mockForwarding(original),
)

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

function report(rows: ReturnType<typeof row>[], cycles: number[] = []): SurveyReport {
  return {
    repos: [{ repo: 'o/r', measurable: true, fetched: true, cycles }],
    prs: rows as SurveyReport['prs'],
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
    expect(skipped).toEqual([
      { repo: 'o/r', number: 1, head: 'topic', reason: 'not selected by --pr/--branch' },
    ])
  })

  test('--pr naming a PR the survey never reported still shows up, in notFound', () => {
    // The loops in `selectTargets` visit only what the survey listed. A
    // mistyped or closed `--pr` selector must still appear in the result.
    const { targets, skipped, notFound } = selectTargets(report([row({ number: 1 })]), [
      1,
      999,
      'o/r#998',
    ])
    expect(targets.map((t) => t.number)).toEqual([1])
    expect(skipped).toEqual([])
    expect(notFound).toEqual(['#999', 'o/r#998'])
  })

  test('a PR in a base/head cycle is reported in skipped, not lost or "not found"', () => {
    const cyclic = report([row({ number: 1 })], [3, 4])
    const reason = 'in a base/head cycle; no stack order to update it in'
    expect(selectTargets(cyclic, []).skipped).toEqual([
      { repo: 'o/r', number: 3, head: '', reason },
      { repo: 'o/r', number: 4, head: '', reason },
    ])
    const scoped = selectTargets(cyclic, [3]).skipped
    expect(scoped.find((s) => s.number === 3)!.reason).toContain('base/head cycle')
    expect(scoped.find((s) => s.number === 4)!.reason).toBe('not selected by --pr/--branch')
    expect(scoped.some((s) => s.reason === 'not found in survey')).toBe(false)
  })

  test('every surveyed row lands in exactly one list, with or without --pr', () => {
    const rows = [row({ number: 1 }), row({ number: 2, status: 'up-to-date', behind: 0 })]
    const unfiltered = selectTargets(report(rows), [])
    expect(unfiltered.targets.length + unfiltered.skipped.length).toBe(rows.length)
    const filtered = selectTargets(report(rows), [2])
    expect(filtered.targets.length + filtered.skipped.length).toBe(rows.length)
  })
})

describe('selectTargets — several repositories holding the same PR number', () => {
  /** Two repositories, `a/x` and `b/y`, each with an actionable PR 1. */
  function twoRepos(cycles: { a?: number[]; b?: number[] } = {}): SurveyReport {
    return {
      ...report([row({ repo: 'a/x', head: 'ax' }), row({ repo: 'b/y', head: 'by' })]),
      repos: [
        { repo: 'a/x', measurable: true, fetched: true, cycles: cycles.a ?? [] },
        { repo: 'b/y', measurable: true, fetched: true, cycles: cycles.b ?? [] },
      ],
    }
  }

  test('both are targets, each naming its own repository', () => {
    const { targets } = selectTargets(twoRepos(), [])
    expect(targets.map((t) => [t.repo, t.number])).toEqual([
      ['a/x', 1],
      ['b/y', 1],
    ])
  })

  test('a bare --pr number selects that PR in every repository', () => {
    expect(selectTargets(twoRepos(), [1]).targets.map((t) => t.repo)).toEqual(['a/x', 'b/y'])
  })

  test("a prKey selects one repository's PR and skips the other, naming its repository", () => {
    const { targets, skipped } = selectTargets(twoRepos(), [prKey('b/y', 1)])
    expect(targets.map((t) => t.repo)).toEqual(['b/y'])
    expect(skipped).toEqual([
      { repo: 'a/x', number: 1, head: 'ax', reason: 'not selected by --pr/--branch' },
    ])
  })

  test('a cycle in one repository is not hidden by a row with its number in another', () => {
    // `a/x` lists PR 1 as a row; in `b/y`, PR 1 is in a base/head cycle.
    const { targets, skipped } = selectTargets(
      { ...twoRepos({ b: [1] }), prs: [row({ repo: 'a/x', head: 'ax' })] as SurveyReport['prs'] },
      [],
    )
    expect(targets.map((t) => t.repo)).toEqual(['a/x'])
    expect(skipped).toEqual([
      {
        repo: 'b/y',
        number: 1,
        head: '',
        reason: 'in a base/head cycle; no stack order to update it in',
      },
    ])
  })

  test('a --pr number found in either repository is not "not found"', () => {
    const report2: SurveyReport = {
      ...twoRepos(),
      prs: [
        row({ repo: 'a/x', number: 1 }),
        row({ repo: 'b/y', number: 2 }),
      ] as SurveyReport['prs'],
    }
    const { skipped, notFound } = selectTargets(report2, [2])
    expect(skipped).toEqual([
      { repo: 'a/x', number: 1, head: 'topic', reason: 'not selected by --pr/--branch' },
    ])
    expect(notFound).toEqual([])
  })

  test('a key for one repository is not found when only the other has that number', () => {
    expect(selectTargets(twoRepos(), [prKey('b/y', 2)]).notFound).toEqual(['b/y#2'])
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

describe('renderUpdateText', () => {
  type Result = UpdateOutput['results'][number]
  const res = (patch: Partial<Result>): Result => ({
    repo: 'o/r',
    number: 1,
    head: 'topic',
    base: 'main',
    strategy: 'rebase',
    status: 'updated',
    pushed: true,
    detail: 'updated',
    ...patch,
  })
  const counts = { updated: 1, upToDate: 0, conflict: 1, failed: 1, skipped: 1, notFound: 0 }
  const empty = { results: [], skipped: [], notFound: [], repos: [] }

  test('marks each status, prints checkout and skipped lines, and the counts', () => {
    const text = renderUpdateText({
      ...empty,
      applied: true,
      results: [
        res({ localCheckout: { updated: true, detail: 'moved to abc' } }),
        res({ number: 2, status: 'updated', pushed: false, detail: 'would update' }),
        res({ number: 3, status: 'failed', pushed: false, detail: 'boom' }),
        res({ number: 4, status: 'conflict', pushed: false, detail: 'needs a human' }),
      ],
      skipped: [{ repo: 'o/r', number: 5, head: 'other', reason: 'already up to date' }],
      counts,
    })
    expect(text.split('\n')).toEqual([
      '✓ o/r#1  rebase  topic  updated',
      '    checkout: moved — moved to abc',
      '· o/r#2  rebase  topic  would update',
      '✗ o/r#3  rebase  topic  boom',
      '! o/r#4  rebase  topic  needs a human',
      '- o/r#5  other  already up to date',
      '',
      'PR-UPDATE: updated=1 up-to-date=0 conflict=1 failed=1 skipped=1',
      '',
    ])
  })

  test('names every PR owner/name#N, in one repository or several, and lists what was not found', () => {
    const text = renderUpdateText({
      ...empty,
      applied: true,
      results: [res({}), res({ repo: 'x/y', detail: 'boom', status: 'failed', pushed: false })],
      skipped: [{ repo: 'x/y', number: 2, head: 'other', reason: 'already up to date' }],
      notFound: ['#9', 'x/y#8'],
      counts: { ...counts, notFound: 2 },
    })
    expect(text.split('\n')).toEqual([
      '✓ o/r#1  rebase  topic  updated',
      '✗ x/y#1  rebase  topic  boom',
      '- x/y#2  other  already up to date',
      '? #9  no open PR in the surveyed repositories',
      '? x/y#8  no open PR in the surveyed repositories',
      '',
      'PR-UPDATE: updated=1 up-to-date=0 conflict=1 failed=1 skipped=1 not-found=2',
      '',
    ])
  })

  test('a restacked PR names the parent it went onto', () => {
    const text = renderUpdateText({
      ...empty,
      applied: true,
      results: [res({ number: 2, head: 'child', restackedOnto: 1 })],
      counts,
    })
    expect(text.split('\n')[0]).toBe('✓ o/r#2  rebase  child  updated  (restacked onto o/r#1)')
  })

  test('a rehearsal says nothing was pushed', () => {
    const text = renderUpdateText({ ...empty, applied: false, counts })
    expect(text).toContain('PR-UPDATE (rehearsal — nothing pushed): updated=1')
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
  restack: false,
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
    expect(out.counts).toEqual({
      updated: 0,
      upToDate: 0,
      conflict: 0,
      failed: 0,
      skipped: 0,
      notFound: 0,
    })
  })

  test.each(['check', 'test'] as const)(
    'verify: %s with no repository surveyed never asks resolveVerifyVerbs',
    async (which) => {
      let calls = 0
      const ports = fakePorts({
        resolveVerifyVerbs: async () => {
          calls += 1
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
      expect(calls).toBe(0)
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
  let onGit: ((argv: string[]) => void) | undefined

  /** Real git with a pinned identity, recording every argv. */
  function recordingGit(): CommandRunner {
    const real = spawnRunner('git')
    return {
      run: (argv, opts) => {
        gitCalls.push(argv)
        onGit?.(argv)
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
  afterEach(() => {
    forwarded.signal = undefined
    onGit = undefined
    fx.cleanup()
  })

  test('an interrupted run records no failed attempt', async () => {
    onGit = (argv) => {
      if (argv[0] === 'merge' || argv[0] === 'rebase') forwarded.signal = 'SIGINT'
    }
    const out = await update()
    expect(out.results.map((r) => r.status)).toEqual(['conflict'])
    expect(existsSync(file)).toBe(false)
  })

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
        repo: 'o/r',
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

  test("each PR's record is written when that PR finishes, not after the batch", async () => {
    branchOff('clean', { 'clean.txt': 'c\n' })
    commitOn('main', { 'later.txt': 'l\n' })
    const events: string[] = []
    const real = fileAttemptStore(file)
    await update(
      {},
      {
        branches: ['topic', 'clean'],
        ports: {
          attempts: {
            get: real.get,
            recordFailure: (k, r) => {
              events.push(`record ${k.head}`)
              real.recordFailure(k, r)
            },
            clear: (repo, head, base) => {
              events.push(`clear ${head}`)
              real.clear(repo, head, base)
            },
          },
          lease: {
            acquire: ({ head }) => {
              events.push(`start ${head}`)
              return { ok: true, release: () => events.push(`end ${head}`) }
            },
          },
        },
      },
    )
    expect(events).toEqual([
      'start topic',
      'end topic',
      'record topic',
      'start clean',
      'end clean',
      'clear clean',
    ])
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

// ---------------------------------------------------------------------------
// runUpdate — several repositories, against real git
// ---------------------------------------------------------------------------

describe('runUpdate — a located repository', () => {
  let local: ReturnType<typeof makeBareAndWorker>
  let other: ReturnType<typeof makeBareAndWorker>

  beforeEach(() => {
    local = makeBareAndWorker({ initialBranch: 'main' })
    other = makeBareAndWorker({ initialBranch: 'main' })
    for (const fx of [local, other]) {
      fx.worker.commit('initial', { 'README.md': 'fixture\n' })
      fx.worker.git.push('origin', 'main')
    }
    // Only the other repository has the PR branch.
    const { git } = other.worker
    git.checkout('main', { branch: 'topic' })
    other.worker.commit('topic work', { 'a.txt': 'a\n' })
    git.push('origin', 'topic')
    git.checkout('main')
    other.worker.commit('main moves', { 'b.txt': 'b\n' })
    git.push('origin', 'main')
    git.fetch('origin')
  })
  afterEach(() => {
    local.cleanup()
    other.cleanup()
  })

  test("its PRs are updated in its own checkout, not the project root's", async () => {
    const headSha = other.worker.git.resolveRef('origin/topic')
    const detail: CodeHostPrDetail = {
      number: 5,
      title: 'topic',
      url: 'https://github.com/x/y/pull/5',
      baseRef: 'main',
      headRef: 'topic',
      headSha,
      isDraft: false,
      labels: [],
      reviewCount: 0,
      isCrossRepository: false,
    }
    const real = spawnRunner('git')
    const git: CommandRunner = {
      run: (argv, opts) => real.run(argv, { ...opts, env: { ...IDENTITY, ...opts.env } }),
    }
    const out = await runUpdate(
      { ...ARGS, repo: ['x/y'], apply: true, strategy: 'merge' },
      {
        projectRoot: local.worker.dir,
        dryRun: false,
        git,
        gh: UNREACHABLE_GH,
        codeHost: () =>
          ({ listPrDetails: () => ({ ok: true, value: [detail] }) }) as unknown as CodeHost,
        cfg: cfg(),
        ports: fakePorts({ locate: (repo) => (repo === 'x/y' ? other.worker.dir : null) }),
      },
    )
    expect(out.results.map((r) => [r.number, r.status, r.pushed])).toEqual([[5, 'updated', true]])
    other.worker.git.fetch('origin')
    const after = other.worker.git.resolveRef('origin/topic')!
    expect(after).not.toBe(headSha)
    expect(other.worker.git.isAncestor(other.worker.git.resolveRef('origin/main')!, after)).toBe(
      true,
    )
  })
})

describe('runUpdate — two repositories that each hold a PR 1', () => {
  let a: ReturnType<typeof makeBareAndWorker>
  let b: ReturnType<typeof makeBareAndWorker>
  let root: ReturnType<typeof makeBareAndWorker>

  /** A repository whose `topic` branch is one commit behind `main`. */
  function behindTopic(): ReturnType<typeof makeBareAndWorker> {
    const fx = makeBareAndWorker({ initialBranch: 'main' })
    const { git } = fx.worker
    fx.worker.commit('initial', { 'README.md': 'fixture\n' })
    git.push('origin', 'main')
    git.checkout('main', { branch: 'topic' })
    fx.worker.commit('topic work', { 'a.txt': 'a\n' })
    git.push('origin', 'topic')
    git.checkout('main')
    fx.worker.commit('main moves', { 'b.txt': 'b\n' })
    git.push('origin', 'main')
    git.fetch('origin')
    return fx
  }

  beforeEach(() => {
    a = behindTopic()
    b = behindTopic()
    // The project root has no parseable remote, so only the named
    // repositories are surveyed.
    root = makeBareAndWorker({ initialBranch: 'main' })
  })
  afterEach(() => {
    for (const fx of [a, b, root]) fx.cleanup()
  })

  async function run(ports: Partial<Ports>) {
    const checkout: Record<string, string> = { 'a/x': a.worker.dir, 'b/y': b.worker.dir }
    const real = spawnRunner('git')
    const git: CommandRunner = {
      run: (argv, opts) => real.run(argv, { ...opts, env: { ...IDENTITY, ...opts.env } }),
    }
    const pr1 = (repo: string): CodeHostPrDetail => {
      const fx = repo === 'a/x' ? a : b
      return {
        number: 1,
        title: 'topic',
        url: `https://github.com/${repo}/pull/1`,
        baseRef: 'main',
        headRef: 'topic',
        headSha: fx.worker.git.resolveRef('origin/topic')!,
        isDraft: false,
        labels: [],
        reviewCount: 0,
        isCrossRepository: false,
      }
    }
    return runUpdate(
      { ...ARGS, repo: ['a/x', 'b/y'], apply: true, strategy: 'merge' },
      {
        projectRoot: root.worker.dir,
        dryRun: false,
        git,
        gh: UNREACHABLE_GH,
        codeHost: ({ repo }) =>
          ({ listPrDetails: () => ({ ok: true, value: [pr1(repo)] }) }) as unknown as CodeHost,
        cfg: cfg({ verify: 'check' }),
        ports: fakePorts({ locate: (repo) => checkout[repo] ?? null, ...ports }),
      },
    )
  }

  test('each result names its repository', async () => {
    const out = await run({})
    expect(out.results.map((r) => [r.repo, r.number, r.status])).toEqual([
      ['a/x', 1, 'updated'],
      ['b/y', 1, 'updated'],
    ])
  })

  test('verify verbs are resolved once per repository, naming it and its checkout, and run there', async () => {
    const asked: { which: string; trust: boolean; repo: string; checkout: string }[] = []
    const ran: { verb: string; cwd: string }[] = []
    const out = await run({
      resolveVerifyVerbs: async (opts) => {
        asked.push(opts)
        return opts.repo === 'a/x' ? ['make check'] : ['cargo test']
      },
      runVerb: (verb, cwd) => {
        ran.push({ verb, cwd })
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    })
    expect(asked).toEqual([
      { which: 'check', trust: false, repo: 'a/x', checkout: a.worker.dir },
      { which: 'check', trust: false, repo: 'b/y', checkout: b.worker.dir },
    ])
    expect(ran.map((r) => r.verb)).toEqual(['make check', 'cargo test'])
    expect(ran[0]!.cwd.startsWith(join(a.worker.dir, '.pr-update'))).toBe(true)
    expect(ran[1]!.cwd.startsWith(join(b.worker.dir, '.pr-update'))).toBe(true)
    expect(out.counts.updated).toBe(2)
  })

  test('a list refused for one repository stops the run before either is pushed', async () => {
    const heads = [a, b].map((fx) => fx.worker.git.resolveRef('origin/topic'))
    await expect(
      run({
        resolveVerifyVerbs: async ({ repo }) => {
          if (repo === 'b/y') throw new Error('b/y is not trusted')
          return ['make check']
        },
      }),
    ).rejects.toThrow('b/y is not trusted')
    for (const [i, fx] of [a, b].entries()) {
      fx.worker.git.fetch('origin')
      expect(fx.worker.git.resolveRef('origin/topic')).toBe(heads[i])
    }
  })
})

// ---------------------------------------------------------------------------
// restack: a whole stack in one run
// ---------------------------------------------------------------------------

describe('selectTargets — restack', () => {
  // main <- #1 (behind) <- #2 <- #3: #2 and #3 are blocked on #1.
  const stack = () =>
    report([
      row({ number: 1, head: 'g' }),
      row({ number: 2, head: 'p', base: 'g', parent: 1, status: 'blocked', blockedBy: 1 }),
      row({ number: 3, head: 'c', base: 'p', parent: 2, status: 'blocked', blockedBy: 1 }),
    ])

  test('without restack, blocked children wait for the next run', () => {
    const { targets, skipped } = selectTargets(stack(), [])
    expect(targets.map((t) => t.number)).toEqual([1])
    expect(skipped.map((s) => s.reason)).toEqual(['blocked on #1', 'blocked on #1'])
  })

  test('with restack, each blocked child is a target after its parent, marked with it', () => {
    const { targets, skipped } = selectTargets(stack(), [], undefined, { restack: true })
    expect(targets.map((t) => [t.number, t.stackParent])).toEqual([
      [1, undefined],
      [2, 1],
      [3, 2],
    ])
    expect(skipped).toEqual([])
  })

  test('a child whose parent is not a target stays blocked, and says why', () => {
    const r = stack()
    r.prs[0] = { ...r.prs[0]!, strategy: 'skip', strategyReason: 'fork' }
    const { targets, skipped } = selectTargets(r, [], undefined, { restack: true })
    expect(targets).toEqual([])
    expect(skipped.map((s) => s.reason)).toEqual([
      'fork',
      'blocked on #1; parent #1 is not updated in this run',
      'blocked on #1; parent #2 is not updated in this run',
    ])
  })

  test('a scoped restack run takes the named PR with its stack ancestors', () => {
    const scoped = selectTargets(stack(), [prKey('o/r', 2)], undefined, { restack: true })
    expect(scoped.targets.map((t) => t.number)).toEqual([1, 2])
    expect(scoped.skipped.map((s) => [s.number, s.reason])).toEqual([
      [3, 'not selected by --pr/--branch'],
    ])
    const plain = selectTargets(stack(), [prKey('o/r', 2)])
    expect(plain.targets).toEqual([])
  })
})

describe('restackTarget', () => {
  const child: UpdateTarget = {
    repo: 'o/r',
    number: 2,
    head: 'p',
    base: 'g',
    headOid: 'p0',
    baseOid: 'g0',
    strategy: 'rebase',
    stackParent: 1,
  }
  const parent = (outcome: UpdateResult['outcome']): UpdateResult => ({
    repo: 'o/r',
    number: 1,
    head: 'g',
    base: 'main',
    headOid: 'g0',
    baseOid: 'm0',
    strategy: 'rebase',
    outcome,
  })
  const policy = { maxFailedAttempts: 0, retryFailed: false }
  const pushed = parent({
    status: 'updated',
    resolved: [],
    pushed: true,
    builtOid: 'g1',
    pushedOid: 'g1',
  })

  test('goes onto the head the parent was pushed at, replaying from its old head', () => {
    expect(restackTarget(child, [pushed], true, policy)).toEqual({
      ...child,
      baseOid: 'g1',
      onto: { parent: 1, oid: 'g1', upstream: 'g0' },
    })
  })

  test('a rehearsal goes onto the head the parent was built at', () => {
    const built = parent({ status: 'updated', resolved: [], pushed: false, builtOid: 'g1' })
    expect(restackTarget(child, [built], false, policy)).toMatchObject({
      onto: { parent: 1, oid: 'g1', upstream: 'g0' },
    })
  })

  test('a parent that was built but not pushed holds the child back in a run that writes', () => {
    const declined = parent({
      status: 'updated',
      resolved: [],
      pushed: false,
      builtOid: 'g1',
      declined: 'push declined',
    })
    expect(restackTarget(child, [declined], true, policy)).toBe(
      'blocked on #1; parent #1 was not pushed (push declined)',
    )
  })

  test('a parent that conflicted or failed holds the child back', () => {
    const conflict = parent({ status: 'conflict', needsHuman: [] })
    expect(restackTarget(child, [conflict], true, policy)).toBe(
      'blocked on #1; parent #1 ended conflict',
    )
    expect(restackTarget(child, [], true, policy)).toBe('blocked on #1; parent #1 was not updated')
  })

  test('a parent that was already current leaves the child as surveyed', () => {
    expect(restackTarget(child, [parent({ status: 'up-to-date' })], true, policy)).toBe(child)
  })

  test("a failure recorded at the child's new base holds it back", () => {
    const attempts: AttemptStore = {
      get: (key) => (key.baseOid === 'g1' ? { failures: 2, reason: 'x', at: '' } : null),
      recordFailure: () => {},
      clear: () => {},
    }
    const out = restackTarget(child, [pushed], true, {
      attempts,
      maxFailedAttempts: 2,
      retryFailed: false,
    })
    expect(out).toBe('failed 2 time(s) at this head and base; waiting for either to move')
  })
})

describe('runUpdate --restack — a three-level stack, against real git', () => {
  // main <- g (#1) <- p (#2) <- c (#3), and main has moved on.
  let fx: ReturnType<typeof makeBareAndWorker>
  let calls: string[][]

  function branch(name: string, from: string, files: Record<string, string>): void {
    const { git } = fx.worker
    git.checkout(from, { branch: name })
    fx.worker.commit(`${name} work`, files)
    git.push('origin', name)
  }

  beforeEach(() => {
    fx = makeBareAndWorker({ initialBranch: 'main' })
    const { git } = fx.worker
    fx.worker.commit('initial', { 'README.md': 'fixture\n' })
    git.push('origin', 'main')
    branch('g', 'main', { 'g.txt': 'g\n' })
    branch('p', 'g', { 'p.txt': 'p\n' })
    branch('c', 'p', { 'c.txt': 'c\n' })
    git.checkout('main')
    fx.worker.commit('main moves', { 'm.txt': 'm\n' })
    git.push('origin', 'main')
    git.fetch('origin')
  })
  afterEach(() => fx.cleanup())

  const tip = (name: string) => {
    fx.worker.git.fetch('origin')
    return fx.worker.git.resolveRef(`origin/${name}`)!
  }

  async function run(patch: Partial<UpdateArgs>, ports: Partial<Ports> = {}) {
    calls = []
    const real = spawnRunner('git')
    const git: CommandRunner = {
      run: (argv, opts) => {
        calls.push(argv)
        return real.run(argv, { ...opts, env: { ...IDENTITY, ...opts.env } })
      },
    }
    const prs: CodeHostPrDetail[] = (
      [
        [1, 'g', 'main'],
        [2, 'p', 'g'],
        [3, 'c', 'p'],
      ] as const
    ).map(([number, head, base]) => ({
      number,
      title: head,
      url: `https://github.com/o/r/pull/${number}`,
      baseRef: base,
      headRef: head,
      headSha: fx.worker.git.resolveRef(`origin/${head}`)!,
      isDraft: false,
      labels: [],
      reviewCount: 0,
      isCrossRepository: false,
    }))
    return runUpdate(
      { ...ARGS, repo: ['o/r'], restack: true, ...patch },
      {
        projectRoot: fx.worker.dir,
        dryRun: false,
        git,
        gh: UNREACHABLE_GH,
        codeHost: () =>
          ({ listPrDetails: () => ({ ok: true, value: prs }) }) as unknown as CodeHost,
        cfg: cfg(),
        ports: fakePorts({ locate: () => fx.worker.dir, ...ports }),
      },
    )
  }

  test.each(['rebase', 'merge'] as const)(
    "--apply --strategy %s updates every level in one run, each onto its parent's new head",
    async (strategy) => {
      const before = { g: tip('g'), p: tip('p'), c: tip('c') }
      const out = await run({ apply: true, strategy })
      expect(out.results.map((r) => [r.number, r.status, r.pushed, r.restackedOnto])).toEqual([
        [1, 'updated', true, undefined],
        [2, 'updated', true, 1],
        [3, 'updated', true, 2],
      ])
      expect(out.skipped).toEqual([])
      const { git } = fx.worker
      const after = { g: tip('g'), p: tip('p'), c: tip('c') }
      expect(git.isAncestor(tip('main'), after.g)).toBe(true)
      expect(git.isAncestor(after.g, after.p)).toBe(true)
      expect(git.isAncestor(after.p, after.c)).toBe(true)
      expect(after).not.toEqual(before)
      if (strategy === 'rebase') {
        // Each child replays only its own commit, from its parent's old head.
        expect(calls).toContainEqual(['rebase', '--onto', after.g, before.g])
        expect(calls).toContainEqual(['rebase', '--onto', after.p, before.p])
        expect(git.aheadBehind(after.p, after.c)).toEqual({ ahead: 1, behind: 0 })
      }
    },
  )

  test('a rehearsal builds every level on the one before and pushes nothing', async () => {
    const before = { g: tip('g'), p: tip('p'), c: tip('c') }
    const out = await run({ apply: false, strategy: 'rebase' })
    expect(out.results.map((r) => [r.number, r.status, r.pushed, r.restackedOnto])).toEqual([
      [1, 'updated', false, undefined],
      [2, 'updated', false, 1],
      [3, 'updated', false, 2],
    ])
    expect({ g: tip('g'), p: tip('p'), c: tip('c') }).toEqual(before)
  })

  test('without --restack, the children wait for the next run', async () => {
    const out = await run({ apply: true, strategy: 'merge', restack: false })
    expect(out.results.map((r) => r.number)).toEqual([1])
    expect(out.skipped.map((s) => [s.number, s.reason])).toEqual([
      [2, 'blocked on #1'],
      [3, 'blocked on #1'],
    ])
  })

  test('a declined parent push holds every level below it back', async () => {
    const out = await run(
      { apply: true, strategy: 'rebase', confirmPush: true },
      { confirmPush: () => false },
    )
    expect(out.results.map((r) => [r.number, r.pushed])).toEqual([[1, false]])
    expect(out.skipped.map((s) => [s.number, s.reason])).toEqual([
      [2, 'blocked on #1; parent #1 was not pushed (push declined)'],
      [3, 'blocked on #2; parent #2 was not updated'],
    ])
  })

  test('--branch on the top PR restacks the whole stack under it', async () => {
    const out = await run({ apply: true, strategy: 'merge', branch: 'c' })
    expect(out.results.map((r) => [r.number, r.status])).toEqual([
      [1, 'updated'],
      [2, 'updated'],
      [3, 'updated'],
    ])
  })
})
