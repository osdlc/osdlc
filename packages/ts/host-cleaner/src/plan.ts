/** The flat plan and receipt: one list of candidates, one step per candidate. */

import { readFileSync } from 'node:fs'
import { writeJsonAtomic } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import { DROP_REASONS, LEVELS } from './types.ts'

export const PLAN_VERSION = 1
export const RECEIPT_VERSION = 1

export const CandidateSchema = z.object({
  id: z.string(),
  kind: z.string(),
  path: z.string(),
  owner: z.string(),
  why: z.string(),
  bytes: z.number().optional(),
  evidence: z.record(z.string(), z.unknown()),
  requires: z.array(z.string()).optional(),
  unattended: z.boolean().optional(),
})

export const ObjectionSchema = z.object({
  by: z.string(),
  candidate: z.string(),
  level: z.enum(LEVELS),
  code: z.string(),
  reason: z.string(),
})

export const PlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  createdAt: z.string(),
  /** The candidates the person picked by id; null means every one nothing objects to. */
  pick: z.array(z.string()).nullable(),
  /** The protest codes granted by name. */
  allow: z.array(z.string()),
  warnings: z.array(z.string()),
  candidates: z.array(CandidateSchema),
  objections: z.array(ObjectionSchema),
})

export type Plan = z.infer<typeof PlanSchema>

const DroppedSchema = z.object({
  id: z.string(),
  reason: z.enum(DROP_REASONS),
  detail: z.string(),
})

export type Dropped = z.infer<typeof DroppedSchema>

export const StepSchema = z.object({
  id: z.string(),
  owner: z.string(),
  /** The plugins whose `prepare` ran without failing, in order. */
  preparedBy: z.array(z.string()),
  result: z.enum(['ok', 'failed', 'skipped', 'would-run']),
  /** The owner's result sentence; null when the delete did not run. */
  delete: z.string().nullable(),
  /** Why it did not complete: a failed prepare or delete, or the reason it was skipped. */
  error: z.string().nullable(),
  /** Each plugin told after the delete, with its error if it failed. */
  notified: z.array(z.object({ plugin: z.string(), error: z.string().nullable() })),
})

export type Step = z.infer<typeof StepSchema>

export const ReceiptSchema = z.object({
  version: z.literal(RECEIPT_VERSION),
  plan: z.string(),
  status: z.enum(['dry-run', 'running', 'complete', 'failed']),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  warnings: z.array(z.string()),
  dropped: z.array(DroppedSchema),
  steps: z.array(StepSchema),
})

export type Receipt = z.infer<typeof ReceiptSchema>

/** Parse a plan's JSON text; `source` names where it came from, for the error. */
export function parsePlan(text: string, source: string): Plan {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${source}: not JSON`)
  }
  const parsed = PlanSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(
      `${source}: not a host-cleaner plan (version ${PLAN_VERSION}): ${parsed.error.message}`,
    )
  }
  return parsed.data
}

export function readPlan(path: string): Plan {
  return parsePlan(readFileSync(path, 'utf8'), path)
}

export function writePlan(path: string, plan: Plan): void {
  writeJsonAtomic(path, plan)
}

export function writeReceipt(path: string, receipt: Receipt): void {
  writeJsonAtomic(path, receipt)
}
