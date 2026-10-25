/**
 * Process liveness: a lock held by a dead process no longer blocks a
 * worktree, and a live process working inside one does.
 *
 * The engine is tested with a fake {@link ProcessProbe}; the default probe is
 * tested against canned `ps` and `lsof` output in the macOS and Linux shapes.
 * Worktrees are real, on disk.
 */

import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import { sh } from './helpers.ts'
import { applyPlan } from '../src/apply.ts'
import { PLAN_VERSION, planRepo, type Plan } from '../src/plan.ts'
import {
  defaultProcessProbe,
  isIdleShell,
  parseLockOwner,
  parseLsofCwd,
  type ProcessHolder,
  type ProcessProbe,
} from '../src/processes.ts'
import type { Receipt, RowRef } from '../src/receipt.ts'
import { sweepRepo } from '../src/sweep.ts'
import type { SweepItem } from '../src/types.ts'

const LOCK = 'claude agent agent-x (pid 99999 start 2026-01-01)'

interface FakeProbe extends ProcessProbe {
  aliveCalls: Array<[number, string | undefined]>
}

/** A probe answering from tables. `alive` may be a function to change its mind between calls. */
function fakeProbe(
  opts: {
    alive?: boolean | ((call: number, pid: number, startedAt?: string) => boolean)
    holders?: ProcessHolder[]
  } = {},
): FakeProbe {
  const aliveCalls: Array<[number, string | undefined]> = []
  const alive = opts.alive ?? false
  return {
    aliveCalls,
    alive(pid, startedAt) {
      aliveCalls.push([pid, startedAt])
      return typeof alive === 'function' ? alive(aliveCalls.length, pid, startedAt) : alive
    },
    holders: () => opts.holders ?? [],
  }
}

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

interface Fixture {
  root: string
  worktree: string
  /** A `gh` that reports the worktree's branch as merged at its tip. */
  gh: CommandRunner
}

/** A `gh` that answers `pr list` with one merged PR and fails everything else. */
function mergedGh(branch: string, oid: string): CommandRunner {
  const rows = [
    {
      number: 1,
      state: 'MERGED',
      headRefName: branch,
      headRefOid: oid,
      baseRefName: 'main',
      isCrossRepository: false,
      mergedAt: '2020-01-02T00:00:00Z',
      title: 'PR 1',
      url: 'https://example.invalid/pull/1',
    },
  ]
  return {
    run(argv) {
      const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' })
      if (argv[0] === '--version' || argv[0] === 'auth') return ok()
      if (argv[0] === 'pr' && argv[1] === 'list') return ok(JSON.stringify(rows))
      return { exitCode: 1, stdout: '', stderr: 'not canned' }
    },
  }
}

/** A worktree `wt-a` on `wt-branch` with a merged PR at its tip: clean and landed. */
function buildFixture(): Fixture {
  const pair = makeBareAndWorker()
  cleanups.push(pair.cleanup)
  const root = pair.worker.dir
  sh(root, ['commit', '--allow-empty', '-m', 'initial'])
  sh(root, ['push', '-q', '-u', 'origin', 'main'])
  const worktree = join(pair.parent, 'wt-a')
  sh(root, ['worktree', 'add', '-q', '-b', 'wt-branch', worktree, 'main'])
  const gh = mergedGh('wt-branch', sh(worktree, ['rev-parse', 'HEAD']))
  return { root, worktree: realpathSync(worktree), gh }
}

function worktreeItem(fx: Fixture, probe: ProcessProbe): SweepItem {
  const sweep = sweepRepo(fx.root, { gh: fx.gh, cwd: fx.root, probe, scope: ['worktrees'] })
  expect(sweep.error).toBeNull()
  const item = sweep.items.find((it) => it.id === fx.worktree)
  expect(item).toBeDefined()
  return item!
}

const lock = (fx: Fixture, reason: string): void => {
  sh(fx.root, ['worktree', 'lock', '--reason', reason, fx.worktree])
}

describe('lock owner', () => {
  test('AC-1: a lock whose owner is dead is stale and does not block', () => {
    const fx = buildFixture()
    lock(fx, LOCK)
    const probe = fakeProbe({ alive: false })
    const item = worktreeItem(fx, probe)
    expect(item.classification).toBe('safe-to-delete')
    expect(item.deletable).toBe(true)
    expect(item.facts['stale_lock']).toBe(true)
    expect(item.facts['blockers']).toEqual([])
    expect(item.facts['lock_owner']).toEqual({ pid: 99999, started_at: '2026-01-01' })
    // The row shows the unlock before the remove that would otherwise refuse.
    expect(item.commands).toHaveLength(2)
    expect(item.commands[0]).toContain('worktree unlock')
    expect(item.commands[1]).toContain('worktree remove')
    expect(probe.aliveCalls).toEqual([[99999, '2026-01-01']])
  })

  test('AC-2: a lock whose owner is alive still blocks', () => {
    const fx = buildFixture()
    lock(fx, LOCK)
    const item = worktreeItem(fx, fakeProbe({ alive: true }))
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['blockers']).toEqual(['locked-worktree'])
    expect(item.facts['stale_lock']).toBeUndefined()
    expect(item.deletable).toBe(false)
  })

  test('AC-3: a free-form lock reason with no pid token still blocks', () => {
    const fx = buildFixture()
    lock(fx, 'keep this one, the build is running')
    const probe = fakeProbe({ alive: false })
    const item = worktreeItem(fx, probe)
    expect(item.facts['blockers']).toEqual(['locked-worktree'])
    expect(probe.aliveCalls).toEqual([])
  })

  test('a lock with no reason at all still blocks', () => {
    const fx = buildFixture()
    sh(fx.root, ['worktree', 'lock', fx.worktree])
    const item = worktreeItem(fx, fakeProbe({ alive: false }))
    expect(item.facts['blockers']).toEqual(['locked-worktree'])
  })

  test('a stale lock does not hide other evidence: an unpushed commit still needs a grant', () => {
    const fx = buildFixture()
    lock(fx, LOCK)
    sh(fx.worktree, ['commit', '--allow-empty', '-m', 'unpushed'])
    const item = worktreeItem(fx, fakeProbe({ alive: false }))
    expect(item.facts['stale_lock']).toBe(true)
    expect(item.classification).toBe('needs-investigation')
    expect(item.requires).toContain('abandon-unmerged')
  })
})

describe('parseLockOwner', () => {
  test.each([
    ['claude agent agent-x (pid 99999 start 2026-01-01)', { pid: 99999, startedAt: '2026-01-01' }],
    [
      'agent (pid 42 start Sat Oct 25 18:22:19 2026) extra',
      { pid: 42, startedAt: 'Sat Oct 25 18:22:19 2026' },
    ],
    ['pid 7', { pid: 7 }],
    ['held by pid 7 start 1761416539', { pid: 7, startedAt: '1761416539' }],
    ['runner (pid 12)', { pid: 12 }],
  ])('%s', (reason, owner) => {
    expect(parseLockOwner(reason)).toEqual(owner)
  })

  test.each([[null], [''], ['no owner here'], ['rapid 12'], ['pid abc'], ['pid 0']])(
    'no owner in %s',
    (reason) => {
      expect(parseLockOwner(reason)).toBeNull()
    },
  )
})

describe('live processes', () => {
  test('AC-5: a live non-shell holder blocks an unlocked, clean, landed worktree', () => {
    const fx = buildFixture()
    const item = worktreeItem(fx, fakeProbe({ holders: [{ pid: 4242, command: 'node' }] }))
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['blockers']).toEqual(['live-process'])
    expect(item.facts['live_processes']).toEqual([{ pid: 4242, command: 'node' }])
    expect(item.deletable).toBe(false)
    expect(item.investigationParts[0]).toContain('node (pid 4242)')
  })

  test('AC-5: only shells do not block, and are listed in idle_shells', () => {
    const fx = buildFixture()
    const shells = [
      { pid: 10, command: 'zsh' },
      { pid: 11, command: '-bash' },
    ]
    const item = worktreeItem(fx, fakeProbe({ holders: shells }))
    expect(item.classification).toBe('safe-to-delete')
    expect(item.facts['blockers']).toEqual([])
    expect(item.facts['idle_shells']).toEqual(shells)
  })

  test('a shell beside a real process: the process blocks and both are listed', () => {
    const fx = buildFixture()
    const item = worktreeItem(
      fx,
      fakeProbe({
        holders: [
          { pid: 10, command: 'fish' },
          { pid: 11, command: 'claude' },
        ],
      }),
    )
    expect(item.facts['blockers']).toEqual(['live-process'])
    expect(item.facts['idle_shells']).toEqual([{ pid: 10, command: 'fish' }])
  })

  test('a live process blocks a stale-locked worktree too', () => {
    const fx = buildFixture()
    lock(fx, LOCK)
    const item = worktreeItem(
      fx,
      fakeProbe({ alive: false, holders: [{ pid: 4242, command: 'node' }] }),
    )
    expect(item.facts['stale_lock']).toBe(true)
    expect(item.facts['blockers']).toEqual(['live-process'])
  })

  test('a probe that cannot read the process table leaves a note and does not block', () => {
    const fx = buildFixture()
    const probe: ProcessProbe = {
      alive: () => false,
      holders: () => {
        throw new Error('lsof did not run')
      },
    }
    const item = worktreeItem(fx, probe)
    expect(item.facts['process_probe_error']).toBe('lsof did not run')
    expect(item.classification).toBe('safe-to-delete')
  })

  test('isIdleShell', () => {
    for (const name of ['sh', 'bash', 'zsh', 'fish', '-zsh']) expect(isIdleShell(name)).toBe(true)
    for (const name of ['node', 'bashful', 'claude', 'vim']) expect(isIdleShell(name)).toBe(false)
  })
})

describe('apply', () => {
  function makePlan(fx: Fixture, probe: ProcessProbe): Plan {
    const { repo, items } = sweepRepo(fx.root, { gh: fx.gh, cwd: fx.root, probe })
    return {
      version: PLAN_VERSION,
      created_at: new Date().toISOString(),
      repos: [planRepo(repo!.root, { remote: null, noGh: false }, items)],
    }
  }

  function apply(fx: Fixture, plan: Plan, probe: ProcessProbe, dryRun = false): Receipt {
    return applyPlan(plan, [row(fx)], [], {
      callerCwd: fx.root,
      dryRun,
      receiptPath: join(fx.root, '.receipts', 'test.json'),
      planPath: 'plan.json',
      gh: fx.gh,
      probe,
    })
  }

  const row = (fx: Fixture): RowRef => ({ category: 'worktree', id: fx.worktree })
  const locked = (fx: Fixture): boolean =>
    sh(fx.root, ['worktree', 'list', '--porcelain']).includes('\nlocked')

  test('AC-6: unlocks, removes and verifies a stale-locked worktree', () => {
    const fx = buildFixture()
    lock(fx, LOCK)
    const probe = fakeProbe({ alive: false })
    const receipt = apply(fx, makePlan(fx, probe), probe)
    expect(receipt.dropped).toEqual([])
    expect(receipt.steps.map((s) => [s.action, s.result])).toEqual([
      ['unlock-worktree', 'ok'],
      ['remove-worktree', 'ok'],
      ['prune-worktrees', 'ok'],
    ])
    expect(receipt.steps[0]!.verification).toBe('lock owner dead, unlocked')
    expect(receipt.status).toBe('complete')
    expect(existsSync(fx.worktree)).toBe(false)
    expect(JSON.parse(readFileSync(join(fx.root, '.receipts', 'test.json'), 'utf-8')).status).toBe(
      'complete',
    )
  })

  test('AC-6: a dry run lists the unlock and touches nothing', () => {
    const fx = buildFixture()
    lock(fx, LOCK)
    const probe = fakeProbe({ alive: false })
    const receipt = apply(fx, makePlan(fx, probe), probe, true)
    expect(receipt.steps.map((s) => [s.action, s.result])).toEqual([
      ['unlock-worktree', 'would-run'],
      ['remove-worktree', 'would-run'],
      ['prune-worktrees', 'would-run'],
    ])
    expect(locked(fx)).toBe(true)
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('AC-6: if the owner is alive at apply time the row is dropped and nothing is touched', () => {
    const fx = buildFixture()
    lock(fx, LOCK)
    const plan = makePlan(fx, fakeProbe({ alive: false }))
    expect(plan.repos[0]!.rows.map((r) => r.id)).toContain(fx.worktree)
    const receipt = apply(fx, plan, fakeProbe({ alive: true }))
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped.map((d) => [d.reason, d.detail])).toEqual([
      ['not-deletable', 'blocked: locked-worktree'],
    ])
    expect(locked(fx)).toBe(true)
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('AC-6: an owner that returns between the re-sweep and the unlock keeps its lock', () => {
    const fx = buildFixture()
    lock(fx, LOCK)
    const plan = makePlan(fx, fakeProbe({ alive: false }))
    // Dead for the re-sweep, alive for the check just before the unlock.
    const probe = fakeProbe({ alive: (call) => call > 1 })
    const receipt = apply(fx, plan, probe)
    expect(receipt.status).toBe('failed')
    expect(receipt.steps[0]!.action).toBe('unlock-worktree')
    expect(receipt.steps[0]!.result).toBe('failed')
    expect(receipt.steps[0]!.error).toContain('pid 99999 is alive')
    expect(locked(fx)).toBe(true)
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a lock taken after planning drops the row', () => {
    const fx = buildFixture()
    const probe = fakeProbe({ alive: false })
    const plan = makePlan(fx, probe)
    lock(fx, LOCK)
    const receipt = apply(fx, plan, probe)
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['facts-changed'])
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a stale-locked worktree whose directory is gone is unlocked, then pruned', () => {
    const fx = buildFixture()
    lock(fx, LOCK)
    const probe = fakeProbe({ alive: false })
    rmSync(fx.worktree, { recursive: true, force: true })
    const receipt = apply(fx, makePlan(fx, probe), probe)
    expect(receipt.steps.map((s) => [s.action, s.result])).toEqual([
      ['unlock-worktree', 'ok'],
      ['prune-worktrees', 'ok'],
      ['prune-worktrees', 'ok'],
    ])
    expect(sh(fx.root, ['worktree', 'list', '--porcelain'])).not.toContain(fx.worktree)
  })

  test('an unlocked worktree has no unlock step', () => {
    const fx = buildFixture()
    const probe = fakeProbe()
    const receipt = apply(fx, makePlan(fx, probe), probe)
    expect(receipt.steps.map((s) => s.action)).toEqual(['remove-worktree', 'prune-worktrees'])
  })
})

/** A fake runner that answers one argv with a canned result. */
function canned(answer: (argv: string[]) => Partial<CommandResult>): CommandRunner & {
  calls: string[][]
} {
  const calls: string[][] = []
  return {
    calls,
    run(argv) {
      calls.push(argv)
      return { exitCode: 0, stdout: '', stderr: '', ...answer(argv) }
    },
  }
}

/** `ps -o lstart= -p <pid>` prints the start time, or nothing and exit 1 for a gone pid. */
function fakePs(table: Record<number, string>): CommandRunner & { calls: string[][] } {
  return canned((argv) => {
    const started = table[Number(argv[argv.length - 1])]
    return started === undefined ? { exitCode: 1 } : { stdout: started }
  })
}

// Output of `ps -o lstart= -p N`. macOS pads nothing; procps on Linux pads a
// one-digit day with a space and ends the line with a newline.
const PS_MACOS = 'Sat Oct 25 18:22:19 2026\n'
const PS_LINUX = 'Mon Oct  5 09:01:02 2026\n'

// Output of `lsof -n -P -a -d cwd -Fpcn`.
const LSOF_MACOS = [
  'p501',
  'claunchd',
  'n/',
  'p2001',
  'czsh',
  'n/private/var/folders/ab/T/work/wt-a',
  'p2002',
  'cnode',
  'n/private/var/folders/ab/T/work/wt-a/packages/app',
  'p2003',
  'cnode',
  'n/private/var/folders/ab/T/work/wt-ab',
  '',
].join('\n')

const LSOF_LINUX = [
  'p1',
  'csystemd',
  'n/',
  'p3001',
  'cbash',
  'n/home/u/work/wt-a',
  'p3002',
  'cclaude',
  'n/home/u/work/wt-a/src',
  'p3003',
  'cvim',
  'n/home/u/work/wt-a (deleted)',
  '',
].join('\n')

describe('default probe: ps', () => {
  test.each([
    ['macOS', PS_MACOS, 'Sat Oct 25 18:22:19 2026'],
    ['Linux', PS_LINUX, 'Mon Oct 5 09:01:02 2026'],
  ])('%s: a live pid whose start time matches is alive', (_name, out, claimed) => {
    const ps = fakePs({ 321: out })
    const probe = defaultProcessProbe({ ps })
    expect(probe.alive(321)).toBe(true)
    expect(probe.alive(321, claimed)).toBe(true)
    expect(ps.calls[0]).toEqual(['-o', 'lstart=', '-p', '321'])
  })

  test('AC-4: a live pid whose start time differs from the lock counts as dead', () => {
    const probe = defaultProcessProbe({ ps: fakePs({ 321: PS_MACOS }) })
    expect(probe.alive(321, 'Sat Oct 25 08:00:00 2026')).toBe(false)
    expect(probe.alive(321, '2026-01-01')).toBe(false)
  })

  test('a start time given as epoch seconds is compared as one', () => {
    const probe = defaultProcessProbe({ ps: fakePs({ 321: PS_MACOS }) })
    const epoch = String(Date.parse('Sat Oct 25 18:22:19 2026') / 1000)
    expect(probe.alive(321, epoch)).toBe(true)
    expect(probe.alive(321, String(Number(epoch) + 3600))).toBe(false)
  })

  test('a start time that cannot be read as a time cannot rule the owner out', () => {
    const probe = defaultProcessProbe({ ps: fakePs({ 321: PS_LINUX }) })
    expect(probe.alive(321, 'sometime last week')).toBe(true)
  })

  test('a pid ps does not know is dead', () => {
    const probe = defaultProcessProbe({ ps: fakePs({}) })
    expect(probe.alive(99999)).toBe(false)
    expect(probe.alive(99999, '2026-01-01')).toBe(false)
  })

  test('a ps that cannot run cannot rule the owner out', () => {
    const ps = canned(() => ({ neverExited: true, reason: 'spawn', error: 'ENOENT' }))
    expect(defaultProcessProbe({ ps }).alive(321)).toBe(true)
  })
})

describe('default probe: lsof', () => {
  test('parseLsofCwd reads one record per process', () => {
    expect(parseLsofCwd(LSOF_LINUX).map((r) => [r.pid, r.command, r.cwd])).toEqual([
      [1, 'systemd', '/'],
      [3001, 'bash', '/home/u/work/wt-a'],
      [3002, 'claude', '/home/u/work/wt-a/src'],
      [3003, 'vim', '/home/u/work/wt-a (deleted)'],
    ])
  })

  test('macOS: processes at or below the path, and not a sibling that shares its prefix', () => {
    const lsof = canned(() => ({ stdout: LSOF_MACOS }))
    const probe = defaultProcessProbe({ lsof })
    expect(probe.holders('/private/var/folders/ab/T/work/wt-a')).toEqual([
      { pid: 2001, command: 'zsh' },
      { pid: 2002, command: 'node' },
    ])
    expect(lsof.calls[0]).toEqual(['-n', '-P', '-a', '-d', 'cwd', '-Fpcn'])
  })

  test('Linux: processes at or below the path', () => {
    const probe = defaultProcessProbe({ lsof: canned(() => ({ stdout: LSOF_LINUX })) })
    expect(probe.holders('/home/u/work/wt-a')).toEqual([
      { pid: 3001, command: 'bash' },
      { pid: 3002, command: 'claude' },
    ])
  })

  test('lsof exits 1 with partial output when it cannot read some processes; the rest count', () => {
    const lsof = canned(() => ({ exitCode: 1, stdout: LSOF_LINUX, stderr: 'lsof: WARNING: ...' }))
    expect(defaultProcessProbe({ lsof }).holders('/home/u/work/wt-a')).toHaveLength(2)
  })

  test('one lsof run answers every path in a sweep', () => {
    const lsof = canned(() => ({ stdout: LSOF_LINUX }))
    const probe = defaultProcessProbe({ lsof })
    probe.holders('/home/u/work/wt-a')
    probe.holders('/home/u/work/wt-b')
    expect(lsof.calls).toHaveLength(1)
  })

  test('an lsof that cannot run is an error, not an empty answer', () => {
    const lsof = canned(() => ({ neverExited: true, reason: 'spawn', error: 'ENOENT' }))
    expect(() => defaultProcessProbe({ lsof }).holders('/x')).toThrow('lsof did not run')
  })
})

describe('no raw child_process', () => {
  test('AC-7: nothing in src spawns a process except through the command seam', () => {
    const src = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src')
    for (const name of readdirSync(src).filter((f) => f.endsWith('.ts'))) {
      expect(readFileSync(join(src, name), 'utf-8'), name).not.toMatch(/child_process/)
    }
  })
})
