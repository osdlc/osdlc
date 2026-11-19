/**
 * The plan: repo-cleaner's, with the host rows beside it in one file. A host
 * row keeps its verdict, action and risks, and its evidence as the
 * fingerprint a re-check compares with repo-cleaner's rule.
 */

import { readFileSync } from 'node:fs'
import { z } from 'zod'

import { PlanSchema, plan as repoPlan, writeJsonAtomic } from '@osdlc/repo-cleaner'

import { HostCleanerError, type HostRow } from './adapter.ts'
import type { HostSweep } from './sweep.ts'

export const HOST_PLAN_VERSION = 1

export const HostPlanRowSchema = z.object({
  id: z.string().min(1),
  adapter: z.string(),
  verdict: z.enum(['delete', 'review', 'keep', 'blocked']),
  action: z.string().nullable(),
  risks: z.array(z.string()),
  fingerprint: z.record(z.string(), z.unknown()),
})

export type HostPlanRow = z.infer<typeof HostPlanRowSchema>

export const HostPlanSchema = z.object({
  version: z.literal(HOST_PLAN_VERSION),
  createdAt: z.string(),
  /** The adapters that were active; the re-check runs these and no others. */
  adapters: z.array(z.string()),
  /** repo-cleaner's plan, for its rows. */
  repo: PlanSchema,
  rows: z.array(HostPlanRowSchema),
})

export type HostPlan = z.infer<typeof HostPlanSchema>

/** What a host row's verdict rests on. */
export function hostFingerprint(row: HostRow): Record<string, unknown> {
  return row.evidence
}

/** True when `row` could run without being picked by name. */
export function hostRunnable(row: Pick<HostPlanRow, 'action' | 'verdict'>): boolean {
  return row.action !== null && row.verdict !== 'blocked'
}

/** A plan of `sweep`: repo-cleaner's rows and every host row. */
export function hostPlan(sweep: HostSweep, now: Date = new Date()): HostPlan {
  return {
    version: HOST_PLAN_VERSION,
    createdAt: now.toISOString(),
    adapters: sweep.adapters.filter((a) => a.status === 'active').map((a) => a.name),
    repo: repoPlan(sweep.repo, now),
    rows: sweep.rows.map((row) => ({
      id: row.id,
      adapter: row.adapter,
      verdict: row.verdict,
      action: row.action,
      risks: row.risks,
      fingerprint: hostFingerprint(row),
    })),
  }
}

export function writeHostPlan(path: string, plan: HostPlan): void {
  writeJsonAtomic(path, plan)
}

/** @throws HostCleanerError (`bad-plan`) */
export function parseHostPlan(text: string, source: string): HostPlan {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new HostCleanerError('bad-plan', `cannot read plan ${source}: ${(err as Error).message}`)
  }
  const version = (raw as { version?: unknown } | null)?.version
  if (version !== HOST_PLAN_VERSION) {
    throw new HostCleanerError(
      'bad-plan',
      `plan ${source} is version ${JSON.stringify(version ?? null)}; this host-cleaner reads version ${HOST_PLAN_VERSION}. Sweep again to make a new plan`,
    )
  }
  const parsed = HostPlanSchema.safeParse(raw)
  if (!parsed.success) {
    throw new HostCleanerError('bad-plan', `bad plan ${source}: ${parsed.error.message}`)
  }
  return parsed.data
}

/** @throws HostCleanerError (`bad-plan`) */
export function readHostPlan(path: string): HostPlan {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch (err) {
    throw new HostCleanerError('bad-plan', `cannot read plan ${path}: ${(err as Error).message}`)
  }
  return parseHostPlan(text, path)
}
