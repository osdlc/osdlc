/**
 * `check` and `run` on a worker repository with a bare remote.
 *
 * Fixture rows:
 *   - `merged-a`, `merged-b`: merged into main and pushed — safe to delete
 *     locally and on the remote, no risk to allow.
 *   - `unmerged`: one commit main lacks — needs `abandon-unmerged`.
 *   - worktree `wt-a` on `wt-branch` at main: clean, deletable.
 */

import { afterEach, describe, expect, test } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

import { Git, PUSH_REJECTIONS } from '@osdlc/typed-git'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import { cannedGh, sh } from './helpers.ts'
import {
  check,
  networkRemoteKey,
  resolveApproval,
  run,
  type Approval,
  type CheckOptions,
  type Preview,
  type RunOptions,
} from '../src/clean.ts'
import { PLAN_VERSION, parsePlan, plan, readPlan, writePlan, type Plan } from '../src/plan.ts'
import type { Receipt } from '../src/receipt.ts'
import { summarizeRun } from '../src/render.ts'
import { sweep, type SweepOptions } from '../src/sweep.ts'
import { RepoCleanerError, type ErrorCode, type Row, type Sweep } from '../src/types.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

interface Fixture {
  root: string
  bare: string
  worktree: string
}

function buildFixture(): Fixture {
  const pair = makeBareAndWorker()
  cleanups.push(pair.cleanup)
  const root = pair.worker.dir
  const commit = (msg: string): void => {
    sh(root, ['commit', '--allow-empty', '-m', msg])
  }
  commit('initial')
  sh(root, ['push', '-q', '-u', 'origin', 'main'])
  for (const name of ['merged-a', 'merged-b']) {
    sh(root, ['checkout', '-q', '-b', name])
    commit(`feat: ${name}`)
    sh(root, ['push', '-q', '-u', 'origin', name])
    sh(root, ['checkout', '-q', 'main'])
    sh(root, ['merge', '-q', '--no-ff', '-m', `Merge ${name}`, name])
  }
  sh(root, ['push', '-q', 'origin', 'main'])
  sh(root, ['checkout', '-q', '-b', 'unmerged'])
  commit('wip: unmerged')
  sh(root, ['checkout', '-q', 'main'])
  const worktree = join(pair.parent, 'wt-a')
  sh(root, ['worktree', 'add', '-q', '-b', 'wt-branch', worktree, 'main'])
  // git reports worktree paths resolved (`/private/var` on macOS).
  return { root, bare: pair.bare.dir, worktree: realpathSync(worktree) }
}

/** Commit on `wt-branch` in the worktree and merge it into main, so both can go. */
function mergeWorktreeBranch(fx: Fixture): void {
  sh(fx.worktree, ['commit', '--allow-empty', '-m', 'feat: worktree work'])
  sh(fx.root, ['merge', '-q', '--no-ff', '-m', 'Merge wt-branch', 'wt-branch'])
  sh(fx.root, ['push', '-q', 'origin', 'main'])
}

/** A sweep of every kind, remote branches judged on the refs on disk, no provider. */
function sweepOf(targets: string[], cwd: string, extra: SweepOptions = {}): Sweep {
  return sweep(targets, { remote: true, offline: true, provider: 'none', cwd, ...extra })
}

function makePlan(root: string, extra: SweepOptions = {}): Plan {
  return plan(sweepOf([root], root, extra))
}

/** The `wt` row's id. */
const wt = (path: string) => `worktree:${path}` as const

function preview(fx: Fixture, p: Plan, approval: Approval, opts: CheckOptions = {}): Preview {
  return check(p, approval, { cwd: fx.root, ...opts })
}

function apply(
  fx: Fixture,
  p: Plan,
  approval: Approval,
  opts: RunOptions = {},
): { receipt: Receipt; receiptPath: string } {
  const receiptPath = join(fx.root, '.receipts', 'test.json')
  const receipt = run(check(p, approval, { cwd: fx.root }), {
    cwd: fx.root,
    receiptPath,
    source: 'plan.json',
    ...opts,
  })
  return { receipt, receiptPath }
}

/** The error `fn` throws, which must be a {@link RepoCleanerError}. */
function refusal(fn: () => unknown): RepoCleanerError {
  try {
    fn()
  } catch (err) {
    if (err instanceof RepoCleanerError) return err
    throw err
  }
  throw new Error('expected a RepoCleanerError, but nothing was thrown')
}

function expectRefused(fn: () => unknown, code: ErrorCode, message?: RegExp | string): void {
  const err = refusal(fn)
  expect(err.code).toBe(code)
  if (message !== undefined) expect(err.message).toMatch(message)
}

const refs = (root: string): string =>
  sh(root, ['for-each-ref', '--format=%(refname) %(objectname)'])
const remoteHeads = (bare: string): string => sh(bare, ['for-each-ref', '--format=%(refname)'])

/** A fresh temp directory, removed after the test. */
function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

describe('check and run fetch as the plan did', () => {
  /** A plan of `merged-a`'s local row, and a push to `main` the worker has not fetched. */
  function setup(fetch: boolean) {
    const fx = buildFixture()
    const p = makePlan(fx.root, { offline: !fetch })
    const other = join(tempDir('rc-other-'), 'c')
    sh(dirname(other), ['clone', '-q', fx.bare, other])
    sh(other, ['commit', '-q', '--allow-empty', '-m', 'moved on'])
    sh(other, ['push', '-q', 'origin', 'main'])
    return { fx, plan: p, remoteMain: sh(fx.bare, ['rev-parse', 'main']) }
  }
  const runIt = (fx: Fixture, p: Plan) =>
    run(check(p, { pick: ['branch:merged-a'] }, { cwd: fx.root }), { cwd: fx.root })

  test("the run's own re-check reports a listing that fails only at the run", () => {
    const fx = buildFixture()
    const good = cannedGh([])
    const failing = cannedGh([], { listError: 'boom: rate limited' })
    const p = makePlan(fx.root, { provider: 'github', gh: good })
    const shown = check(p, { pick: ['branch:merged-a'] }, { cwd: fx.root, gh: good })
    expect(shown.notes).toEqual([])
    const heard: { repo: string; note: string }[] = []
    const receipt = run(shown, { cwd: fx.root, gh: failing, onNotes: (n) => heard.push(...n) })
    expect(receipt.status).toBe('complete')
    expect(heard).toHaveLength(1)
    expect(heard[0]?.repo).toBe(realpathSync(fx.root))
    expect(heard[0]?.note).toMatch(/^Listing PRs with `gh pr list` failed \(.*rate limited/)
  })

  test('a plan swept after a fetch is re-checked after one', () => {
    const { fx, plan: p, remoteMain } = setup(true)
    expect(p.repos[0]!.fetched).toBe(true)
    expect(runIt(fx, p).status).toBe('complete')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).toBe(remoteMain)
  })

  test('a plan that did not fetch is not fetched', () => {
    const { fx, plan: p, remoteMain } = setup(false)
    expect(p.repos[0]!.fetched).toBe(false)
    expect(runIt(fx, p).status).toBe('complete')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).not.toBe(remoteMain)
  })

  test('a plan repository marked fetched is fetched, whatever the sweep did', () => {
    const { fx, plan: p, remoteMain } = setup(false)
    p.repos[0]!.fetched = true
    expect(runIt(fx, p).status).toBe('complete')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).toBe(remoteMain)
  })

  test('a failed fetch fails the run before any step', () => {
    const { fx, plan: p } = setup(true)
    sh(fx.root, ['remote', 'set-url', 'origin', join(tmpdir(), 'rc-missing.git')])
    expect(() => runIt(fx, p)).toThrow(/fetch failed/)
    expect(refs(fx.root)).toContain('refs/heads/merged-a ')
  })

  test('a plan repository without the fetched field is refused', () => {
    expectRefused(
      () =>
        parsePlan(
          JSON.stringify({
            version: PLAN_VERSION,
            createdAt: 'x',
            options: {
              only: ['branch'],
              remote: false,
              offline: false,
              against: null,
              provider: 'none',
              branch: null,
            },
            repos: [{ root: '/r', rows: [] }],
          }),
          'old.json',
        ),
      'bad-plan',
      /bad plan old\.json/,
    )
  })
})

describe('sparing a remote branch (#583)', () => {
  const SPARE = 'remote:origin/merged-a'
  const LOCAL = 'branch:merged-a'

  /** A push to `merged-a` on the remote from another clone. */
  function moveRemote(fx: Fixture): string {
    const other = join(tempDir('rc-keep-'), 'c')
    sh(dirname(other), ['clone', '-q', '-b', 'merged-a', fx.bare, other])
    sh(other, ['commit', '-q', '--allow-empty', '-m', 'more'])
    sh(other, ['push', '-q', 'origin', 'merged-a'])
    return sh(fx.bare, ['rev-parse', 'merged-a'])
  }
  const runIt = (fx: Fixture, p: Plan, extra: RunOptions = {}) =>
    run(check(p, { pick: [LOCAL], spare: [SPARE] }, { cwd: fx.root }), {
      cwd: fx.root,
      source: 'plan.json',
      ...extra,
    })

  test('the remote branch stays, its tip checked first; the local branch goes', () => {
    const fx = buildFixture()
    const receipt = runIt(fx, makePlan(fx.root))
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => [s.action, s.result])).toEqual([
      ['verify-remote', 'ok'],
      ['delete-branch', 'ok'],
    ])
    expect(receipt.steps[0]!.verification).toBe('tip unchanged; spared')
    expect(remoteHeads(fx.bare)).toContain('refs/heads/merged-a')
    expect(refs(fx.root)).not.toContain('refs/heads/merged-a ')
    expect(summarizeRun(receipt).deleted).toEqual({ worktree: 0, branch: 1, remote: 0 })
  })

  test('a spared branch that moved since the plan refuses the run, touching nothing', () => {
    const fx = buildFixture()
    // Fetched, so the re-check sees the remote's tip rather than the ref on disk.
    const p = makePlan(fx.root, { offline: false })
    moveRemote(fx)
    expectRefused(
      () => runIt(fx, p),
      'spared-changed',
      /spared remote:origin\/merged-a moved since the plan/,
    )
    expect(refs(fx.root)).toContain('refs/heads/merged-a ')
  })

  test('one that moves after the re-check stops the run at its tip check', () => {
    const fx = buildFixture()
    let moved = ''
    const receipt = runIt(fx, makePlan(fx.root), { onStart: () => (moved = moveRemote(fx)) })
    expect(receipt.status).toBe('failed')
    expect(receipt.steps[0]!.action).toBe('verify-remote')
    expect(receipt.steps[0]!.error).toContain(`moved to ${moved}`)
    expect(receipt.steps[1]!.result).toBe('pending')
    expect(refs(fx.root)).toContain('refs/heads/merged-a ')
    expect(summarizeRun(receipt).notRun).toBe(1)
  })

  for (const offline of [false, true]) {
    test(`${offline ? 'offline' : 'online'}, one deleted on the remote after the re-check stops the run at its tip check`, () => {
      const fx = buildFixture()
      const gone = () => sh(fx.bare, ['update-ref', '-d', 'refs/heads/merged-a'])
      const receipt = runIt(fx, makePlan(fx.root, { offline }), { onStart: gone })
      expect(receipt.status).toBe('failed')
      expect(receipt.steps[0]!.error).toContain('is gone from origin')
      expect(receipt.steps[1]!.result).toBe('pending')
      expect(refs(fx.root)).toContain('refs/heads/merged-a ')
    })
  }

  test('offline, one the remote deleted after the plan refuses the run, and its local branch stays', () => {
    const fx = buildFixture()
    // The offline plan read the tracking ref; the re-check asks the remote.
    const p = makePlan(fx.root)
    sh(fx.bare, ['update-ref', '-d', 'refs/heads/merged-a'])
    expectRefused(
      () => runIt(fx, p),
      'spared-changed',
      /spared remote:origin\/merged-a is no longer on the remote; refusing to run/,
    )
    // The spared remote branch was the local work's backup: nothing is deleted.
    expect(refs(fx.root)).toContain('refs/heads/merged-a ')
  })

  test('spared through one clone, the branch is not deleted through another', () => {
    const fx = buildFixture()
    // The second clone names its remote `upstream`, so `remote:origin/merged-a` names one row.
    const second = tempDir('repo-cleaner-clone-')
    sh(second, ['clone', '-q', '-o', 'upstream', fx.bare, 'b'])
    // As git reports them: macOS puts the temp dir behind a symlink (/var to /private/var).
    const [rootA, rootB] = [realpathSync(fx.root), join(second, 'b')]
    const p = plan(sweepOf([rootA, rootB], fx.root))
    expect(p.repos.map((r) => r.root).sort()).toEqual([rootA, rootB].sort())
    const receipt = run(check(p, { spare: [SPARE] }, { cwd: fx.root }), {
      cwd: fx.root,
      source: '(test)',
    })
    expect(receipt.status).toBe('complete')
    expect(remoteHeads(fx.bare)).toContain('refs/heads/merged-a')
    expect(receipt.dropped).toContainEqual({
      repo: rootB,
      row: 'remote:upstream/merged-a',
      reason: 'spared',
      detail: `the same remote branch is spared through ${rootA}`,
    })
    expect(receipt.steps.some((s) => s.action === 'delete-remote' && s.row === SPARE)).toBe(false)
    expect(
      receipt.steps.some(
        (s) => s.action === 'delete-remote' && s.row === 'remote:upstream/merged-a',
      ),
    ).toBe(false)
  })

  test('the spare check is the tip alone: PR facts that changed do not refuse it', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const row = p.repos[0]!.rows.find((r) => r.id === SPARE)!
    // As if the plan had seen an open PR that has since closed: same sha, other facts.
    row.fingerprint = { ...row.fingerprint, prNumber: 7, prState: 'OPEN' }
    expect(runIt(fx, p).status).toBe('complete')
    expect(remoteHeads(fx.bare)).toContain('refs/heads/merged-a')
  })

  test('a spared row with no planned tip is refused rather than checked against nothing', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const row = p.repos[0]!.rows.find((r) => r.id === SPARE)!
    const { sha: _sha, ...rest } = row.fingerprint
    row.fingerprint = rest
    expectRefused(
      () => runIt(fx, p),
      'spared-changed',
      /spared remote:origin\/merged-a moved since the plan \(planned undefined/,
    )
    expect(refs(fx.root)).toContain('refs/heads/merged-a ')
  })

  test('a row cannot be both picked and spared', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    expectRefused(
      () => preview(fx, p, { pick: [LOCAL, SPARE], spare: [SPARE] }),
      'conflict',
      /both picked and spared/,
    )
  })

  test('with no rows picked, every other row applies and the spared one is checked', () => {
    const fx = buildFixture()
    const p = preview(fx, makePlan(fx.root), { spare: [SPARE] })
    expect(p.steps[0]!.action).toBe('verify-remote')
    expect(p.steps.some((s) => s.action === 'delete-remote' && s.row === SPARE)).toBe(false)
    expect(p.steps.some((s) => s.action === 'delete-branch' && s.row === LOCAL)).toBe(true)
  })
})

describe('sparing a worktree or a local branch', () => {
  test('a spared local branch is not deleted; the rest of the plan runs', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const shown = preview(fx, p, { spare: ['branch:merged-a'] })
    expect(shown.steps.some((s) => s.row === 'branch:merged-a')).toBe(false)
    expect(shown.dropped.some((d) => d.row === 'branch:merged-a')).toBe(false)
    expect(shown.steps.some((s) => s.row === 'branch:merged-b')).toBe(true)

    const receipt = run(shown, { cwd: fx.root })
    expect(receipt.status).toBe('complete')
    expect(refs(fx.root)).toContain('refs/heads/merged-a ')
    expect(refs(fx.root)).not.toContain('refs/heads/merged-b ')
    // A spared local branch has no tip check; that is for remote branches.
    expect(receipt.steps.some((s) => s.action === 'verify-remote')).toBe(false)
  })

  test('a spared worktree stays, and holds the branch it would have freed', () => {
    const fx = buildFixture()
    mergeWorktreeBranch(fx)
    const p = makePlan(fx.root)
    expect(p.repos[0]!.rows.map((r) => r.id)).toEqual(
      expect.arrayContaining([wt(fx.worktree), 'branch:wt-branch']),
    )
    const shown = preview(fx, p, { spare: [wt(fx.worktree)] })
    expect(shown.steps.some((s) => s.row === wt(fx.worktree))).toBe(false)
    expect(shown.dropped.filter((d) => d.row === 'branch:wt-branch')).toEqual([
      {
        repo: p.repos[0]!.root,
        row: 'branch:wt-branch',
        reason: 'held',
        detail: `checked out in ${fx.worktree}, which this run does not remove`,
      },
    ])

    const receipt = run(shown, { cwd: fx.root })
    expect(receipt.status).toBe('complete')
    expect(existsSync(fx.worktree)).toBe(true)
    expect(refs(fx.root)).toContain('refs/heads/wt-branch ')
  })

  test('the same worktree picked rather than spared goes, its branch with it', () => {
    const fx = buildFixture()
    mergeWorktreeBranch(fx)
    const p = makePlan(fx.root)
    const shown = preview(fx, p, { pick: [wt(fx.worktree), 'branch:wt-branch'] })
    expect(shown.dropped).toEqual([])
    expect(shown.steps.map((s) => s.row)).toEqual([wt(fx.worktree), 'branch:wt-branch'])
  })
})

describe('naming rows', () => {
  test('a bare name picks the one row that has it', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const shown = preview(fx, p, { pick: ['merged-a'] })
    expect(shown.approval.pick).toEqual([{ repo: p.repos[0]!.root, id: 'branch:merged-a' }])
    expect(shown.steps.map((s) => [s.action, s.row])).toEqual([
      ['delete-branch', 'branch:merged-a'],
    ])
  })

  test('a remote branch by bare name, and a worktree by its path or a path relative to cwd', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const root = p.repos[0]!.root
    expect(resolveApproval(p, { pick: ['origin/merged-a'] }, fx.root).pick).toEqual([
      { repo: root, id: 'remote:origin/merged-a' },
    ])
    for (const path of [fx.worktree, relative(fx.root, fx.worktree)]) {
      expect(resolveApproval(p, { pick: [path] }, fx.root).pick).toEqual([
        { repo: root, id: wt(fx.worktree) },
      ])
    }
  })

  test('a name two plan repositories share is ambiguous, by bare name and by id', () => {
    const a = buildFixture()
    const b = buildFixture()
    const p = plan(sweepOf([a.root, b.root], a.root))
    for (const name of ['merged-a', 'branch:merged-a']) {
      expectRefused(() => preview(a, p, { pick: [name] }), 'ambiguous', /matches 2 rows/)
      expectRefused(() => preview(a, p, { spare: [name] }), 'ambiguous')
      expectRefused(
        () => preview(a, p, { allow: [{ risk: 'abandon-unmerged', row: name }] }),
        'ambiguous',
      )
    }
  })
})

describe('unusedAllows', () => {
  test('lists the allows no row that runs carries', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const shown = preview(fx, p, {
      pick: ['branch:merged-a', 'branch:unmerged'],
      allow: [
        'abandon-unmerged',
        'discard-changes',
        { risk: 'abandon-unmerged', row: 'branch:merged-a' },
      ],
    })
    expect(shown.steps.map((s) => s.row)).toEqual(['branch:merged-a', 'branch:unmerged'])
    expect(shown.unusedAllows).toEqual([
      { risk: 'discard-changes', row: null },
      { risk: 'abandon-unmerged', row: 'branch:merged-a' },
    ])
  })

  test('an allow for a row that is dropped is unused', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    sh(fx.root, ['branch', '-D', 'unmerged'])
    const shown = preview(fx, p, {
      pick: ['branch:unmerged'],
      allow: [{ risk: 'abandon-unmerged', row: 'branch:unmerged' }],
    })
    expect(shown.dropped.map((d) => d.reason)).toEqual(['gone'])
    expect(shown.unusedAllows).toEqual([{ risk: 'abandon-unmerged', row: 'branch:unmerged' }])
  })

  test('none when every allow is used', () => {
    const fx = buildFixture()
    const shown = preview(fx, makePlan(fx.root), {
      pick: ['branch:unmerged'],
      allow: ['abandon-unmerged'],
    })
    expect(shown.unusedAllows).toEqual([])
  })
})

describe('resolveApproval refuses', () => {
  /** A hand-built plan of one repository. */
  function handPlan(options: Partial<Plan['options']> = {}): Plan {
    const row = (id: string) =>
      ({
        id,
        verdict: 'delete',
        action: 'delete',
        risks: [],
        fingerprint: {},
      }) as Plan['repos'][number]['rows'][number]
    return {
      version: PLAN_VERSION,
      createdAt: 'x',
      options: {
        only: ['worktree', 'branch', 'remote'],
        remote: true,
        offline: true,
        against: null,
        provider: 'none',
        branch: null,
        ...options,
      },
      repos: [
        {
          root: '/r',
          fetched: false,
          rows: [row('branch:feat/x'), row('branch:feat/y'), row('remote:origin/feat/x')],
        },
      ],
    }
  }
  const resolve = (approval: Approval, p: Plan = handPlan()) => resolveApproval(p, approval, '/r')

  test('resolves rows by id and by bare name, each once', () => {
    expect(
      resolve({
        pick: ['branch:feat/x', 'feat/x', 'remote:origin/feat/x'],
        spare: ['feat/y'],
        allow: ['confirm-open-pr', { risk: 'abandon-unmerged', row: 'feat/x' }],
      }),
    ).toEqual({
      pick: [
        { repo: '/r', id: 'branch:feat/x' },
        { repo: '/r', id: 'remote:origin/feat/x' },
      ],
      spare: [{ repo: '/r', id: 'branch:feat/y' }],
      allow: [
        { risk: 'confirm-open-pr', row: null },
        { risk: 'abandon-unmerged', row: { repo: '/r', id: 'branch:feat/x' } },
      ],
    })
  })

  test('a bare path holding a colon is a bare name, not a kind', () => {
    const p = handPlan()
    p.repos[0]!.rows.push({ ...p.repos[0]!.rows[0]!, id: 'worktree:/w/a:b' })
    expect(resolveApproval(p, { pick: ['/w/a:b'] }, '/').pick).toEqual([
      { repo: '/r', id: 'worktree:/w/a:b' },
    ])
  })

  test('bad-input: an unknown kind, a kind with no name, an empty row, an unknown risk', () => {
    expectRefused(() => resolve({ pick: ['tag:v1'] }), 'bad-input', /expected <kind>:<name>/)
    expectRefused(() => resolve({ pick: ['branch:'] }), 'bad-input', /no name/)
    expectRefused(() => resolve({ spare: [''] }), 'bad-input', /empty row/)
    expectRefused(
      () => resolve({ allow: ['delete-everything' as 'abandon-unmerged'] }),
      'bad-input',
      /unknown risk "delete-everything"/,
    )
  })

  test('conflict: a row both picked and spared', () => {
    expectRefused(
      () => resolve({ pick: ['feat/x'], spare: ['branch:feat/x'] }),
      'conflict',
      'branch:feat/x is both picked and spared',
    )
  })

  test('conflict: an allow for a spared row, or for a row outside the pick', () => {
    expectRefused(
      () =>
        resolve({ spare: ['feat/y'], allow: [{ risk: 'abandon-unmerged', row: 'branch:feat/y' }] }),
      'conflict',
      /branch:feat\/y is spared/,
    )
    expectRefused(
      () =>
        resolve({ pick: ['feat/x'], allow: [{ risk: 'abandon-unmerged', row: 'branch:feat/y' }] }),
      'conflict',
      /branch:feat\/y is not picked/,
    )
    // With no pick every row is selected, so an allow for any unspared row stands.
    expect(resolve({ allow: [{ risk: 'abandon-unmerged', row: 'feat/y' }] }).allow).toEqual([
      { risk: 'abandon-unmerged', row: { repo: '/r', id: 'branch:feat/y' } },
    ])
  })

  test('conflict: a row of a kind the plan did not sweep', () => {
    const p = handPlan({ only: ['branch'] })
    for (const approval of [
      { pick: ['worktree:/w'] },
      { spare: ['remote:origin/feat/x'] },
      { allow: [{ risk: 'discard-changes' as const, row: 'worktree:/w' }] },
    ]) {
      expectRefused(() => resolve(approval, p), 'conflict', /the sweep has no \w+ rows/)
    }
  })

  test('conflict: a branch or remote row that is not the plan branch', () => {
    const p = handPlan({ branch: 'feat/x' })
    expectRefused(
      () => resolve({ pick: ['branch:feat/y'] }, p),
      'conflict',
      /is not a row of --branch feat\/x/,
    )
    expectRefused(
      () => resolve({ spare: ['remote:origin/feat/y'] }, p),
      'conflict',
      /is not a row of --branch feat\/x/,
    )
    expect(resolve({ pick: ['branch:feat/x', 'remote:origin/feat/x'] }, p).pick).toHaveLength(2)
  })

  test('not-found: a row the plan does not have', () => {
    for (const approval of [
      { pick: ['branch:main'] },
      { spare: ['nope'] },
      { allow: [{ risk: 'abandon-unmerged' as const, row: 'remote:origin/nope' }] },
    ]) {
      expectRefused(() => resolve(approval), 'not-found', /no such row in the plan/)
    }
  })

  test('ambiguous: a bare name two rows share, or an id in two repositories', () => {
    const p = handPlan()
    p.repos.push({ ...p.repos[0]!, root: '/s' })
    expectRefused(() => resolve({ pick: ['branch:feat/y'] }, p), 'ambiguous', /matches 2 rows/)
    // One repository, two kinds: `x` is both a branch and a remote's name.
    const q = handPlan()
    q.repos[0]!.rows.push({ ...q.repos[0]!.rows[0]!, id: 'remote:feat/x' })
    expectRefused(() => resolve({ pick: ['feat/x'] }, q), 'ambiguous')
    expect(resolve({ pick: ['branch:feat/x'] }, q).pick).toEqual([
      { repo: '/r', id: 'branch:feat/x' },
    ])
  })

  test('check refuses before sweeping anything', () => {
    // `/r` is no repository: a refusal must come before any re-sweep reads it.
    expectRefused(() => check(handPlan(), { pick: ['branch:main'] }, { cwd: '/' }), 'not-found')
  })
})

describe('check and run', () => {
  test('onStepDone hears each finished step, even when the receipt then cannot be saved', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const receiptDir = join(fx.root, '.receipts')
    const done: string[] = []
    const runIt = () =>
      run(check(p, { pick: ['branch:merged-a'] }, { cwd: fx.root }), {
        cwd: fx.root,
        receiptPath: join(receiptDir, 'r.json'),
        source: 'plan.json',
        // The receipt is saved once before the first step; lock its directory
        // once that has happened, so the save after the step fails.
        onStep: () => chmodSync(receiptDir, 0o500),
        onStepDone: (_i, _n, step) => done.push(`${step.action}:${step.result}`),
      })
    cleanups.push(() => chmodSync(receiptDir, 0o700))
    expect(runIt).toThrow()
    expect(done).toEqual(['delete-branch:ok'])
  })

  test('runs worktree, local, remote in order and verifies each', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const { receipt, receiptPath } = apply(fx, p, {
      pick: ['remote:origin/merged-a', 'branch:merged-a', wt(fx.worktree)],
    })

    expect(receipt.status).toBe('complete')
    expect(receipt.dropped).toEqual([])
    expect(receipt.steps.map((s) => s.action)).toEqual([
      'remove-worktree',
      'delete-branch',
      'delete-remote',
    ])
    expect(receipt.steps.every((s) => s.result === 'ok')).toBe(true)
    expect(existsSync(fx.worktree)).toBe(false)
    expect(refs(fx.root)).not.toContain('refs/heads/merged-a ')
    expect(remoteHeads(fx.bare)).not.toContain('refs/heads/merged-a')
    expect(new Git(fx.root).configGet('branch.merged-a.remote')).toBeNull()
    const saved = JSON.parse(readFileSync(receiptPath, 'utf-8')) as Receipt
    expect(saved).toMatchObject({ version: 2, plan: 'plan.json', status: 'complete' })
    expect(saved.steps[1]).toMatchObject({
      row: 'branch:merged-a',
      action: 'delete-branch',
      expectedSha: expect.stringMatching(/^[0-9a-f]{40}$/),
    })
  })

  test('removes a merged worktree and deletes its branch in one run', () => {
    const fx = buildFixture()
    mergeWorktreeBranch(fx)
    const p = makePlan(fx.root)
    const { receipt } = apply(fx, p, { pick: ['branch:wt-branch', wt(fx.worktree)] })

    expect(receipt.dropped).toEqual([])
    expect(receipt.steps.map((s) => [s.action, s.result])).toEqual([
      ['remove-worktree', 'ok'],
      ['delete-branch', 'ok'],
    ])
    expect(existsSync(fx.worktree)).toBe(false)
    expect(refs(fx.root)).not.toContain('refs/heads/wt-branch ')
  })

  test('a branch freed by its worktree is not deleted without that worktree', () => {
    const fx = buildFixture()
    mergeWorktreeBranch(fx)
    const p = makePlan(fx.root)
    expect(p.repos[0]!.rows.some((r) => r.id === 'branch:wt-branch')).toBe(true)
    const { receipt } = apply(fx, p, { pick: ['branch:wt-branch'] })

    expect(receipt.dropped.map((d) => [d.row, d.reason, d.detail])).toEqual([
      ['branch:wt-branch', 'held', `checked out in ${fx.worktree}, which this run does not remove`],
    ])
    expect(receipt.steps).toEqual([])
    expect(existsSync(fx.worktree)).toBe(true)
    expect(refs(fx.root)).toContain('refs/heads/wt-branch ')
  })

  // src bug: picked alone, the re-sweep covers only branches (clean.ts:321), so
  // the worktree never frees the branch (sweep.ts:383) and the row drops as a
  // structural `keep`. Picked beside another worktree, the same row drops as
  // `held` — the reason for "a branch whose worktree this run does not remove".
  test('a freed branch picked without its worktree drops as held', () => {
    const fx = buildFixture()
    mergeWorktreeBranch(fx)
    const shown = preview(fx, makePlan(fx.root), { pick: ['branch:wt-branch'] })
    expect(shown.dropped.map((d) => [d.row, d.reason, d.detail])).toEqual([
      ['branch:wt-branch', 'held', `checked out in ${fx.worktree}, which this run does not remove`],
    ])
  })

  test('a freed branch picked with another worktree is dropped, not refused mid-run', () => {
    const fx = buildFixture()
    mergeWorktreeBranch(fx)
    const other = join(dirname(fx.worktree), 'wt-b')
    sh(fx.root, ['worktree', 'add', '-q', other, 'merged-b'])
    const p = makePlan(fx.root)
    const { receipt } = apply(fx, p, { pick: ['branch:wt-branch', wt(realpathSync(other))] })

    expect(receipt.dropped.map((d) => [d.row, d.reason, d.detail])).toEqual([
      ['branch:wt-branch', 'held', `checked out in ${fx.worktree}, which this run does not remove`],
    ])
    expect(receipt.status).toBe('complete')
    expect(refs(fx.root)).toContain('refs/heads/wt-branch ')
  })

  test('drops a branch that moved after the plan and leaves it alone', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    sh(fx.root, ['checkout', '-q', 'merged-a'])
    sh(fx.root, ['commit', '--allow-empty', '-m', 'late work'])
    sh(fx.root, ['checkout', '-q', 'main'])
    const before = refs(fx.root)

    const { receipt } = apply(fx, p, { pick: ['branch:merged-a'] })

    expect(receipt.dropped.map((d) => d.reason)).toEqual(['changed'])
    expect(receipt.status).toBe('complete')
    expect(refs(fx.root)).toBe(before)
  })

  test('drops a row needing abandon-unmerged unless it is allowed', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const row = 'branch:unmerged'

    const refused = apply(fx, p, { pick: [row] }).receipt
    expect(refused.dropped.map((d) => [d.reason, d.detail])).toEqual([
      ['not-allowed', 'needs abandon-unmerged'],
    ])
    expect(refs(fx.root)).toContain('refs/heads/unmerged ')

    const other = 'branch:merged-a'
    const wrongRow = apply(fx, p, {
      pick: [row, other],
      allow: [{ risk: 'abandon-unmerged', row: other }],
    })
    expect(wrongRow.receipt.dropped.map((d) => d.reason)).toEqual(['not-allowed'])

    const allowed = apply(fx, p, { pick: [row], allow: ['abandon-unmerged'] }).receipt
    expect(allowed.dropped).toEqual([])
    expect(allowed.status).toBe('complete')
    expect(refs(fx.root)).not.toContain('refs/heads/unmerged ')
  })

  test('stops at a failing remote delete and records the failure', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const hook = join(fx.bare, 'hooks', 'pre-receive')
    writeFileSync(hook, '#!/bin/sh\necho rejected >&2\nexit 1\n')
    chmodSync(hook, 0o755)

    const { receipt, receiptPath } = apply(fx, p, {
      pick: ['remote:origin/merged-a', 'remote:origin/merged-b'],
    })

    expect(receipt.status).toBe('failed')
    expect(receipt.steps.map((s) => s.result)).toEqual(['failed', 'pending'])
    // The summary, git's reason once in parentheses, then the reference text.
    const error = receipt.steps[0]!.error!
    expect(error).toMatch(/^\[remote rejected\] \([^()]+\): /)
    expect(error.slice(error.indexOf('): ') + 3)).toBe(PUSH_REJECTIONS['hook-declined'].message)
    expect(remoteHeads(fx.bare)).toContain('refs/heads/merged-b')
    expect((JSON.parse(readFileSync(receiptPath, 'utf-8')) as Receipt).status).toBe('failed')
  })

  test('check changes no ref and writes no receipt', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    const before = refs(fx.root)

    const shown = preview(fx, p, { pick: ['branch:merged-a', 'remote:origin/merged-a'] })

    expect(shown.steps.map((s) => s.action)).toEqual(['delete-branch', 'delete-remote'])
    expect(shown.steps.every((s) => s.result === 'would-run')).toBe(true)
    expect(refs(fx.root)).toBe(before)
    expect(existsSync(join(fx.root, '.receipts'))).toBe(false)
  })

  test('drops rows that are gone or no longer deletable', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    sh(fx.root, ['branch', '-D', 'merged-a'])
    sh(fx.root, ['worktree', 'add', '-q', join(fx.worktree, '..', 'wt-b'), 'merged-b'])

    const { receipt } = apply(fx, p, { pick: ['branch:merged-a', 'branch:merged-b'] })

    expect(receipt.dropped.map((d) => [d.row, d.reason])).toEqual([
      ['branch:merged-a', 'gone'],
      // Its new worktree frees it, but this run does not remove that worktree.
      ['branch:merged-b', 'held'],
    ])
    expect(refs(fx.root)).toContain('refs/heads/merged-b ')
  })

  test('drops a planned worktree whose edits skip-worktree hides', () => {
    const fx = buildFixture()
    writeFileSync(join(fx.root, 'tracked.txt'), 'x\n')
    sh(fx.root, ['add', 'tracked.txt'])
    sh(fx.root, ['commit', '-q', '-m', 'track'])
    sh(fx.worktree, ['merge', '-q', '--ff-only', 'main'])
    const p = makePlan(fx.root)
    expect(p.repos[0]!.rows.some((r) => r.id === wt(fx.worktree))).toBe(true)
    sh(fx.worktree, ['update-index', '--skip-worktree', 'tracked.txt'])
    writeFileSync(join(fx.worktree, 'tracked.txt'), 'hidden edit\n')

    const { receipt, receiptPath } = apply(fx, p, { pick: [wt(fx.worktree)] })

    expect(receipt.dropped).toMatchObject([
      { row: wt(fx.worktree), reason: 'blocked', detail: expect.stringMatching(/hidden|skip/i) },
    ])
    expect(receipt.steps).toEqual([])
    expect(readFileSync(join(fx.worktree, 'tracked.txt'), 'utf-8')).toBe('hidden edit\n')
    expect((JSON.parse(readFileSync(receiptPath, 'utf-8')) as Receipt).dropped).toEqual(
      receipt.dropped,
    )
  })

  test('a locked worktree is blocked in a new plan and is dropped from an old one', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    sh(fx.root, ['worktree', 'lock', fx.worktree])

    expect(makePlan(fx.root).repos[0]!.rows.find((r) => r.id === wt(fx.worktree))).toMatchObject({
      verdict: 'blocked',
      action: null,
    })
    const { receipt } = apply(fx, p, { pick: [wt(fx.worktree)] })

    expect(receipt.dropped.map((d) => [d.reason, d.detail])).toEqual([
      ['blocked', expect.stringMatching(/lock/i)],
    ])
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a row named twice runs once', () => {
    const fx = buildFixture()
    const { receipt } = apply(fx, makePlan(fx.root), {
      pick: ['branch:merged-a', 'branch:merged-a', 'merged-a'],
    })
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => s.action)).toEqual(['delete-branch'])
  })

  test('a spared gone worktree keeps its record while the rest of the run goes', () => {
    const fx = buildFixture()
    const other = join(fx.root, '..', 'wt-gone')
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'gone-branch', other, 'main'])
    const gone = realpathSync(other)
    rmSync(fx.worktree, { recursive: true, force: true })
    rmSync(gone, { recursive: true, force: true })
    const { receipt } = apply(fx, makePlan(fx.root), {
      pick: [wt(fx.worktree), 'branch:merged-a'],
      spare: [wt(gone)],
    })
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => s.action)).toEqual(['prune-worktrees', 'delete-branch'])
    const listed = sh(fx.root, ['worktree', 'list', '--porcelain'])
    expect(listed).not.toContain(fx.worktree)
    expect(listed).toContain(gone)
  })

  test('a worktree left without its .git is not pruned while another gone one would go too', () => {
    const fx = buildFixture()
    const other = join(fx.root, '..', 'wt-gone')
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'gone-branch', other, 'main'])
    const gone = realpathSync(other)
    rmSync(join(fx.worktree, '.git'))
    rmSync(gone, { recursive: true, force: true })
    const p = makePlan(fx.root)

    // The repository-wide prune would also drop `gone`, which is not picked.
    const alone = preview(fx, p, { pick: [wt(fx.worktree)] })
    expect(alone.steps).toEqual([])
    expect(alone.dropped).toMatchObject([
      { row: wt(fx.worktree), reason: 'blocked', detail: expect.stringContaining(gone) },
    ])

    // Picked together, `gone` goes by its own record first, then the prune.
    const { receipt } = apply(fx, p, { pick: [wt(fx.worktree), wt(gone)] })
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => [s.row, s.command.split(' ').slice(3).join(' ')])).toEqual([
      [wt(gone), `worktree remove ${gone}`],
      [wt(fx.worktree), 'worktree prune'],
    ])
    expect(existsSync(fx.worktree)).toBe(true)
    expect(sh(fx.root, ['worktree', 'list', '--porcelain'])).not.toContain('wt-')
  })

  test('prunes a worktree whose directory is gone', () => {
    const fx = buildFixture()
    rmSync(fx.worktree, { recursive: true, force: true })
    const { receipt } = apply(fx, makePlan(fx.root), { pick: [wt(fx.worktree)] })
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]!.verification).toBe('unregistered')
  })

  test('a worktree directory whose .git is gone is swept, then pruned and left in place', () => {
    const fx = buildFixture()
    rmSync(join(fx.worktree, '.git'))
    writeFileSync(join(fx.worktree, 'left.txt'), 'kept\n')

    const swept = sweepOf([fx.root], fx.root).repos[0]!
    expect(swept.error).toBeNull()
    const row = swept.rows.find((r) => r.id === wt(fx.worktree))!
    expect(row).toMatchObject({
      verdict: 'delete',
      action: 'prune',
      commands: [expect.stringContaining('worktree prune')],
    })
    expect(row.evidence).toMatchObject({ onDisk: false, directoryLeft: true })

    const { receipt } = apply(fx, makePlan(fx.root), { pick: [wt(fx.worktree)] })
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]!.action).toBe('prune-worktrees')
    expect(sh(fx.root, ['worktree', 'list'])).not.toContain(fx.worktree)
    expect(readFileSync(join(fx.worktree, 'left.txt'), 'utf-8')).toBe('kept\n')
  })

  test('a prune row whose .git came back is dropped, not turned into a remove', () => {
    const fx = buildFixture()
    const dotGit = readFileSync(join(fx.worktree, '.git'), 'utf-8')
    rmSync(join(fx.worktree, '.git'))
    const p = makePlan(fx.root)
    writeFileSync(join(fx.worktree, '.git'), dotGit)

    const { receipt } = apply(fx, p, { pick: [wt(fx.worktree)] })
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['changed'])
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a branch name two repositories share applies in both', () => {
    const a = buildFixture()
    const b = buildFixture()
    const p = plan(sweepOf([a.root, b.root], a.root))
    expect(p.repos).toHaveLength(2)
    const receipt = run(check(p, {}, { cwd: a.root }), { cwd: a.root, source: '(test)' })
    expect(receipt.status).toBe('complete')
    expect(refs(a.root)).not.toContain('refs/heads/merged-a ')
    expect(refs(b.root)).not.toContain('refs/heads/merged-a ')
    // Named without a repository, the shared row is still ambiguous.
    expectRefused(
      () => check(p, { pick: ['branch:merged-b'] }, { cwd: a.root }),
      'ambiguous',
      /sweep or plan only the repository it is in/,
    )
  })

  test('two clones of one remote delete its branch once; the second row is a duplicate', () => {
    const fx = buildFixture()
    // The second clone names its remote `upstream`, so each row has its own id.
    const second = tempDir('repo-cleaner-clone-')
    sh(second, ['clone', '-q', '-o', 'upstream', fx.bare, 'b'])
    const b = join(second, 'b')
    const p = plan(sweepOf([fx.root, b], fx.root))
    const receipt = run(
      check(p, { pick: ['remote:origin/merged-a', 'remote:upstream/merged-a'] }, { cwd: fx.root }),
      { cwd: fx.root, source: '(test)' },
    )
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.filter((s) => s.action === 'delete-remote')).toHaveLength(1)
    expect(receipt.dropped).toMatchObject([
      { repo: b, row: 'remote:upstream/merged-a', reason: 'duplicate' },
    ])
    expect(remoteHeads(fx.bare)).not.toContain('refs/heads/merged-a')
  })

  test('a clone whose URL reaches the remote through insteadOf counts as the same remote', () => {
    const fx = buildFixture()
    const other = tempDir('repo-cleaner-clone-')
    sh(other, ['clone', '-q', '-o', 'upstream', fx.bare, 'b'])
    const b = join(other, 'b')
    sh(b, ['config', `url.${fx.bare}.insteadOf`, 'alias:project'])
    sh(b, ['remote', 'set-url', 'upstream', 'alias:project'])
    const p = plan(sweepOf([fx.root, b], fx.root))
    expect(p.repos.map((r) => r.root)).toContain(b)
    const shown = check(
      p,
      { pick: ['remote:origin/merged-a', 'remote:upstream/merged-a'] },
      { cwd: fx.root },
    )
    expect(shown.dropped.map((d) => [d.repo, d.reason])).toEqual([[b, 'duplicate']])
  })

  test('local remotes `x` and `x.git` are different remotes', () => {
    const parent = tempDir('repo-cleaner-remotes-')
    const roots: string[] = []
    for (const bare of ['project', 'project.git']) {
      sh(parent, ['init', '-q', '--bare', '-b', 'main', bare])
      const work = join(parent, `work-${bare}`)
      sh(parent, ['clone', '-q', join(parent, bare), work])
      sh(work, ['commit', '-q', '--allow-empty', '-m', 'init'])
      sh(work, ['push', '-q', '-u', 'origin', 'main'])
      sh(work, ['push', '-q', 'origin', 'main:refs/heads/topic'])
      roots.push(work)
    }
    const p = plan(sweepOf(roots, parent))
    expect(p.repos).toHaveLength(2)
    const shown = check(p, {}, { cwd: parent })
    expect(shown.dropped.filter((d) => d.reason === 'duplicate')).toEqual([])
    expect(shown.steps.filter((s) => s.action === 'delete-remote')).toHaveLength(2)
  })

  test('a sweep given to check stands in for the re-sweep', () => {
    const fx = buildFixture()
    const swept = sweepOf([fx.root], fx.root)
    const pinned: Sweep = {
      ...swept,
      repos: swept.repos.map((r) => ({
        ...r,
        rows: r.rows.map((row): Row =>
          row.id === 'branch:merged-a' ? { ...row, action: null } : row,
        ),
      })),
    }
    const shown = preview(fx, plan(swept), { pick: ['branch:merged-a'] }, { sweep: pinned })
    expect(shown.dropped.map((d) => d.reason)).toEqual(['keep'])
  })

  test('rows the preview dropped are recorded first in the receipt file', () => {
    const fx = buildFixture()
    const receiptPath = join(fx.root, 'r.json')
    const shown = preview(fx, makePlan(fx.root), { pick: ['branch:merged-a', 'branch:unmerged'] })
    expect(shown.dropped.map((d) => [d.row, d.reason])).toEqual([
      ['branch:unmerged', 'not-allowed'],
    ])
    run(shown, { cwd: fx.root, receiptPath, source: '(test)' })
    const saved = JSON.parse(readFileSync(receiptPath, 'utf-8')) as Receipt
    expect(saved.dropped).toEqual(shown.dropped)
    expect(saved.steps.map((s) => [s.row, s.result])).toEqual([['branch:merged-a', 'ok']])
    expect(refs(fx.root)).toContain('refs/heads/unmerged ')
  })

  test('force-removes a dirty worktree only with discard-changes', () => {
    const fx = buildFixture()
    writeFileSync(join(fx.worktree, 'scratch.txt'), 'wip\n')
    const p = makePlan(fx.root)
    const row = wt(fx.worktree)

    expect(apply(fx, p, { pick: [row] }).receipt.dropped.map((d) => d.reason)).toEqual([
      'not-allowed',
    ])

    const { receipt } = apply(fx, p, {
      pick: [row],
      allow: [{ risk: 'discard-changes', row }],
    })
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]!.command).toContain('--force')
    expect(existsSync(fx.worktree)).toBe(false)
  })

  test('no pick selects every delete row; review rows are dropped, not run', () => {
    const fx = buildFixture()
    const { receipt } = apply(fx, makePlan(fx.root), {})
    expect(receipt.status).toBe('complete')
    // Review rows run only when picked: the worktree (no disposability signal
    // without a provider) and the unmerged branch.
    expect(receipt.dropped.map((d) => [d.row, d.reason])).toEqual([
      [wt(fx.worktree), 'needs-pick'],
      ['branch:unmerged', 'needs-pick'],
    ])
    expect(refs(fx.root)).not.toContain('refs/heads/merged-a ')
    expect(refs(fx.root)).not.toContain('refs/heads/merged-b ')
    expect(refs(fx.root)).toContain('refs/heads/unmerged ')
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('without a receiptPath the run writes no receipt', () => {
    const fx = buildFixture()
    const receipt = run(check(makePlan(fx.root), { pick: ['branch:merged-a'] }, { cwd: fx.root }), {
      cwd: fx.root,
      source: '(swept)',
    })
    expect(receipt.status).toBe('complete')
    expect(receipt.plan).toBe('(swept)')
    expect(existsSync(join(fx.root, '.receipts'))).toBe(false)
  })

  test('a plan with no rows previews nothing and runs nothing', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    for (const repo of p.repos) repo.rows = []
    const shown = preview(fx, p, {})
    expect(shown.steps).toEqual([])
    expect(shown.dropped).toEqual([])
    const before = refs(fx.root)
    const receipt = run(shown, { cwd: fx.root })
    expect(receipt).toMatchObject({ status: 'complete', steps: [], dropped: [] })
    expect(refs(fx.root)).toBe(before)
  })

  test('rejects a row that is not in the plan', () => {
    const fx = buildFixture()
    const p = makePlan(fx.root)
    expectRefused(
      () => preview(fx, p, { pick: ['branch:no-such-branch'] }),
      'not-found',
      'no such row in the plan',
    )
  })
})

describe('networkRemoteKey', () => {
  test('one key for every form of a network URL, the whole path kept', () => {
    const forms = [
      'git@github.com:acme/api.git',
      'ssh://git@github.com/acme/api',
      'https://github.com/acme/api/',
      'https://user@GitHub.com/acme/api.git',
      'github.com:acme/api',
    ]
    expect(new Set(forms.map(networkRemoteKey))).toEqual(new Set(['github.com/acme/api']))
    expect(networkRemoteKey('https://gitlab.com/a/b/c')).not.toBe(
      networkRemoteKey('https://gitlab.com/z/b/c'),
    )
    expect(networkRemoteKey('https://host:8443/o/r')).toBe('host:8443/o/r')
  })

  test('a path on this machine is not a network URL', () => {
    for (const path of [
      '/srv/git/api.git',
      '../api',
      'C:\\repos\\api',
      'C:/repos/api',
      'file:///srv/api',
    ]) {
      expect(networkRemoteKey(path)).toBeNull()
    }
  })
})

describe('plan files', () => {
  test('parsePlan names its source in the error', () => {
    expectRefused(() => parsePlan('{', 'stdin'), 'bad-plan', 'cannot read plan stdin')
    expectRefused(() => parsePlan('{}', 'stdin'), 'bad-plan', /plan stdin is version null/)
    expectRefused(
      () => parsePlan(JSON.stringify({ version: PLAN_VERSION }), 'stdin'),
      'bad-plan',
      'bad plan stdin',
    )
  })

  test('a written plan reads back and applies', () => {
    const fx = buildFixture()
    const path = join(fx.root, '.plans', 'p.json')
    writePlan(path, makePlan(fx.root))
    const { receipt } = apply(fx, readPlan(path), { pick: ['branch:merged-a'] })
    expect(receipt.status).toBe('complete')
  })

  test('a version 1 plan is refused, not translated', () => {
    const v1 = {
      version: 1,
      created_at: 'x',
      repos: [
        {
          root: '/r',
          remote: null,
          no_gh: true,
          rows: [{ category: 'local_branch', id: 'feat/x', requires: [], fingerprint: {} }],
        },
      ],
    }
    expectRefused(
      () => parsePlan(JSON.stringify(v1), 'v1.json'),
      'bad-plan',
      /plan v1\.json is version 1; this repo-cleaner reads version 2\. Sweep again/,
    )
    const fx = buildFixture()
    const path = join(fx.root, 'v1.json')
    writeFileSync(path, JSON.stringify(v1))
    expectRefused(() => readPlan(path), 'bad-plan', /is version 1/)
    expectRefused(() => readPlan(join(fx.root, 'missing.json')), 'bad-plan', /cannot read plan/)
  })

  test('a host annotate hook decides what the re-check sees', () => {
    const fx = buildFixture()
    const shown = preview(
      fx,
      makePlan(fx.root),
      { pick: ['branch:merged-a'] },
      { annotate: (_repo, rows) => rows.map((row): Row => ({ ...row, action: null })) },
    )
    expect(shown.dropped.map((d) => d.reason)).toEqual(['keep'])
  })

  test('rows passed in as a sweep go through holdFreedBranches too', () => {
    const fx = buildFixture()
    mergeWorktreeBranch(fx)
    const swept = sweepOf([fx.root], fx.root)
    const p = plan(swept)
    const held: Sweep = {
      ...swept,
      repos: swept.repos.map((r) => ({
        ...r,
        rows: r.rows.map((row): Row =>
          row.id === wt(fx.worktree) ? { ...row, verdict: 'keep', action: null } : row,
        ),
      })),
    }
    const shown = preview(fx, p, { pick: ['branch:wt-branch'] }, { sweep: held })
    expect(shown.dropped.map((d) => [d.row, d.reason, d.detail])).toEqual([
      ['branch:wt-branch', 'keep', 'checked out in a worktree (handle via that worktree)'],
    ])
  })

  test('a branch freed by a worktree the host holds back is kept with it', () => {
    const fx = buildFixture()
    mergeWorktreeBranch(fx)
    const p = makePlan(fx.root)
    const shown = preview(
      fx,
      p,
      { pick: ['branch:wt-branch', wt(fx.worktree)] },
      {
        annotate: (_repo, rows) =>
          rows.map((row): Row =>
            row.id === wt(fx.worktree) ? { ...row, verdict: 'keep', action: null } : row,
          ),
      },
    )
    expect(shown.dropped.map((d) => [d.row, d.reason, d.detail])).toEqual([
      ['branch:wt-branch', 'keep', 'checked out in a worktree (handle via that worktree)'],
      [wt(fx.worktree), 'keep', expect.any(String)],
    ])
  })
})
