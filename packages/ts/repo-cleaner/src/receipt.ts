/** What a run did, step by step, rewritten after every step. */

import { z } from 'zod'

import { RowIdSchema } from './plan.ts'

/** The receipt format's version, written into every receipt. */
export const RECEIPT_VERSION = 2

/**
 * Why a row did not run:
 *
 *   `gone`         no longer in the sweep
 *   `blocked`      the sweep now finds a blocker
 *   `keep`         the sweep keeps it for structure; it has no action
 *   `held`         a branch whose worktree this run does not remove
 *   `needs-pick`   not judged `delete`; it runs only when picked
 *   `changed`      its evidence moved since the plan
 *   `not-allowed`  it carries a risk that was not allowed
 *   `duplicate`    another checkout of the same remote deletes the same branch
 *   `spared`       the same remote branch is spared through another checkout
 */
export const DROP_REASONS = [
  'gone',
  'blocked',
  'keep',
  'held',
  'needs-pick',
  'changed',
  'not-allowed',
  'duplicate',
  'spared',
] as const

export type DropReason = (typeof DROP_REASONS)[number]

export const DroppedSchema = z.object({
  repo: z.string(),
  row: RowIdSchema,
  reason: z.enum(DROP_REASONS),
  detail: z.string(),
})

export type Dropped = z.infer<typeof DroppedSchema>

export const STEP_ACTIONS = [
  'verify-remote',
  'unlock-worktree',
  'remove-worktree',
  'delete-branch',
  'delete-remote',
  'prune-worktrees',
] as const

export const StepSchema = z.object({
  repo: z.string(),
  /** Null for the closing prune, which belongs to no row. */
  row: RowIdSchema.nullable(),
  action: z.enum(STEP_ACTIONS),
  command: z.string(),
  expectedSha: z.string().nullable(),
  result: z.enum(['pending', 'would-run', 'ok', 'failed']),
  error: z.string().nullable(),
  verification: z.string().nullable(),
})

export type Step = z.infer<typeof StepSchema>

export const ReceiptSchema = z.object({
  version: z.literal(RECEIPT_VERSION),
  /** Where the plan came from: a path, `(stdin)`, or `(swept)`. */
  plan: z.string(),
  status: z.enum(['dry-run', 'running', 'complete', 'failed']),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  dropped: z.array(DroppedSchema),
  steps: z.array(StepSchema),
})

export type Receipt = z.infer<typeof ReceiptSchema>
