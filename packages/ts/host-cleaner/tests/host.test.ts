import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { Git } from '@osdlc/typed-git'
import { sweep, type Annotate } from '@osdlc/repo-cleaner'

import { HostCleanerError } from '../src/adapter.ts'
import { hostCheck, hostRun } from '../src/clean.ts'
import {
  HOST_PLAN_VERSION,
  hostPlan,
  parseHostPlan,
  readHostPlan,
  writeHostPlan,
} from '../src/plan.ts'
import { chainRemoveWorktree } from '../src/registry.ts'
import { gatherHostRows, hostSweep } from '../src/sweep.ts'
import { buildFixture, fakeAdapter, hostRow, sh, type Fixture } from './fixture.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})
function fixture(): Fixture {
  const fx = buildFixture()
  cleanups.push(fx.cleanup)
  return fx
}
const rowIds = (s: ReturnType<typeof sweep>): string[] =>
  s.repos.flatMap((r) => r.rows.map((row) => `${row.id} ${row.verdict}`))

describe('sweep and the adapter registry', () => {
  test("with no adapter the rows are repo-cleaner's", () => {
    const fx = fixture()
    const swept = hostSweep([fx.root], { cwd: fx.root })
    expect(swept.adapters).toEqual([])
    expect(swept.rows).toEqual([])
    expect(rowIds(swept.repo)).toEqual(rowIds(sweep([fx.root], { cwd: fx.root })))
  })

  test('an adapter that does not detect itself adds nothing and is reported skipped', () => {
    const fx = fixture()
    let gathered = 0
    const absent = fakeAdapter(() => (gathered++, [hostRow()]), {
      detect: () => false,
      annotate: () => {
        throw new Error('annotated')
      },
    })
    const swept = hostSweep([fx.root], { cwd: fx.root, adapters: [absent] })
    expect(swept.adapters).toEqual([{ name: 'fake', status: 'skipped', reason: 'not-detected' }])
    expect(swept.rows).toEqual([])
    expect(gathered).toBe(0)
    expect(rowIds(swept.repo)).toEqual(rowIds(sweep([fx.root], { cwd: fx.root })))
  })

  test('--adapter and --no-adapter select by name, and an unknown name is refused', () => {
    const fx = fixture()
    const a = fakeAdapter(() => [hostRow()])
    const b = { ...fakeAdapter(() => []), name: 'other' }
    const run = (sel: { adapter?: string[]; noAdapter?: string[] }) =>
      hostSweep([fx.root], { cwd: fx.root, adapters: [a, b], ...sel }).adapters
    expect(run({ adapter: ['other'] })).toEqual([
      { name: 'fake', status: 'skipped', reason: 'not-selected' },
      { name: 'other', status: 'active' },
    ])
    expect(run({ noAdapter: ['fake'] })[0]).toEqual({
      name: 'fake',
      status: 'skipped',
      reason: 'excluded',
    })
    expect(() => run({ adapter: ['nope'] })).toThrow(/no adapter named nope/)
    expect(() => hostSweep([fx.root], { cwd: fx.root, adapters: [a, a] })).toThrow(
      /two adapters are named fake/,
    )
  })

  test('a detect that throws skips the adapter', () => {
    const fx = fixture()
    const bad = fakeAdapter(() => [], {
      detect: () => {
        throw new Error('no app bundle')
      },
    })
    expect(hostSweep([fx.root], { cwd: fx.root, adapters: [bad] }).adapters).toEqual([
      { name: 'fake', status: 'skipped', reason: 'detect-failed', error: 'no app bundle' },
    ])
  })

  test("annotates chain in run order after the caller's own", () => {
    const fx = fixture()
    const note =
      (text: string): Annotate =>
      (_repo, rows) =>
        rows.map((r) => (r.id === 'branch:merged-a' ? { ...r, notes: [...r.notes, text] } : r))
    const a = fakeAdapter(() => [], { annotate: note('a') })
    const b = { ...fakeAdapter(() => []), name: 'b', annotate: note('b') }
    const swept = hostSweep([fx.root], { cwd: fx.root, adapters: [a, b], annotate: note('own') })
    const row = swept.repo.repos[0]!.rows.find((r) => r.id === 'branch:merged-a')!
    expect(row.notes.slice(-3)).toEqual(['own', 'a', 'b'])
  })

  test('a gather that throws costs that adapter its rows, not the run', () => {
    const fx = fixture()
    const bad = fakeAdapter(() => {
      throw new Error('cache unreadable')
    })
    const swept = hostSweep([fx.root], { cwd: fx.root, adapters: [bad] })
    expect(swept.rows).toEqual([])
    expect(swept.adapters).toEqual([{ name: 'fake', status: 'active', error: 'cache unreadable' }])
  })

  test('a malformed row, or one two adapters both claim, is refused', () => {
    const fx = fixture()
    const gather = (rows: ReturnType<typeof hostRow>[], more = false) => {
      const adapters = [fakeAdapter(() => rows)]
      if (more) adapters.push({ ...fakeAdapter(() => rows), name: 'second' })
      return () => hostSweep([fx.root], { cwd: fx.root, adapters })
    }
    expect(gather([hostRow({ id: 'artifact:other' })])).toThrow(/not <kind>:<name>/)
    expect(gather([hostRow({ kind: 'branch', id: 'branch:cache' })])).toThrow(/repo-cleaner's/)
    expect(gather([hostRow({ adapter: 'second' })])).toThrow(/names adapter second/)
    const two = [hostRow()]
    expect(() =>
      gatherHostRows(
        [
          fakeAdapter(() => two),
          { ...fakeAdapter(() => [hostRow({ adapter: 'second' })]), name: 'second' },
        ],
        [],
        {} as never,
      ),
    ).toThrow(HostCleanerError)
  })
})

describe('plan, check and run', () => {
  function planOf(fx: Fixture, adapters: ReturnType<typeof fakeAdapter>[], extra = {}) {
    const swept = hostSweep([fx.root], { cwd: fx.root, adapters, ...extra })
    return hostPlan(swept)
  }

  test('a host row goes through plan, check, run, verification and the receipt', () => {
    const fx = fixture()
    const adapter = fakeAdapter(() => [hostRow()])
    const p = planOf(fx, [adapter])
    const file = join(mkdtempSync(join(tmpdir(), 'host-plan-')), 'plan.json')
    cleanups.push(() => rmSync(file, { force: true }))
    writeHostPlan(file, p)
    const back = readHostPlan(file)
    expect(back.adapters).toEqual(['fake'])
    expect(back.rows[0]).toMatchObject({ id: 'artifact:cache', fingerprint: { bytes: 10 } })

    const receiptPath = join(fx.root, '.git', 'receipt.json')
    const preview = hostCheck(
      back,
      { pick: ['artifact:cache'] },
      { cwd: fx.root, adapters: [adapter] },
    )
    expect(preview.steps).toMatchObject([
      { row: 'artifact:cache', action: 'remove', command: 'rm -r cache', result: 'would-run' },
    ])
    expect(preview.repo.steps).toEqual([])
    const receipt = hostRun(preview, {
      cwd: fx.root,
      adapters: [adapter],
      receiptPath,
      source: 'plan.json',
    })

    expect(receipt.status).toBe('complete')
    expect(receipt.host.steps).toMatchObject([
      { row: 'artifact:cache', result: 'ok', verification: 'removed cache' },
    ])
    expect(adapter.executed).toEqual(['artifact:cache'])
    // Naming only a host row leaves every repo-cleaner row alone.
    expect(sh(fx.root, ['branch', '--list', 'merged-a'])).not.toBe('')
    expect(JSON.parse(readFileSync(receiptPath, 'utf-8'))).toMatchObject({
      version: 1,
      plan: 'plan.json',
      status: 'complete',
    })
  })

  test('a changed fingerprint drops the row as changed', () => {
    const fx = fixture()
    let bytes = 10
    const adapter = fakeAdapter(() => [hostRow({ evidence: { bytes } })])
    const p = planOf(fx, [adapter])
    bytes = 99
    const preview = hostCheck(p, {}, { cwd: fx.root, adapters: [adapter] })
    expect(preview.steps).toEqual([])
    expect(preview.dropped).toEqual([
      { row: 'artifact:cache', reason: 'changed', detail: 'its evidence moved since the plan' },
    ])
  })

  test('a row that changes between the check and the run is dropped by the run', () => {
    const fx = fixture()
    let bytes = 10
    const adapter = fakeAdapter(() => [hostRow({ evidence: { bytes } })])
    const p = planOf(fx, [adapter])
    const preview = hostCheck(p, {}, { cwd: fx.root, adapters: [adapter] })
    expect(preview.steps).toHaveLength(1)
    bytes = 11
    const receipt = hostRun(preview, { cwd: fx.root, adapters: [adapter] })
    expect(receipt.host.steps).toEqual([])
    expect(receipt.host.dropped.map((d) => d.reason)).toEqual(['changed'])
    expect(adapter.executed).toEqual([])
  })

  test('without a pick only delete rows run; a review row needs its pick', () => {
    const fx = fixture()
    const adapter = fakeAdapter(() => [hostRow({ verdict: 'review' })])
    const p = planOf(fx, [adapter])
    const opts = { cwd: fx.root, adapters: [adapter] }
    expect(hostCheck(p, {}, opts).dropped[0]).toMatchObject({ reason: 'needs-pick' })
    expect(hostCheck(p, { pick: ['artifact:cache'] }, opts).steps).toHaveLength(1)
  })

  test('blocked and actionless rows drop with their reason, and a spare is honoured', () => {
    const fx = fixture()
    const rows = [
      hostRow({ id: 'artifact:a', name: 'a', verdict: 'blocked', blockers: ['build-running'] }),
      hostRow({ id: 'artifact:b', name: 'b', action: null, verdict: 'keep' }),
      hostRow({ id: 'artifact:c', name: 'c' }),
    ]
    const adapter = fakeAdapter(() => rows)
    const p = planOf(fx, [adapter])
    const opts = { cwd: fx.root, adapters: [adapter] }
    const picked = hostCheck(p, { pick: ['artifact:a', 'artifact:b'] }, opts)
    expect(picked.dropped.map((d) => [d.row, d.reason])).toEqual([
      ['artifact:a', 'blocked'],
      ['artifact:b', 'keep'],
    ])
    const spared = hostCheck(p, { spare: ['artifact:c'] }, opts)
    expect(spared.steps).toEqual([])
    expect(spared.dropped.map((d) => [d.row, d.reason])).toEqual([['artifact:c', 'spared']])
  })

  test('a host risk runs only when allowed, by name', () => {
    const fx = fixture()
    const adapter = fakeAdapter(() => [hostRow({ risks: ['close-session'] })])
    const p = planOf(fx, [adapter])
    const opts = { cwd: fx.root, adapters: [adapter] }
    expect(hostCheck(p, {}, opts).dropped[0]).toMatchObject({
      reason: 'not-allowed',
      detail: 'needs close-session',
    })
    expect(hostCheck(p, { allow: ['close-session'] }, opts).steps).toHaveLength(1)
    expect(
      hostCheck(p, { allow: [{ risk: 'close-session', row: 'artifact:cache' }] }, opts).steps,
    ).toHaveLength(1)
    const unused = hostCheck(p, { allow: ['close-session', 'other'] }, opts)
    expect(unused.unusedAllows).toEqual([{ risk: 'other', row: null }])
    expect(() => hostCheck(p, { allow: [{ risk: 'other', row: 'artifact:nope' }] }, opts)).toThrow(
      /names a row the plan does not have/,
    )
  })

  test('a failing execute fails the step, stops, and is in the receipt', () => {
    const fx = fixture()
    const rows = [hostRow(), hostRow({ id: 'artifact:two', name: 'two' })]
    const adapter = fakeAdapter(() => rows, {
      execute: () => {
        throw new Error('still exists after remove')
      },
    })
    const p = planOf(fx, [adapter])
    const receipt = hostRun(hostCheck(p, {}, { cwd: fx.root, adapters: [adapter] }), {
      cwd: fx.root,
      adapters: [adapter],
    })
    expect(receipt.status).toBe('failed')
    expect(receipt.host.steps.map((s) => [s.row, s.result, s.error])).toEqual([
      ['artifact:cache', 'failed', 'still exists after remove'],
      ['artifact:two', 'pending', null],
    ])
  })

  test('an adapter the plan names but the machine no longer detects drops its rows as gone', () => {
    const fx = fixture()
    let present = true
    const adapter = fakeAdapter(() => [hostRow()], { detect: () => present })
    const p = planOf(fx, [adapter])
    present = false
    const preview = hostCheck(p, {}, { cwd: fx.root, adapters: [adapter] })
    expect(preview.dropped[0]).toMatchObject({ reason: 'gone' })
    expect(preview.adapters[0]).toMatchObject({ status: 'skipped', reason: 'not-detected' })
  })

  test('an annotate that makes a row delete survives the re-check, so the row is removed', () => {
    const fx = fixture()
    const holdsNothing: Annotate = (_repo, rows) =>
      rows.map((r) => (r.id === 'branch:topic' ? { ...r, verdict: 'delete' as const } : r))
    const adapter = fakeAdapter(() => [], { annotate: holdsNothing })
    const p = planOf(fx, [adapter])
    expect(p.repo.repos[0]!.rows.find((r) => r.id === 'branch:topic')!.verdict).toBe('delete')
    const allow = ['abandon-unmerged']

    // Without its annotate the re-check judges it `review`, and drops it.
    const { annotate: _annotate, ...plain } = adapter
    const bare = hostCheck(
      p,
      { allow },
      {
        cwd: fx.root,
        adapters: [plain],
      },
    )
    expect(bare.repo.dropped.map((d) => [d.row, d.reason])).toContainEqual([
      'branch:topic',
      'needs-pick',
    ])

    const preview = hostCheck(p, { allow }, { cwd: fx.root, adapters: [adapter] })
    const receipt = hostRun(preview, { cwd: fx.root, adapters: [adapter] })
    expect(receipt.status).toBe('complete')
    expect(receipt.repo.steps.map((s) => s.row)).toContain('branch:topic')
    expect(sh(fx.root, ['branch', '--list', 'topic'])).toBe('')
  })

  test('a run executes only the rows the preview showed', () => {
    const fx = fixture()
    let verdictB = 'review' as 'review' | 'delete'
    const rows = () => [hostRow(), hostRow({ id: 'artifact:b', name: 'b', verdict: verdictB })]
    const adapter = fakeAdapter(rows)
    const p = planOf(fx, [adapter])
    const opts = { cwd: fx.root, adapters: [adapter] }
    const preview = hostCheck(p, {}, opts)
    expect(preview.steps.map((s) => s.row)).toEqual(['artifact:cache'])
    verdictB = 'delete'
    hostRun(preview, opts)
    expect(adapter.executed).toEqual(['artifact:cache'])
  })

  test('evidence an adapter mutates after planning still changes the fingerprint', () => {
    const fx = fixture()
    const shared = hostRow()
    const adapter = fakeAdapter(() => [shared])
    const p = planOf(fx, [adapter])
    shared.evidence.bytes = 999
    expect(hostCheck(p, {}, { cwd: fx.root, adapters: [adapter] }).dropped[0]).toMatchObject({
      reason: 'changed',
    })
  })

  test('a row another adapter now supplies is not the planned row', () => {
    const fx = fixture()
    let aOwns = true
    const a = fakeAdapter(() => (aOwns ? [hostRow()] : []))
    const b = { ...fakeAdapter(() => (aOwns ? [] : [hostRow({ adapter: 'b' })])), name: 'b' }
    const p = planOf(fx, [a, b])
    expect(p.rows.map((r) => r.adapter)).toEqual(['fake'])
    aOwns = false
    const preview = hostCheck(p, {}, { cwd: fx.root, adapters: [a, b] })
    expect(preview.steps).toEqual([])
    expect(preview.dropped).toEqual([
      { row: 'artifact:cache', reason: 'changed', detail: 'owned by fake when planned, by b now' },
    ])
  })

  test('a repo row picked alone leaves host rows alone', () => {
    const fx = fixture()
    const adapter = fakeAdapter(() => [hostRow()])
    const p = planOf(fx, [adapter])
    const opts = { cwd: fx.root, adapters: [adapter] }
    const receipt = hostRun(hostCheck(p, { pick: [fx.merged] }, opts), opts)
    expect(receipt.status).toBe('complete')
    expect(receipt.repo.steps.map((s) => s.row)).toEqual(['branch:merged-a'])
    expect(receipt.host.steps).toEqual([])
    expect(adapter.executed).toEqual([])
  })
})

describe('removeWorktree', () => {
  test('the first adapter that claims a worktree decides, and null falls through', () => {
    const calls: string[] = []
    const mk = (name: string, claims: boolean) => ({
      ...fakeAdapter(() => []),
      name,
      removeWorktree: () => {
        calls.push(name)
        return claims ? { command: name, run: () => {} } : null
      },
    })
    const chained = chainRemoveWorktree([mk('a', false), mk('b', true), mk('c', true)])!
    expect(chained({} as never, { repo: '/r', force: false })?.command).toBe('b')
    expect(calls).toEqual(['a', 'b'])
    expect(chainRemoveWorktree([fakeAdapter(() => [])])).toBeUndefined()
  })

  test('hostRun removes a worktree through the adapter, and the step is still verified', () => {
    const fx = fixture()
    const wt = join(fx.root, '..', `wt-${Date.now()}`)
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'wt-branch', wt, 'main'])
    const path = sh(fx.root, ['worktree', 'list', '--porcelain'])
      .split('\n')
      .find((l) => l.startsWith('worktree ') && l.endsWith(wt.split('/').at(-1)!))!
      .slice(9)
    cleanups.push(() => rmSync(path, { recursive: true, force: true }))
    const seen: string[] = []
    const adapter = fakeAdapter(() => [], {
      removeWorktree: (row) => {
        seen.push(row.name)
        return {
          command: `host-remove ${row.name}`,
          run: () => {
            new Git(fx.root).worktreeRemove(row.name)
          },
        }
      },
    })
    const p = hostPlan(hostSweep([fx.root], { cwd: fx.root, adapters: [adapter] }))
    const opts = { cwd: fx.root, adapters: [adapter] }
    const preview = hostCheck(p, { pick: [`worktree:${path}`] }, opts)
    expect(preview.repo.steps.map((s) => s.command)).toEqual([`host-remove ${path}`])
    const receipt = hostRun(preview, opts)
    expect(receipt.status).toBe('complete')
    expect(existsSync(path)).toBe(false)
    expect(seen).toContain(path)
  })
})

describe('plan files', () => {
  test('a plan of another version or shape is refused', () => {
    expect(() => parseHostPlan('{', 'p.json')).toThrow(/cannot read plan p.json/)
    expect(() => parseHostPlan('{"version":9}', 'p.json')).toThrow(
      new RegExp(`reads version ${HOST_PLAN_VERSION}`),
    )
    expect(() => parseHostPlan(`{"version":${HOST_PLAN_VERSION}}`, 'p.json')).toThrow(/bad plan/)
    writeFileSync(join(tmpdir(), 'host-cleaner-missing'), '')
    expect(() => readHostPlan('/no/such/plan.json')).toThrow(HostCleanerError)
  })
})
