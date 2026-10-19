/**
 * `sdlc task dispatch <id>` — run the define/implement/check/judge sequence
 * for ONE task on demand, outside a tick.
 *
 * This is the manual escape hatch the Router MVP's added requirements call
 * for: a per-item dispatch that works even while `sdlc orchestrate pause`
 * is active (the pause switch, `dispatch/pause.ts`, is a TICK-level gate —
 * `runWorkTick` reads it once per tick, AFTER its own read-only `task next`/
 * `task inflight` calls, and skips only the per-candidate dispatch loop,
 * same shape as `prs.ts`/`merges.ts`'s pause check; this op calls straight
 * through to `dispatchOneTask`, which has no pause check at all, by
 * construction, the same way the Router's own `deliver()` is pause-agnostic).
 *
 * Reuses `dispatchOneTask` (`@lib/services/orchestrator/ticks/work.ts`) —
 * the EXACT per-basename lease-claim + sequence body `runWorkTick`'s own
 * loop calls, extracted once so this op and the tick can never drift apart.
 * It also writes the same work-run record a tick's run writes (marked `manual`,
 * the caller's pid, no log file), so the `work` tick counts the run and the PR
 * loop covers its PR; Ctrl-C ends the record as cancelled and releases the
 * leases. That means the SAME safety properties apply here as in a tick:
 *   - the `orchestrator.limits.executor.implement` slot backstop still applies
 *     (`claim: 'capped'`) — a manual dispatch does not let a human silently
 *     exceed the cap;
 *   - the per-task `orchestrate-work/<basename>` operation lease and
 *     `lease task acquire` still gate it (`claim: 'lost'`) — this op cannot
 *     race a concurrent tick or another manual dispatch of the same task;
 *   - a pending hook park marker for the task's branch still short-circuits
 *     it (`claim: 'parked'`);
 *   - an open PR on `task/<basename>` (`claim: 'in-review'`) or a branch left by an earlier
 *     run (`claim: 'needs-resume'`) stops it before the task lease (a failed-check draft, whose
 *     last recorded local check failed, is neither: it dispatches as a fix attempt, [[T-I3LS]]);
 *   - an unmet `depends_on` target, or a task that cannot be read, stops it
 *     before the task lease (`claim: 'blocked-deps'`; exit 1 in text output —
 *     JSON output always exits 0, so read `claim`).
 *
 * No `--force`: unlike the Router (`pr route`/`pr update`, whose
 * idempotence is a SIGNATURE-keyed `DeliveryRecord` that `--force` can
 * legitimately re-arm), a task dispatch's only concurrency guard is the
 * lease pair above — there is no delivered-signature ledger to bypass, and
 * force-stealing an actively-held lease would let two runs of
 * define/implement/check/judge collide on the same worktree. `--dry-run`
 * only reports the plan (basename + `would-dispatch`); it claims no lease
 * and calls no workflow.
 *
 * Does NOT run `task next`'s state and autonomy filtering — naming a
 * specific `basename` IS the override for those. A caller who wants the
 * tick's own picks should use `sdlc orchestrate run --loop work` instead.
 */

import { EXIT } from '@sksizer/cli-tool'
import { z } from 'zod'

import { DEFAULT_BASE_HEALTH } from '@lib/config/sections/orchestrator'
import { resolveTarget } from '@lib/model/corpus/resolve'
import { scanEntities } from '@lib/model/read'
import { defineOp, OP_ERROR_EXIT_CODES, OpError } from '@lib/registry'
import { baseHealthWarning } from '@lib/services/orchestrator/base-health'
import { tickCtxFrom } from '@lib/services/orchestrator/ticks/_types'
import { dispatchOneTask } from '@lib/services/orchestrator/ticks/work'
import { FailureDetailSchema, renderFailure } from '@lib/services/orchestrator/work-runs'

import inflightOp from './inflight.ts'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const input = z.object({
  basename: z
    .string()
    .describe('Task to dispatch: a basename (e.g. 2026-01-01-my-task) or a bare id (e.g. T-B76S).'),
})

const parkedSchema = z.object({
  hook: z.string(),
  step: z.string(),
  exitCode: z.number(),
  workflow: z.string().optional(),
})

const output = z.object({
  basename: z.string(),
  claim: z
    .enum([
      'won',
      'lost',
      'parked',
      'capped',
      'blocked-deps',
      'needs-resume',
      'in-review',
      'would-dispatch',
    ])
    .describe(
      "'won': the sequence ran (see `ok`). 'lost': the task's op-lease or task-lease is held " +
        "elsewhere right now — retry later. 'parked': a hook park marker was already pending for " +
        "this task's branch; not dispatched. 'capped': no free orchestrator.limits.executor.implement " +
        "slot right now. 'needs-resume': the branch task/<basename> already exists from an earlier " +
        'run and holds its work; resume it by hand (/sdlc:task-work offers the resume). ' +
        "'in-review': an open PR already has task/<basename> as its head. " +
        "'blocked-deps': a depends_on target is not satisfied, or the task " +
        "could not be read (see `unsatisfied`). 'would-dispatch': --dry-run only.",
    ),
  /** Set only when `claim === 'won'`: whether the define/implement/check/judge sequence completed clean. */
  ok: z.boolean().optional(),
  /** Set only when `ok === false`: the workflow name whose step failed (or that produced the park). */
  failedWorkflow: z.string().optional(),
  ...FailureDetailSchema.shape,
  /** Set when a hook park marker parked the task (`claim === 'parked'`, or `won` with `ok: false`). */
  parked: parkedSchema.optional(),
  /** See `WorkDispatchEntry.unsatisfied` in lib/services/orchestrator/ticks/work.ts. */
  unsatisfied: z.array(z.string()).optional(),
  /** See `WorkDispatchEntry.interrupted` in lib/services/orchestrator/ticks/work.ts. */
  interrupted: z.string().optional(),
})

/**
 * The task basename `ref` names (a full basename or a bare id), else `ref`
 * unchanged. A bare id that several tasks share is an error that names them,
 * not a "task not found".
 */
function resolveBasename(projectRoot: string, ref: string): string {
  const names = new Set(scanEntities('task', projectRoot).map((row) => row.basename))
  const resolved = resolveTarget(ref, names)
  if (resolved !== null) return resolved
  const matches = [...names].filter((n) => n.startsWith(`${ref}-`)).sort()
  if (matches.length > 1) {
    throw new OpError('INVALID_INPUT', `${ref} matches ${matches.join(', ')}; name one in full`)
  }
  return ref
}

/**
 * The CLI exit for a dispatch result: 25 when implement left nothing to gate,
 * the generic failure code for any other failed run or an unmet dependency,
 * 0 otherwise.
 */
export function dispatchExitCode(out: {
  claim: string
  ok?: boolean | undefined
  unsatisfied?: string[] | undefined
  failedReason?: string | undefined
}): number {
  if (out.claim === 'blocked-deps') return EXIT.error
  if (out.claim === 'won' && out.ok === false) {
    return out.failedReason === 'implement-no-worktree'
      ? OP_ERROR_EXIT_CODES.IMPLEMENT_NO_WORKTREE
      : EXIT.error
  }
  return 0
}

// ---------------------------------------------------------------------------
// Op
// ---------------------------------------------------------------------------

export default defineOp({
  path: ['task', 'dispatch'],
  summary:
    'Run the define/implement/check/judge dispatch sequence for one task on demand — the same per-task lease/sequence a work tick uses, callable manually even while `sdlc orchestrate pause` is active.',
  mutating: true,
  // `dispatchOneTask` runs the define/implement/check/judge sequence via
  // `runWorkflow` -> session launch — a child-LLM call at a judgment port
  // ([[S-0004]] mechanism 3), reached transitively the same way `pr route`
  // reaches one through `deliver()`. The marking is op-level (same
  // convention `session launch`/`pr route` use).
  judgmentPort: true,
  needs: ['git'],
  input,
  output,
  cli: {
    positionals: ['basename'],
    render: (out, io) => {
      const failed =
        out.unsatisfied === undefined && out.interrupted === undefined && out.ok === false
          ? renderFailure(out, (summary) => `${out.basename}: ${out.claim} (failed: ${summary})`)
          : null
      io.stdout(
        `${
          failed ??
          `${out.basename}: ${out.claim}${
            out.unsatisfied !== undefined
              ? ` (${out.unsatisfied.join(', ')})`
              : out.interrupted !== undefined
                ? ` (interrupted by ${out.interrupted})`
                : ''
          }`
        }\n`,
      )
      return dispatchExitCode(out)
    },
  },
  handler: async (rawArgs, ctx) => {
    // A short id (`T-B76S`) names the task as well as its full basename does,
    // but `readTask`/`checkDependsOn` need the file's basename. Resolve it once
    // here; an unresolvable ref stays as typed and fails where it is read.
    const args = {
      ...rawArgs,
      basename: resolveBasename(ctx.projectRoot, rawArgs.basename),
    }
    // `noGh: false` matches `runWorkTick`'s own call — `task inflight`'s
    // `awaiting-review` bucket needs a live `gh pr list` to categorize
    // correctly, and `implement` (the only field this op reads) does not
    // depend on it either way.
    const inflight = await inflightOp.handler({ noGh: false }, ctx)
    const { implement: maxImpl } = inflight.limits

    // `--dry-run` is the registry's own global flag (`ctx.dryRun`), not a
    // custom input field — same convention every other op in this registry
    // follows (see `lib/registry.ts`'s `OpCtx.dryRun` doc).
    if (ctx.dryRun) {
      return { basename: args.basename, claim: 'would-dispatch' as const }
    }

    // A red base ([[T-JMFX]]) stops the loop's dispatch, not this one: a person
    // chose this task. Say so on stderr, then run it.
    const warning = baseHealthWarning(
      ctx.projectRoot,
      ctx.sdlcConfig.orchestrator?.base_health ?? DEFAULT_BASE_HEALTH,
    )
    if (warning !== null) ctx.io.stderr(`${warning}\n`)

    const tickCtx = tickCtxFrom(ctx)
    return dispatchOneTask(tickCtx, args.basename, maxImpl)
  },
})
