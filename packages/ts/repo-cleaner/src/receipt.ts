/** What a run did, step by step, rewritten after every step. */

import { z } from 'zod'

import { RowIdSchema } from './plan.ts'

/** The receipt format's version, written into every receipt. */
export const RECEIPT_VERSION = 3

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
  'archive',
  'unlock-worktree',
  'remove-worktree',
  'delete-branch',
  'delete-remote',
  'prune-worktrees',
] as const

/** What an `archive` step pushed: the branch, the commit, and what each parent holds. */
export const ArchiveSchema = z.object({
  remote: z.string(),
  ref: z.string(),
  sha: z.string(),
  /** The archive commit's parents, numbered as git does (`<sha>^2`); parent 1 is the default branch's tip. */
  parents: z.array(
    z.object({
      parent: z.number().int(),
      sha: z.string(),
      source: z.string(),
      rows: z.array(RowIdSchema),
      leftOut: z.array(
        z.object({ path: z.string(), reason: z.enum(['secret', 'excluded', 'too-large']) }),
      ),
    }),
  ),
})

export type ArchiveRecord = z.infer<typeof ArchiveSchema>

export const StepSchema = z.object({
  repo: z.string(),
  /** The row the step acts on; an `archive` step names the first row it holds. */
  row: RowIdSchema,
  action: z.enum(STEP_ACTIONS),
  command: z.string(),
  expectedSha: z.string().nullable(),
  /**
   * `skipped`: an earlier step this one depends on failed, so it did not run;
   * `error` names that step.
   */
  result: z.enum(['pending', 'would-run', 'ok', 'failed', 'skipped']),
  error: z.string().nullable(),
  verification: z.string().nullable(),
  /**
   * The remote no longer listed the branch when the step ran: someone deleted
   * it after the run's re-check. A `delete-remote` step so marked deleted
   * nothing, and the run summary counts it apart. Absent otherwise.
   */
  gone: z.literal(true).optional(),
  /** What an `archive` step pushed; set once it succeeded. */
  archive: ArchiveSchema.optional(),
  /**
   * Bytes a `remove-worktree` step freed: its directory's size on disk (`du`),
   * measured just before the remove. Set once the remove succeeded; null when
   * the measurement failed or timed out. Absent on every other step.
   */
  freedBytes: z.number().int().nonnegative().nullable().optional(),
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
