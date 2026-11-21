/**
 * The unattended run: which candidates `clean --auto` may clean with no person
 * present, and the report it leaves.
 *
 * The subset is fixed and grants nothing: a candidate its owner marked
 * `unattended: true` that nothing refuses or protests.
 */

import { stripControls } from '@osdlc/ux'

import { sizeOf } from './artifacts.ts'
import type { Receipt } from './plan.ts'
import type { Candidate, Objection } from './types.ts'

/** A candidate the run did not clean, for the report's "left for review" list. */
export interface LeftRow {
  id: string
  why: string
  /** The refusals and protests on it, as `level code`. */
  objections: string[]
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
  /** Candidates the run picked and did not clean, with the reason. */
  failed: { id: string; reason: string }[]
  left: LeftRow[]
  bytesFreed: number
}

/** The ids `clean --auto` cleans: `unattended: true`, and no refuse or protest; a note does not hold one. */
export function selectUnattended(
  candidates: readonly Candidate[],
  objections: readonly Objection[],
): string[] {
  const held = new Set(objections.filter((o) => o.level !== 'note').map((o) => o.candidate))
  return candidates.filter((c) => c.unattended === true && !held.has(c.id)).map((c) => c.id)
}

/** Bytes each picked candidate holds now, measured before the run removes it. */
export function measure(
  candidates: readonly Candidate[],
  ids: readonly string[],
): Map<string, number> {
  const wanted = new Set(ids)
  const sizes = new Map<string, number>()
  for (const c of candidates) {
    if (!wanted.has(c.id)) continue
    sizes.set(c.id, c.bytes ?? (c.kind === 'worktree' ? sizeOf(c.path) : 0))
  }
  return sizes
}

/** Every surveyed candidate the run did not clean, with its refusals and protests. */
export function leftForReview(
  candidates: readonly Candidate[],
  objections: readonly Objection[],
  cleaned: ReadonlySet<string>,
): LeftRow[] {
  return candidates
    .filter((c) => !cleaned.has(c.id))
    .map((c) => ({
      id: c.id,
      why: c.why,
      objections: objections
        .filter((o) => o.candidate === c.id && o.level !== 'note')
        .map((o) => `${o.level} ${o.code}`),
    }))
}

/** The candidates a receipt shows were removed. */
export const cleanedIds = (r: Receipt): string[] => [
  ...r.steps.filter((s) => s.result === 'ok').map((s) => s.id),
]

export function failedIds(r: Receipt): { id: string; reason: string }[] {
  const failed = r.steps
    .filter((s) => s.result === 'failed' || s.result === 'skipped')
    .map((s) => ({ id: s.id, reason: s.error ?? s.result }))
  const dropped = r.dropped.map((d) => ({ id: d.id, reason: `${d.reason}: ${d.detail}` }))
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

/** The report as text, control characters stripped. */
export function renderAutoReport(r: AutoReport): string {
  const lines = [`host-cleaner clean --auto: ${r.status}`, `freed: ${sizeText(r.bytesFreed)}`]
  lines.push(`cleaned (${r.cleaned.length})`)
  for (const c of r.cleaned) lines.push(`  ${sizeText(c.bytes).padStart(9)}  ${c.id}`)
  if (r.failed.length > 0) {
    lines.push(`not cleaned (${r.failed.length})`)
    for (const f of r.failed) lines.push(`  ${f.id}: ${f.reason}`)
  }
  lines.push(`left for review (${r.left.length})`)
  for (const l of r.left) {
    lines.push(`  ${l.id}`, `          ${l.why}`)
    if (l.objections.length > 0) lines.push(`          ${l.objections.join(', ')}`)
  }
  if (r.receipt !== null) lines.push(`receipt: ${r.receipt}`)
  return `${stripControls(lines.join('\n'), { newline: true })}\n`
}
