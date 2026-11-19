/**
 * Cleaning up: `hostCheck` a plan against an approval, then `hostRun` what it
 * shows. repo-cleaner's `check` and `run` take the repo rows; the owning
 * adapter's `execute` takes each host row, after them and in plan order. Both
 * re-check as repo-cleaner does (sweep or gather again, compare fingerprints,
 * grant risks by name), verify each step, and write one receipt.
 *
 * A host row is named by its exact id. Anything else in `pick` and `spare`
 * is a repo-cleaner row. A risk repo-cleaner knows is granted to its rows; any
 * other risk to host rows.
 */

import {
  RISKS,
  RECEIPT_VERSION,
  check,
  run,
  sameFingerprint,
  writeJsonAtomic,
  type Allow,
  type Approval,
  type CheckOptions,
  type DropReason,
  type Preview,
  type Receipt,
  type RunOptions,
} from '@osdlc/repo-cleaner'

import { HostCleanerError, type HostRow } from './adapter.ts'
import { hostFingerprint, hostRunnable, type HostPlan } from './plan.ts'
import {
  chainAnnotate,
  chainRemoveWorktree,
  makeContext,
  resolveAdapters,
  type AdapterReport,
} from './registry.ts'
import type { HostOptions } from './options.ts'
import { gatherHostRows } from './sweep.ts'

export interface HostAllow {
  risk: string
  row?: string | undefined
}

/** What a person approved, over repo and host rows. */
export interface HostApproval {
  pick?: readonly string[] | undefined
  spare?: readonly string[] | undefined
  allow?: readonly (string | HostAllow)[] | undefined
}

/** The host side of an approval. */
export interface HostResolved {
  /** Whether any row was picked, repo or host: without a pick only `delete` rows run. */
  explicit: boolean
  pick: string[]
  spare: string[]
  allow: { risk: string; row: string | null }[]
}

export interface HostDropped {
  row: string
  reason: Exclude<DropReason, 'held' | 'duplicate'>
  detail: string
}

export interface HostStepRecord {
  adapter: string
  row: string
  action: string
  command: string
  result: 'pending' | 'would-run' | 'ok' | 'failed'
  error: string | null
  verification: string | null
}

export interface HostPreview {
  plan: HostPlan
  /** repo-cleaner's preview, for the repo rows. */
  repo: Preview
  approval: HostResolved
  steps: HostStepRecord[]
  dropped: HostDropped[]
  unusedAllows: { risk: string; row: string | null }[]
  adapters: AdapterReport[]
}

export const HOST_RECEIPT_VERSION = 1

export interface HostReceipt {
  version: typeof HOST_RECEIPT_VERSION
  plan: string
  status: 'running' | 'complete' | 'failed'
  startedAt: string
  finishedAt: string | null
  repo: Receipt
  host: { dropped: HostDropped[]; steps: HostStepRecord[] }
}

export type HostCheckOptions = CheckOptions & HostOptions

export interface HostRunOptions extends RunOptions, HostOptions {
  /** Told before each host step, after the repo steps: its index, the host step count and the step. */
  onHostStep?: ((index: number, total: number, step: HostStepRecord) => void) | undefined
}

/** Split an approval into repo-cleaner's and the host's. */
function split(plan: HostPlan, approval: HostApproval): { repo: Approval; host: HostResolved } {
  const hostIds = new Set(plan.rows.map((r) => r.id))
  const picks = approval.pick ?? []
  const spares = approval.spare ?? []
  const repo = {
    pick: [] as string[],
    spare: [] as string[],
    allow: [] as Allow[],
  }
  const host: HostResolved = { explicit: picks.length > 0, pick: [], spare: [], allow: [] }
  for (const p of picks) (hostIds.has(p) ? host.pick : repo.pick).push(p)
  for (const s of spares) (hostIds.has(s) ? host.spare : repo.spare).push(s)
  for (const raw of approval.allow ?? []) {
    const { risk, row } = typeof raw === 'string' ? { risk: raw, row: undefined } : raw
    const isRepoRisk = (RISKS as readonly string[]).includes(risk)
    if (row !== undefined && hostIds.has(row)) host.allow.push({ risk, row })
    else if (isRepoRisk) {
      repo.allow.push({ risk: risk as (typeof RISKS)[number], ...(row !== undefined && { row }) })
      if (row === undefined) host.allow.push({ risk, row: null })
    } else if (row === undefined) host.allow.push({ risk, row: null })
    else {
      throw new HostCleanerError(
        'bad-input',
        `allow ${risk}:${row} names a row the plan does not have`,
      )
    }
  }
  return { repo, host }
}

/**
 * Judge each selected host row against the rows the adapters own now. Pure:
 * `rows` is a fresh gather. A row is dropped when it is gone, blocked,
 * without an action, not judged `delete` and not picked, changed since the
 * plan, or carries a risk not allowed.
 */
export function selectHostRows(
  plan: HostPlan,
  sel: HostResolved,
  rows: readonly HostRow[],
): { accepted: HostRow[]; dropped: HostDropped[] } {
  const spared = new Set(sel.spare)
  const planned = plan.rows.filter(
    (r) => sel.pick.includes(r.id) || (!sel.explicit && hostRunnable(r)),
  )
  const dropped: HostDropped[] = []
  const accepted: HostRow[] = []
  const drop = (row: string, reason: HostDropped['reason'], detail: string): void => {
    dropped.push({ row, reason, detail })
  }
  for (const p of plan.rows.filter((r) => spared.has(r.id)))
    drop(p.id, 'spared', 'spared by the approval')
  for (const p of planned.filter((r) => !spared.has(r.id))) {
    const now = rows.find((r) => r.id === p.id)
    if (now === undefined) drop(p.id, 'gone', 'no adapter owns it now')
    else if (now.verdict === 'blocked') drop(p.id, 'blocked', now.blockers.join(', ') || now.why)
    else if (now.action === null) drop(p.id, 'keep', now.why)
    else if (!sel.explicit && now.verdict !== 'delete') {
      drop(p.id, 'needs-pick', `judged ${now.verdict}; it runs only when picked`)
    } else if (!sameFingerprint(p.fingerprint, hostFingerprint(now))) {
      drop(p.id, 'changed', 'its evidence moved since the plan')
    } else {
      const missing = now.risks.filter(
        (risk) => !sel.allow.some((a) => a.risk === risk && (a.row === null || a.row === now.id)),
      )
      if (missing.length > 0) drop(p.id, 'not-allowed', `needs ${missing.join(', ')}`)
      else accepted.push(now)
    }
  }
  return { accepted, dropped }
}

function record(row: HostRow): HostStepRecord {
  return {
    adapter: row.adapter,
    row: row.id,
    action: row.action ?? '',
    command: row.commands.join('; '),
    result: 'pending',
    error: null,
    verification: null,
  }
}

/** The adapters a plan names, detected now, and the hooks they supply. */
function adaptersFor(plan: HostPlan, opts: HostOptions, roots: readonly string[]) {
  const ctx = makeContext(opts, roots)
  const resolved = resolveAdapters(opts.adapters ?? [], ctx, {
    adapter: plan.adapters,
    noAdapter: opts.noAdapter,
  })
  return { ...resolved, ctx }
}

const roots = (plan: HostPlan): string[] => plan.repo.repos.map((r) => r.root)

/** An empty preview, for an approval that picks no repo row: repo-cleaner would default to all of them. */
function emptyRepoPreview(plan: HostPlan): Preview {
  return {
    plan: plan.repo,
    approval: { pick: [], spare: [], allow: [] },
    steps: [],
    dropped: [],
    unusedAllows: [],
    notes: [],
  }
}

/**
 * What running `plan` under `approval` would do now. Deletes nothing.
 *
 * @throws HostCleanerError for an allow naming a row the plan lacks, and
 *   whatever repo-cleaner's `check` throws.
 */
export function hostCheck(
  plan: HostPlan,
  approval: HostApproval,
  opts: HostCheckOptions = {},
): HostPreview {
  const parts = split(plan, approval)
  const { active, reports, ctx } = adaptersFor(plan, opts, roots(plan))
  const repoOnly = parts.host.explicit && parts.repo.pick?.length === 0
  const repo = repoOnly
    ? emptyRepoPreview(plan)
    : check(plan.repo, parts.repo, {
        ...opts,
        annotate: chainAnnotate(active) ?? opts.annotate,
        removeWorktree: chainRemoveWorktree(active) ?? opts.removeWorktree,
      })
  const { accepted, dropped } = selectHostRows(
    plan,
    parts.host,
    gatherHostRows(active, reports, ctx),
  )
  const unusedAllows = parts.host.allow.filter(
    (a) => !accepted.some((r) => r.risks.includes(a.risk) && (a.row === null || a.row === r.id)),
  )
  const steps = accepted.map(record)
  for (const s of steps) s.result = 'would-run'
  return { plan, repo, approval: parts.host, steps, dropped, unusedAllows, adapters: reports }
}

/**
 * Take the steps `preview` showed: repo-cleaner's first, then each host row
 * through its adapter's `execute`, stopping at the first failure. A row the
 * run's own re-check drops stays dropped. The receipt is rewritten after every
 * step.
 */
export function hostRun(preview: HostPreview, opts: HostRunOptions = {}): HostReceipt {
  const now = opts.now ?? (() => new Date())
  const receipt: HostReceipt = {
    version: HOST_RECEIPT_VERSION,
    plan: opts.source ?? '(memory)',
    status: 'running',
    startedAt: now().toISOString(),
    finishedAt: null,
    repo: {
      version: RECEIPT_VERSION,
      plan: opts.source ?? '(memory)',
      status: 'running',
      startedAt: now().toISOString(),
      finishedAt: null,
      dropped: [],
      steps: [],
    },
    host: { dropped: [...preview.dropped], steps: [] },
  }
  const save = (): void => {
    if (opts.receiptPath !== undefined) writeJsonAtomic(opts.receiptPath, receipt)
  }
  const finish = (status: 'complete' | 'failed'): HostReceipt => {
    receipt.status = status
    receipt.finishedAt = now().toISOString()
    save()
    return receipt
  }
  const { plan } = preview
  const { active, reports, ctx } = adaptersFor(plan, opts, roots(plan))
  const { receiptPath: _own, onStart, onStepDone, ...rest } = opts
  receipt.repo = run(preview.repo, {
    ...rest,
    annotate: chainAnnotate(active) ?? opts.annotate,
    removeWorktree: chainRemoveWorktree(active) ?? opts.removeWorktree,
    onStart: (steps) => {
      receipt.repo.steps = [...steps]
      save()
      onStart?.(steps)
    },
    onStepDone: (i, n, step) => {
      onStepDone?.(i, n, step)
      save()
    },
  })
  if (receipt.repo.status === 'failed') return finish('failed')

  // Only what the preview showed, judged again against what the adapters own now.
  const shown = new Set(preview.steps.map((s) => s.row))
  const sel: HostResolved = { ...preview.approval, pick: [...shown] }
  const { accepted, dropped } = selectHostRows(plan, sel, gatherHostRows(active, reports, ctx))
  const known = new Set(receipt.host.dropped.map((d) => d.row))
  receipt.host.dropped.push(...dropped.filter((d) => !known.has(d.row) && shown.has(d.row)))
  const steps = shown.size === 0 ? [] : accepted.map(record)
  receipt.host.steps = steps
  save()
  for (const [i, step] of steps.entries()) {
    opts.onHostStep?.(i, steps.length, step)
    const row = accepted[i]!
    try {
      const adapter = active.find((a) => a.name === row.adapter)
      if (adapter?.execute === undefined) throw new Error(`adapter ${row.adapter} cannot execute`)
      step.verification = adapter.execute({ row, command: step.command }, ctx)
      step.result = 'ok'
    } catch (err) {
      step.result = 'failed'
      step.error = err instanceof Error ? err.message : String(err)
      return finish('failed')
    }
    save()
  }
  return finish('complete')
}
