/**
 * The reconcile decision table and the reconcile run over fake probes: every
 * (process, host, quiet) combination, unknown evidence never ending anything,
 * a fresh read winning the race, ended-but-live, dry run and backfill.
 */

import { describe, expect, test } from 'vitest'

import { machineId } from '../src/machine.ts'

import {
  BACKFILL_STATUSES,
  DEFAULT_GRACE_MS,
  decideReconcile,
  endedAsLost,
  reconcileSessions,
  type BackfillStatus,
  type ReconcileDeps,
} from '../src/reconcile.ts'
import type { AnySessionRecord as SessionRecord } from '../src/model.ts'

const GRACE = 15 * 60_000

describe('decideReconcile', () => {
  const processes = [true, false, null] as const
  const hosts = [true, false, null, 'failed'] as const
  const quiets = [0, GRACE - 1, GRACE, GRACE * 10] as const

  test('covers every probe combination', () => {
    for (const process of processes)
      for (const hostOpen of hosts)
        for (const quietMs of quiets) {
          const got = decideReconcile({ process, hostOpen, quietMs, graceMs: GRACE })
          const live = process === true || hostOpen === true
          const expected = live
            ? 'live'
            : process === null || hostOpen === 'failed'
              ? 'unknown'
              : quietMs < GRACE
                ? 'quiet'
                : 'lost'
          expect({ process, hostOpen, quietMs, verdict: got.verdict }).toEqual({
            process,
            hostOpen,
            quietMs,
            verdict: expected,
          })
        }
  })

  test('a live process wins whatever else says', () => {
    expect(
      decideReconcile({ process: true, hostOpen: false, quietMs: GRACE * 99, graceMs: GRACE })
        .verdict,
    ).toBe('live')
  })

  test('an open pane keeps a session whose process is absent or unknown', () => {
    for (const process of [false, null] as const) {
      expect(
        decideReconcile({ process, hostOpen: true, quietMs: GRACE * 99, graceMs: GRACE }).verdict,
      ).toBe('live')
    }
  })

  test('unknown process evidence never ends, even with a closed pane and a long quiet', () => {
    expect(
      decideReconcile({ process: null, hostOpen: false, quietMs: GRACE * 99, graceMs: GRACE })
        .verdict,
    ).toBe('unknown')
  })

  test('a host probe that failed never ends a record, whatever the process says', () => {
    const d = decideReconcile({
      process: false,
      hostOpen: 'failed',
      quietMs: GRACE * 99,
      graceMs: GRACE,
    })
    expect(d.verdict).toBe('unknown')
  })

  test('a host with nothing to ask leaves the process probe to stand alone', () => {
    const lost = decideReconcile({
      process: false,
      hostOpen: null,
      quietMs: GRACE,
      graceMs: GRACE,
    })
    expect(lost.verdict).toBe('lost')
    expect(lost.reason).toContain('no host to ask')
  })

  test('the default grace is fifteen minutes', () => {
    expect(DEFAULT_GRACE_MS).toBe(GRACE)
  })
})

const NOW = new Date('2026-10-09T12:00:00Z')

function record(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    harness: 'goose',
    kind: 'interactive',
    origin: { kind: 'person' },
    author: { tool: 'goose', requested: null, model: null, effort: null },
    state: 'running',
    outcome: null,
    host: 'tmux',
    cwd: '/work',
    launched: { kind: 'prompt', text: 'hi' },
    name: null,
    nameSource: null,
    startedAt: '2026-10-09T09:00:00Z',
    endedAt: null,
    exitCode: null,
    harnessSessionId: null,
    logPath: null,
    branch: null,
    prNumber: null,
    operation: null,
    pid: null,
    machine: machineId(),
    ...over,
  }
}

interface Calls {
  ended: { id: string; ts: string; cause: string }[]
  digested: string[]
}

function harness(over: Partial<ReconcileDeps<SessionRecord>> = {}): {
  deps: ReconcileDeps<SessionRecord>
  calls: Calls
} {
  const calls: Calls = { ended: [], digested: [] }
  const deps: ReconcileDeps<SessionRecord> = {
    records: [record()],
    now: NOW,
    graceMs: GRACE,
    dryRun: false,
    backfill: false,
    liveIds: () => new Set(),
    hostOpen: () => false,
    lastEvidence: () => Date.parse('2026-10-09T10:00:00Z'),
    reread: (id) => deps.records.find((r) => r.id === id) ?? null,
    end: (r, ts, cause) => calls.ended.push({ id: r.id, ts, cause }),
    hasAdapter: (harness) => harness === 'aider' || harness === 'goose',
    hasDigest: () => false,
    digest: async (r) => {
      calls.digested.push(r.id)
      return 'done' satisfies BackfillStatus
    },
    ...over,
  }
  return { deps, calls }
}

describe('reconcileSessions', () => {
  test('ends a lost record at its last evidence time, not now', async () => {
    const { deps, calls } = harness()
    const report = await reconcileSessions(deps)
    expect(report.lost).toBe(1)
    expect(report.rows[0]).toMatchObject({ verdict: 'lost', action: 'ended' })
    expect(calls.ended).toEqual([
      {
        id: deps.records[0]!.id,
        ts: '2026-10-09T10:00:00.000Z',
        cause: 'reconcile: no process, pane gone',
      },
    ])
  })

  test('a record gone by the reread is left alone, as ended by someone else', async () => {
    const { deps, calls } = harness({ reread: () => null })
    const report = await reconcileSessions(deps)
    expect(calls.ended).toEqual([])
    expect(report.rows[0]).toMatchObject({
      verdict: 'ended',
      action: 'none',
      reason: 'ended by someone else first',
    })
  })

  test('evidence older than the start (clock skew) ends the record at its start', async () => {
    const { deps, calls } = harness({ lastEvidence: () => Date.parse('2026-10-09T08:00:00Z') })
    await reconcileSessions(deps)
    expect(calls.ended[0]!.ts).toBe('2026-10-09T09:00:00.000Z')
  })

  test('an unparseable startedAt ends at the last evidence instead of throwing', async () => {
    const { deps, calls } = harness({
      records: [
        record({ startedAt: 'garbage' }),
        record({ id: '22222222-2222-4222-8222-222222222222' }),
      ],
    })
    const report = await reconcileSessions(deps)
    expect(report.lost).toBe(2)
    expect(calls.ended.map((e) => e.ts)).toEqual([
      '2026-10-09T10:00:00.000Z',
      '2026-10-09T10:00:00.000Z',
    ])
  })

  test('leaves a live, quiet-but-recent or unknown record alone', async () => {
    for (const over of [
      { liveIds: () => new Set(['11111111-1111-4111-8111-111111111111']) },
      { lastEvidence: () => NOW.getTime() - 1000 },
      { liveIds: () => null },
      { hostOpen: () => true },
    ]) {
      const { deps, calls } = harness(over)
      const report = await reconcileSessions(deps)
      expect(report.lost).toBe(0)
      expect(calls.ended).toEqual([])
    }
  })

  test('a host probe that throws is unknown: nothing is ended', async () => {
    const { deps, calls } = harness({
      hostOpen: () => {
        throw new Error('host did not answer')
      },
    })
    const report = await reconcileSessions(deps)
    expect(report.unknown).toBe(1)
    expect(report.lost).toBe(0)
    expect(calls.ended).toEqual([])
  })

  test('a dry run reports what would end and writes nothing', async () => {
    const { deps, calls } = harness({ dryRun: true })
    const report = await reconcileSessions(deps)
    expect(report.rows[0]).toMatchObject({ verdict: 'lost', action: 'would-end' })
    expect(report.lost).toBe(1)
    expect(calls.ended).toEqual([])
  })

  test("another machine's record is history, never touched", async () => {
    const { deps, calls } = harness({ records: [record({ machine: 'elsewhere' })] })
    expect((await reconcileSessions(deps)).rows).toEqual([])
    expect(calls.ended).toEqual([])
  })

  test('a given machine id decides which records are this machine', async () => {
    const theirs = record({ machine: 'm-other' })
    const ours = record({ id: '22222222-2222-4222-8222-222222222222', machine: 'm-given' })
    const { deps, calls } = harness({ records: [theirs, ours], machine: 'm-given' })
    const report = await reconcileSessions(deps)
    expect(calls.ended.map((e) => e.id)).toEqual([ours.id])
    expect(report.rows.map((r) => [r.id, r.harness, r.action])).toEqual([
      [ours.id, 'goose', 'ended'],
    ])
  })

  test('race: a hook that ended the record since the listing wins', async () => {
    const stale = record()
    const { deps, calls } = harness({
      records: [stale],
      reread: () => record({ state: 'ended', outcome: 'ok', endedAt: '2026-10-09T11:00:00Z' }),
    })
    const report = await reconcileSessions(deps)
    expect(calls.ended).toEqual([])
    expect(report.rows[0]).toMatchObject({ action: 'none', reason: 'ended by someone else first' })
    expect(report.lost).toBe(0)
  })

  test('an ended record with a live process is reported, never revived', async () => {
    const ended = record({ state: 'ended', outcome: 'ok', endedAt: '2026-10-09T11:00:00Z' })
    const { deps, calls } = harness({ records: [ended], liveIds: () => new Set([ended.id]) })
    const report = await reconcileSessions(deps)
    expect(report.rows[0]).toMatchObject({ verdict: 'ended-but-live', action: 'none' })
    expect(calls.ended).toEqual([])
  })

  test('a record just ended is backfilled through the adapter registry', async () => {
    const { deps, calls } = harness()
    const report = await reconcileSessions(deps)
    expect(report.rows[0]!.backfill).toBe('done')
    expect(calls.digested).toEqual([deps.records[0]!.id])
  })

  test('a harness with no adapter reports "no adapter" and is not digested', async () => {
    const { deps, calls } = harness({
      records: [record({ harness: 'other' })],
      hasAdapter: () => false,
    })
    const report = await reconcileSessions(deps)
    expect(report.rows[0]).toMatchObject({ action: 'ended', backfill: 'no adapter' })
    expect(calls.digested).toEqual([])
  })

  test('--backfill digests ended records without a marker, once', async () => {
    const ended = record({ state: 'ended', outcome: 'ok', endedAt: '2026-10-09T11:00:00Z' })
    const marked = record({
      id: '22222222-2222-4222-8222-222222222222',
      state: 'ended',
      outcome: 'ok',
      endedAt: '2026-10-09T11:00:00Z',
    })
    const { deps, calls } = harness({
      records: [ended, marked],
      backfill: true,
      hasDigest: (r) => r.id === marked.id,
    })
    const report = await reconcileSessions(deps)
    expect(calls.digested).toEqual([ended.id])
    expect(report.rows.map((r) => r.id)).toEqual([ended.id])
  })

  test('without --backfill an old ended record is not looked at', async () => {
    const ended = record({ state: 'ended', outcome: 'ok', endedAt: '2026-10-09T11:00:00Z' })
    const { deps, calls } = harness({ records: [ended] })
    expect((await reconcileSessions(deps)).rows).toEqual([])
    expect(calls.digested).toEqual([])
  })

  test('--backfill --dry-run digests nothing', async () => {
    const ended = record({ state: 'ended', outcome: 'ok', endedAt: '2026-10-09T11:00:00Z' })
    const { deps, calls } = harness({ records: [ended], backfill: true, dryRun: true })
    const report = await reconcileSessions(deps)
    expect(report.rows[0]!.backfill).toBe('would backfill')
    expect(calls.digested).toEqual([])
  })
})

describe('BACKFILL_STATUSES', () => {
  test('lists every status a digest can report', () => {
    expect(BACKFILL_STATUSES).toEqual([
      'done',
      'partial',
      'pending',
      'busy',
      'skipped',
      'failed',
      'no adapter',
      'would backfill',
    ])
  })
})

describe('endedAsLost', () => {
  test('true only for an ended record with outcome lost', () => {
    expect(endedAsLost({ state: 'ended', outcome: 'lost' })).toBe(true)
    expect(endedAsLost({ state: 'ended', outcome: 'ok' })).toBe(false)
    expect(endedAsLost({ state: 'running', outcome: null })).toBe(false)
  })
})
