/**
 * Reconcile: the decision that ends a record whose session is gone (stable),
 * and the run over a store (experimental).
 */

import { describe, expect, test } from 'vitest'

import {
  BACKFILL_STATUSES,
  decideReconcile,
  DEFAULT_GRACE_MS,
  endedAsLost,
  reconcileSessions,
  type BackfillStatus,
  type ReconcilableRecord,
  type ReconcileDecision,
  type ReconcileDeps,
  type ReconcileEvidence,
  type ReconcileReport,
  type ReconcileRow,
  type ReconcileVerdict,
} from '@osdlc/observe/session'

describe('the decision', () => {
  test('a record ends as lost only on two agreeing absences past the grace period', () => {
    const evidence: ReconcileEvidence = {
      process: false, // no running process carries the session id
      hostOpen: false, // the terminal host has no pane for it
      quietMs: 20 * 60_000, // nothing heard for 20 minutes
      graceMs: DEFAULT_GRACE_MS, // 15 minutes
    }

    const decision: ReconcileDecision = decideReconcile(evidence)

    expect(decision).toEqual({ verdict: 'lost', reason: 'no process, pane gone' })
  })

  test('a scan that could not run never ends a record', () => {
    const verdict: ReconcileVerdict = decideReconcile({
      process: null,
      hostOpen: false,
      quietMs: 24 * 60 * 60_000,
      graceMs: DEFAULT_GRACE_MS,
    }).verdict

    expect(verdict).toBe('unknown')
  })

  test('a record reconcile ended is ended and lost', () => {
    const record: Pick<ReconcilableRecord, 'state' | 'outcome'> = {
      state: 'ended',
      outcome: 'lost',
    }

    expect(endedAsLost(record)).toBe(true)
  })
})

describe('the run over a store (experimental)', () => {
  test('ends the lost records of this machine, through injected probes', async () => {
    const record: ReconcilableRecord = {
      id: 's-1',
      harness: 'aider',
      host: 'tmux',
      state: 'running',
      outcome: null,
      startedAt: '2026-10-17T08:00:00.000Z',
      machine: 'm-0123456789abcdef',
    }
    const ended: string[] = []
    const deps: ReconcileDeps<ReconcilableRecord> = {
      records: [record],
      machine: 'm-0123456789abcdef',
      now: new Date('2026-10-17T10:00:00.000Z'),
      graceMs: DEFAULT_GRACE_MS,
      dryRun: false,
      backfill: false,
      liveIds: () => new Set(),
      hostOpen: () => false,
      lastEvidence: () => Date.parse('2026-10-17T08:30:00.000Z'),
      reread: () => record,
      end: (r, ts, cause) => ended.push(`${r.id} ${ts} ${cause}`),
      hasAdapter: () => false,
      hasDigest: () => false,
      digest: async (): Promise<BackfillStatus> => 'skipped',
    }

    const report: ReconcileReport = await reconcileSessions(deps)
    const row: ReconcileRow | undefined = report.rows[0]

    expect(report.lost).toBe(1)
    expect(row).toMatchObject({
      id: 's-1',
      verdict: 'lost',
      action: 'ended',
      backfill: 'no adapter',
    })
    expect(ended).toEqual(['s-1 2026-10-17T08:30:00.000Z reconcile: no process, pane gone'])
    expect(BACKFILL_STATUSES).toContain(row?.backfill)
  })
})
