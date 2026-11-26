/** The flat plan and receipt: one list of candidates, one step per candidate. */

import { readFileSync } from 'node:fs'
import { writeJsonAtomic } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import { COST_DESCRIPTIONS, DROP_REASONS, LEVELS } from './types.ts'

/** 2: a candidate is a path or a ref. A plan of another version is refused (see {@link parsePlan}). */
export const PLAN_VERSION = 2
export const RECEIPT_VERSION = 1

const candidateFields = {
  id: z.string(),
  kind: z.string(),
  owner: z.string(),
  why: z.string(),
  bytes: z.number().optional(),
  evidence: z.record(z.string(), z.unknown()),
  requires: z.array(z.string()).optional(),
  name: z.string().optional(),
  held: z.boolean().optional(),
  costDescription: z.enum(COST_DESCRIPTIONS).optional(),
  unmeasured: z.boolean().optional(),
}

export const CandidateSchema = z.union([
  z.object({
    ...candidateFields,
    path: z.string(),
    ref: z.never().optional(),
    at: z.never().optional(),
  }),
  z.object({
    ...candidateFields,
    ref: z.string(),
    at: z.string().optional(),
    path: z.never().optional(),
  }),
])

export const ObjectionSchema = z.object({
  by: z.string(),
  candidate: z.string(),
  level: z.enum(LEVELS),
  code: z.string(),
  reason: z.string(),
})

export const PlanSchema = z
  .object({
    version: z.literal(PLAN_VERSION),
    createdAt: z.string(),
    /** The targets the plan was swept over, so `clean --plan` checks the same place. */
    targets: z.array(z.string()),
    /** Whether a person named the targets, as `RunCtx.targetsGiven`, so `clean --plan` tells plugins the same. */
    targetsGiven: z.boolean(),
    /** Exactly these candidate ids; null means the default: every one nothing objects to and no owner holds for review. */
    select: z.array(z.string()).nullable(),
    /** Candidate ids run as well as the default or the selection. */
    pick: z.array(z.string()),
    /** Ids, paths, names or globs left alone. */
    spare: z.array(z.string()),
    /** The protest codes granted by name. */
    allow: z.array(z.string()),
    /** The ignore list the plan was swept with; `clean --plan` honours it as well as the current one. */
    ignore: z.array(z.string()).default([]),
    /** The `--descriptor` files the plan was made with; `clean --plan` stops unless it is given each of them. */
    descriptors: z.array(z.string()).optional(),
    warnings: z.array(z.string()),
    candidates: z.array(CandidateSchema),
    objections: z.array(ObjectionSchema),
  })
  .strict()

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

/**
 * Parse a plan's JSON text; `source` names where it came from, for the error.
 * A plan of another version, or a version 2 plan this one cannot read (one
 * written before a field it needs, such as `targetsGiven`), is refused: sweep again.
 */
export function parsePlan(text: string, source: string): Plan {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${source}: not JSON`)
  }
  const version = (json as { version?: unknown } | null)?.version
  if (version !== undefined && version !== PLAN_VERSION) {
    throw new Error(
      `${source}: a version ${JSON.stringify(version)} plan; this host-cleaner reads version ${PLAN_VERSION}: sweep again`,
    )
  }
  const parsed = PlanSchema.safeParse(json)
  if (!parsed.success && version === PLAN_VERSION) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(plan)'}: ${i.message}`)
    throw new Error(
      `${source}: a version ${PLAN_VERSION} plan this host-cleaner cannot read (${issues.join('; ')}): sweep again`,
    )
  }
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
