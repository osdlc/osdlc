/**
 * The unattended run: which rows `--auto` may clean with no person present,
 * and the report it leaves.
 *
 * The subset is fixed and grants no risk: an artifact row its adapter marked
 * `unattended` (idle past the threshold, nothing building in its checkout),
 * and a worktree row judged `delete` with no risk. A worktree with a live
 * holder is `blocked` by the sweep, so it never qualifies. Branch rows, host
 * rows of any other kind and every `review` row are left for a person.
 */

import type { Row } from '@osdlc/repo-cleaner'

import type { HostRow } from './adapter.ts'
import { sizeOf } from './artifacts.ts'
import type { HostReceipt } from './clean.ts'
import type { HostSweep } from './sweep.ts'

/** What a row was judged and why, for the report's "left for review" list. */
export interface LeftRow {
  id: string
  verdict: string
  why: string
  risks: string[]
}

export interface CleanedRow {
  id: string
  bytes: number
}

export interface AutoReport {
  startedAt: string
  finishedAt: string
  status: 'complete' | 'failed' | 'nothing-to-clean'
  receipt: string | null
  cleaned: CleanedRow[]
  /** Rows the run picked and did not clean, with the reason. */
  failed: { id: string; reason: string }[]
  left: LeftRow[]
  bytesFreed: number
}

const isUnattendedArtifact = (row: HostRow): boolean =>
  row.kind === 'artifact' &&
  row.verdict === 'delete' &&
  row.action !== null &&
  row.risks.length === 0 &&
  row.evidence.unattended === true

const isUnattendedWorktree = (row: Row): boolean =>
  row.kind === 'worktree' &&
  row.verdict === 'delete' &&
  row.action !== null &&
  row.risks.length === 0

/**
 * The ids `--auto` cleans from `sweep`. Pure: reads the rows and nothing else.
 */
export function selectUnattended(sweep: Pick<HostSweep, 'repo' | 'rows'>): string[] {
  return [
    ...sweep.repo.repos.flatMap((r) => r.rows.filter(isUnattendedWorktree).map((row) => row.id)),
    ...sweep.rows.filter(isUnattendedArtifact).map((row) => row.id),
  ]
}

/** Bytes each picked row holds now, measured before the run removes it. */
export function measureRows(sweep: HostSweep, ids: readonly string[]): Map<string, number> {
  const wanted = new Set(ids)
  const sizes = new Map<string, number>()
  for (const row of sweep.rows) {
    if (!wanted.has(row.id)) continue
    const size = row.evidence.sizeBytes
    sizes.set(row.id, typeof size === 'number' ? size : 0)
  }
  for (const repo of sweep.repo.repos)
    for (const row of repo.rows) {
      if (wanted.has(row.id) && row.kind === 'worktree') sizes.set(row.id, sizeOf(row.name))
    }
  return sizes
}

/** Every row the sweep found that is worth a person's attention and was not cleaned. */
export function leftForReview(sweep: HostSweep, cleaned: ReadonlySet<string>): LeftRow[] {
  const rows: (Row | HostRow)[] = [...sweep.repo.repos.flatMap((r) => r.rows), ...sweep.rows]
  return rows
    .filter((r) => r.verdict !== 'keep' && !cleaned.has(r.id))
    .map((r) => ({ id: r.id, verdict: r.verdict, why: r.why, risks: [...r.risks] }))
}

/** The rows a receipt shows were removed. */
export function cleanedIds(receipt: HostReceipt): string[] {
  const repo = receipt.repo.steps
    .filter(
      (s) =>
        s.result === 'ok' && (s.action === 'remove-worktree' || s.action === 'prune-worktrees'),
    )
    .map((s) => s.row)
  const host = receipt.host.steps.filter((s) => s.result === 'ok').map((s) => s.row)
  return [...new Set([...repo, ...host])]
}

export function failedIds(receipt: HostReceipt): { id: string; reason: string }[] {
  const failed = [...receipt.repo.steps, ...receipt.host.steps]
    .filter((s) => s.result === 'failed')
    .map((s) => ({ id: s.row, reason: s.error ?? 'failed' }))
  // A row gone because an earlier step removed its parent (an artifact inside a removed worktree) was cleaned.
  const dropped = [...receipt.repo.dropped, ...receipt.host.dropped]
    .filter((d) => d.reason !== 'gone')
    .map((d) => ({
      id: d.row,
      reason: `${d.reason}: ${d.detail}`,
    }))
  return [...failed, ...dropped]
}

const sizeText = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}

/** The report as text: what was cleaned, what is left, the bytes freed. */
export function renderAutoReport(r: AutoReport): string {
  const lines = [`host-cleaner --auto: ${r.status}`, `freed: ${sizeText(r.bytesFreed)}`]
  lines.push(`cleaned (${r.cleaned.length})`)
  for (const c of r.cleaned) lines.push(`  ${sizeText(c.bytes).padStart(9)}  ${c.id}`)
  if (r.failed.length > 0) {
    lines.push(`not cleaned (${r.failed.length})`)
    for (const f of r.failed) lines.push(`  ${f.id}: ${f.reason}`)
  }
  lines.push(`left for review (${r.left.length})`)
  for (const l of r.left) {
    lines.push(`  ${l.verdict.padEnd(7)} ${l.id}`, `          ${l.why}`)
    if (l.risks.length > 0) lines.push(`          risks: ${l.risks.join(', ')}`)
  }
  if (r.receipt !== null) lines.push(`receipt: ${r.receipt}`)
  return `${lines.join('\n')}\n`
}
