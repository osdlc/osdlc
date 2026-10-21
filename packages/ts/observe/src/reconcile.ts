/**
 * Reconcile: end the records that never got an end. A launcher killed mid-run,
 * a pane closed under a hands-off host, a harness with no hooks (`capture:
 * launch-only`) all leave a record `running` forever; this looks for evidence
 * that the session is gone and, only with enough of it, moves the record to
 * `ended` with outcome `lost`. Reconcile never ends a record any other way and
 * never revives one.
 *
 * Everything here is decision and orchestration over INJECTED probes: it imports
 * no config, host registry or adapter. A consumer wires the real probes.
 *
 * `lost` is terminal. A hook that arrives for such a record should be recorded
 * as a mismatch ({@link endedAsLost} tells) and never revive it; the reducer
 * already ignores a second `ended` and a second `outcome`, so a reconciler
 * racing a hook (or another reconciler) needs no lock. The record is re-read
 * immediately before the end is written for that reason.
 *
 * The decision ({@link decideReconcile} and its types) is stable. The run over
 * a store ({@link reconcileSessions} and its types) is experimental.
 */

import { isThisMachine, machineId } from './machine.ts'
import type { SessionOutcome, SessionRunState } from './model.ts'

/** The record fields reconcile reads; any consumer's session record has them. */
export interface ReconcilableRecord {
  id: string
  harness: string
  host: string | null
  state: SessionRunState
  outcome: SessionOutcome | null
  startedAt: string
  machine: string
}

/** Default grace: it guards a slow `ps` and an asynchronous transcript, not a slow agent. */
export const DEFAULT_GRACE_MS = 15 * 60_000

/** What the probes say about one non-ended session. `null` is "could not tell". */
export interface ReconcileEvidence {
  /** A process tagged with the session id is running (children count). `null`: the scan could not run (unsupported platform, `ps` failed). */
  process: boolean | null
  /**
   * The host reports a pane for this harness at this cwd. `null`: the host has no `find`
   * or the record has no host to ask. `'failed'`: asking threw, which is not evidence of absence.
   */
  hostOpen: boolean | null | 'failed'
  /** Milliseconds since the newest sign of life (events, activity, transcript). */
  quietMs: number
  /** How long a session may be quiet, with no process and no pane, before it counts as lost. */
  graceMs: number
}

/**
 * What {@link decideReconcile} concluded: `live` (a process or a pane), `quiet`
 * (no process, but within the grace period), `unknown` (a probe could not tell)
 * or `lost` (end the record).
 */
export type ReconcileVerdict = 'live' | 'quiet' | 'unknown' | 'lost'

/** A {@link ReconcileVerdict} and the reason for it. */
export interface ReconcileDecision {
  verdict: ReconcileVerdict
  /** For `lost`, becomes the `state_changed` cause; for the others, the report's reason. */
  reason: string
}

/**
 * The decision table. Ends a record only on two agreeing absences plus grace:
 * no process, and no pane (or a host with nothing to ask, where the process probe
 * stands alone); never on unknown process evidence or a host probe that failed.
 */
export function decideReconcile(e: ReconcileEvidence): ReconcileDecision {
  if (e.process === true) return { verdict: 'live', reason: 'a process carries the session id' }
  if (e.hostOpen === true) return { verdict: 'live', reason: 'the host has a pane open' }
  if (e.process === null) {
    return { verdict: 'unknown', reason: 'processes could not be scanned' }
  }
  if (e.hostOpen === 'failed') {
    return { verdict: 'unknown', reason: 'the host could not be asked (the probe failed)' }
  }
  if (e.quietMs < e.graceMs) {
    return { verdict: 'quiet', reason: 'no process, but active within the grace period' }
  }
  return {
    verdict: 'lost',
    reason: e.hostOpen === false ? 'no process, pane gone' : 'no process, no host to ask',
  }
}

/** The cause a reconcile end carries on its `state_changed` event. Internal: not exported from the package entry. */
export const reconcileCause = (reason: string): string => `reconcile: ${reason}`

/** Whether `record` was ended by reconcile (outcome `lost`): a later hook for it is a mismatch. */
export function endedAsLost(record: Pick<ReconcilableRecord, 'state' | 'outcome'>): boolean {
  return record.state === 'ended' && record.outcome === 'lost'
}

/**
 * What a digest backfill did for one record during {@link reconcileSessions}.
 *
 * @experimental
 */
export const BACKFILL_STATUSES = [
  'done',
  'partial',
  'pending',
  'busy',
  'skipped',
  'failed',
  'no adapter',
  'would backfill',
] as const

/**
 * One of {@link BACKFILL_STATUSES}.
 *
 * @experimental
 */
export type BackfillStatus = (typeof BACKFILL_STATUSES)[number]

/**
 * One record's line in a {@link ReconcileReport}.
 *
 * @experimental
 */
export interface ReconcileRow<R extends ReconcilableRecord = ReconcilableRecord> {
  id: string
  harness: R['harness']
  host: R['host']
  /** The record's state when looked at. */
  state: R['state']
  /** `ended-but-live`: an ended record whose process still runs; it is never revived (a relaunch is a new session). */
  verdict: ReconcileVerdict | 'ended-but-live' | 'ended'
  reason: string
  /** `ended`: the record was moved to ended/lost. `would-end`: a dry run would. */
  action: 'none' | 'ended' | 'would-end'
  /** Present when a digest was considered. */
  backfill?: BackfillStatus
}

/**
 * What {@link reconcileSessions} works over: the records and the probes, all
 * injected.
 *
 * @experimental
 */
export interface ReconcileDeps<R extends ReconcilableRecord> {
  /** The records to look at (one store). */
  records: readonly R[]
  /** The current instant. */
  now: Date
  /** See {@link ReconcileEvidence.graceMs}; {@link DEFAULT_GRACE_MS} is the usual value. */
  graceMs: number
  /** Report what would be ended and backfilled, and write nothing. */
  dryRun: boolean
  /** This machine's id; only its records are reconciled. Defaults to `machineId()`, with that function's side effects. */
  machine?: string | undefined
  /** Also digest already-ended records that have no digest marker. */
  backfill: boolean
  /** Ids of running sessions, or `null` when the scan could not run. */
  liveIds: () => ReadonlySet<string> | null
  /** The host's answer for a non-ended record; `null` when there is no host to ask. Throws when asking failed: that reads as unknown, never as gone. */
  hostOpen: (record: R) => boolean | null
  /** Instant (ms) of the newest sign of life for `record`, never before its start. */
  lastEvidence: (record: R) => number
  /** The record as it is now (fresh read), or `null`. */
  reread: (id: string) => R | null
  /** Append the end (`state_changed`, `outcome` lost, `ended`) stamped `ts`. */
  end: (record: R, ts: string, cause: string) => void
  /** Whether the harness has an adapter, i.e. a digest can run. */
  hasAdapter: (harness: R['harness']) => boolean
  /** Whether the session already has a digest marker. */
  hasDigest: (record: R) => boolean
  /** Run the digest; never throws. */
  digest: (record: R) => Promise<BackfillStatus>
}

/**
 * What {@link reconcileSessions} did: a row per record it reports on, and the
 * count of each verdict.
 *
 * @experimental
 */
export interface ReconcileReport<R extends ReconcilableRecord = ReconcilableRecord> {
  rows: ReconcileRow<R>[]
  /** Records ended (or that a dry run would end). */
  lost: number
  /** Records with a live process or pane. */
  live: number
  /** Records with no process, still within the grace period. */
  quiet: number
  /** Records a probe could not decide. */
  unknown: number
}

/** An instant (ms) as the RFC 3339 string events carry. */
const iso = (ms: number): string => new Date(ms).toISOString()

async function backfillOf<R extends ReconcilableRecord>(
  deps: ReconcileDeps<R>,
  record: R,
): Promise<BackfillStatus | undefined> {
  if (!deps.hasAdapter(record.harness)) return 'no adapter'
  if (deps.hasDigest(record)) return undefined
  return deps.dryRun ? 'would backfill' : await deps.digest(record)
}

function askHost<R extends ReconcilableRecord>(
  deps: ReconcileDeps<R>,
  record: R,
): boolean | null | 'failed' {
  try {
    return deps.hostOpen(record)
  } catch {
    return 'failed'
  }
}

/**
 * Reconcile `deps.records` (this machine's only; another machine's records are
 * history). A non-ended record is probed and, when the table says `lost`, ended
 * at the last evidence time, so duration and cost windows stay true. With
 * `backfill`, an ended record without a digest marker is digested too; a record
 * just ended always is.
 *
 * @experimental
 */
export async function reconcileSessions<R extends ReconcilableRecord>(
  deps: ReconcileDeps<R>,
): Promise<ReconcileReport<R>> {
  const rows: ReconcileRow<R>[] = []
  const machine = deps.machine ?? machineId()
  const live = deps.liveIds()
  for (const record of deps.records) {
    if (!isThisMachine(record, machine)) continue
    const base = { id: record.id, harness: record.harness, host: record.host, state: record.state }
    if (record.state === 'ended') {
      const alive = live?.has(record.id) === true
      const backfill = deps.backfill ? await backfillOf(deps, record) : undefined
      if (!alive && backfill === undefined) continue
      rows.push({
        ...base,
        verdict: alive ? 'ended-but-live' : 'ended',
        reason: alive ? 'ended, but a process still carries the session id' : 'ended',
        action: 'none',
        ...(backfill === undefined ? {} : { backfill }),
      })
      continue
    }

    const evidenceAt = deps.lastEvidence(record)
    const decision = decideReconcile({
      process: live === null ? null : live.has(record.id),
      hostOpen: askHost(deps, record),
      quietMs: deps.now.getTime() - evidenceAt,
      graceMs: deps.graceMs,
    })
    if (decision.verdict !== 'lost') {
      rows.push({ ...base, ...decision, action: 'none' })
      continue
    }
    if (deps.dryRun) {
      rows.push({ ...base, ...decision, action: 'would-end' })
      continue
    }
    // A hook or another reconciler may have ended it since the listing; the fresh read wins.
    const fresh = deps.reread(record.id)
    if (fresh === null || fresh.state === 'ended') {
      rows.push({
        ...base,
        verdict: 'ended',
        reason: 'ended by someone else first',
        action: 'none',
      })
      continue
    }
    deps.end(
      fresh,
      iso(Math.max(evidenceAt, Date.parse(fresh.startedAt))),
      reconcileCause(decision.reason),
    )
    const backfill = await backfillOf(deps, fresh)
    rows.push({
      ...base,
      ...decision,
      action: 'ended',
      ...(backfill === undefined ? {} : { backfill }),
    })
  }
  return {
    rows,
    lost: rows.filter((r) => r.action !== 'none').length,
    live: rows.filter((r) => r.verdict === 'live').length,
    quiet: rows.filter((r) => r.verdict === 'quiet').length,
    unknown: rows.filter((r) => r.verdict === 'unknown').length,
  }
}
