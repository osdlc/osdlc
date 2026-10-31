/**
 * The cleanup plan: the deletable rows of a sweep, each with a fingerprint of
 * the facts its verdict rests on. `applyPlan` re-sweeps and drops any row
 * whose fingerprint no longer matches.
 */

import { readFileSync } from 'node:fs'
import { z } from 'zod'

import { AUTHORIZATIONS, type SweepItem } from './types.ts'
import { writeJsonAtomic } from './write-json.ts'

export const PLAN_VERSION = 1

/** The categories a plan can hold, in the order apply runs them. */
export const PLAN_CATEGORIES = ['worktree', 'local_branch', 'remote_branch'] as const

export type PlanCategory = (typeof PLAN_CATEGORIES)[number]

export const PlanRowSchema = z.object({
  category: z.enum(PLAN_CATEGORIES),
  id: z.string(),
  requires: z.array(z.enum(AUTHORIZATIONS)),
  fingerprint: z.record(z.string(), z.unknown()),
})

export type PlanRow = z.infer<typeof PlanRowSchema>

export const PlanRepoSchema = z.object({
  root: z.string(),
  /** The `remote` the sweep ran with; the re-sweep uses the same. */
  remote: z.string().nullable(),
  no_gh: z.boolean(),
  /** The `branch` the sweep was narrowed to; the re-sweep uses the same. */
  branch: z.string().nullable().default(null),
  rows: z.array(PlanRowSchema),
})

export type PlanRepo = z.infer<typeof PlanRepoSchema>

export const PlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  created_at: z.string(),
  repos: z.array(PlanRepoSchema),
})

export type Plan = z.infer<typeof PlanSchema>

/** What planning reads off a row. A host's own row type plans the same way. */
export type PlannableRow = Pick<SweepItem, 'id' | 'facts' | 'requires' | 'deletable'> & {
  category: string
}

export function isPlanCategory(category: string): category is PlanCategory {
  return (PLAN_CATEGORIES as readonly string[]).includes(category)
}

/**
 * The facts a row's verdict rests on. A branch: its sha and its PR's number
 * and state. A worktree: HEAD, branch, how much unlanded work it holds and
 * whether its lock was stale and whether it is on disk, so a lock taken or
 * revived after planning, or a directory that came back, drops the row.
 */
export function fingerprint(item: PlannableRow): Record<string, unknown> {
  const f = item.facts
  if (item.category === 'worktree') {
    return {
      head: f['head'] ?? null,
      branch: f['branch'] ?? null,
      dirty_files: f['dirty_files'] ?? null,
      unpushed_commits: f['unpushed_commits'] ?? null,
      stale_lock: f['stale_lock'] ?? null,
      // Prune or remove: a directory that came back between plan and apply
      // must not turn a prune into a remove.
      on_disk: f['on_disk'] ?? null,
    }
  }
  const pr = f['pr'] as { number?: unknown; state?: unknown } | undefined
  return { sha: f['sha'] ?? null, pr_number: pr?.number ?? null, pr_state: pr?.state ?? null }
}

/** Equal fingerprints, treating a missing key as null. */
export function sameFingerprint(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null)) return false
  }
  return true
}

/** One repository's plan entry: its deletable rows. */
export function planRepo(
  root: string,
  opts: { remote: string | null; noGh: boolean; branch?: string | null },
  items: readonly PlannableRow[],
): PlanRepo {
  const rows: PlanRow[] = []
  for (const item of items) {
    if (!item.deletable || !isPlanCategory(item.category)) continue
    rows.push({
      category: item.category,
      id: item.id,
      requires: item.requires,
      fingerprint: fingerprint(item),
    })
  }
  return { root, remote: opts.remote, no_gh: opts.noGh, branch: opts.branch ?? null, rows }
}

/** A UTC timestamp safe in a file name, e.g. `2026-10-04T12-30-05-123Z`. */
export function fileStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-')
}

export function writePlan(path: string, plan: Plan): void {
  writeJsonAtomic(path, plan)
}

/** A plan file that cannot be read or does not match {@link PlanSchema}. */
export class PlanReadError extends Error {}

/**
 * Parse a plan's JSON text. `source` names where it came from, for the error.
 * @throws PlanReadError
 */
export function parsePlan(text: string, source: string): Plan {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new PlanReadError(
      `cannot read plan ${source}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const parsed = PlanSchema.safeParse(raw)
  if (!parsed.success) throw new PlanReadError(`bad plan ${source}: ${parsed.error.message}`)
  return parsed.data
}

/** @throws PlanReadError */
export function readPlan(path: string): Plan {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch (err) {
    throw new PlanReadError(
      `cannot read plan ${path}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  return parsePlan(text, path)
}
