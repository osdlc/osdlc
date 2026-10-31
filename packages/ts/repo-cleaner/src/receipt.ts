/** What `applyPlan` did, step by step, rewritten after every step. */

import { z } from 'zod'

import { PLAN_CATEGORIES } from './plan.ts'

export const RowRefSchema = z.object({ category: z.enum(PLAN_CATEGORIES), id: z.string() })

export type RowRef = z.infer<typeof RowRefSchema>

export const DroppedSchema = RowRefSchema.extend({
  repo: z.string(),
  reason: z.enum(['gone', 'not-deletable', 'needs-review', 'facts-changed', 'not-authorized']),
  detail: z.string(),
})

export type Dropped = z.infer<typeof DroppedSchema>

export const StepSchema = z.object({
  repo: z.string(),
  /** Null for the closing prune, which belongs to no row. */
  row: RowRefSchema.nullable(),
  action: z.enum([
    'unlock-worktree',
    'remove-worktree',
    'delete-local',
    'delete-remote',
    'prune-worktrees',
  ]),
  command: z.string(),
  expected_sha: z.string().nullable(),
  result: z.enum(['pending', 'would-run', 'ok', 'failed']),
  error: z.string().nullable(),
  verification: z.string().nullable(),
})

export type Step = z.infer<typeof StepSchema>

export const ReceiptSchema = z.object({
  version: z.literal(1),
  plan: z.string(),
  status: z.enum(['dry-run', 'applying', 'complete', 'failed']),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  dropped: z.array(DroppedSchema),
  steps: z.array(StepSchema),
})

export type Receipt = z.infer<typeof ReceiptSchema>
