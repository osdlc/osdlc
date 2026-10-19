/**
 * `sdlc task retry <task>` — lift the loop's hold on a task whose runs kept
 * failing ([[T-I3LS]]).
 *
 * A failed-check draft is re-dispatched by the `work` tick as a fix attempt
 * until the task's last `MAX_CONSECUTIVE_FAILURES` runs ended not-clean; the
 * tick then parks it (one `task.parked` notification) and starts it no more.
 * This op clears the failure count and the "already notified" mark, so the
 * next tick tries again. It touches nothing else: no lease, branch, PR or
 * check record. The same hold also lifts when a person's session reaches
 * `sdlc task begin`.
 */

import { z } from 'zod'

import { resolveTarget } from '@lib/model/corpus/resolve'
import { scanEntities } from '@lib/model/read'
import { defineOp, OpError } from '@lib/registry'
import {
  clearWorkRunFailures,
  onFailureHold,
  readWorkRun,
} from '@lib/services/orchestrator/work-runs'

const input = z.object({
  task: z.string().describe('Task to retry: a basename or a bare id (e.g. T-I3LS).'),
})

const output = z.object({
  basename: z.string(),
  /** True when the task was on hold and the hold is now lifted. */
  unparked: z.boolean(),
  /** Not-clean runs in a row the record held before this call. */
  failures: z.number().int(),
})

export default defineOp({
  path: ['task', 'retry'],
  summary:
    "Lift the work loop's hold on a task whose runs kept failing, so the next tick retries it.",
  mutating: true,
  needs: ['project'],
  input,
  output,
  cli: {
    positionals: ['task'],
    render: (out, io) =>
      io.stdout(
        out.unparked
          ? `${out.basename}: hold lifted (${out.failures} failed runs cleared)\n`
          : `${out.basename}: not on hold${out.failures > 0 ? ` (${out.failures} failed runs counted, below the bound)` : ''}\n`,
      ),
  },
  handler: (args, ctx) => {
    const names = new Set(scanEntities('task', ctx.projectRoot).map((row) => row.basename))
    const basename = resolveTarget(args.task, names)
    if (basename === null) throw new OpError('REF_NOT_FOUND', `no task matches ${args.task}`)
    const rec = readWorkRun(ctx.projectRoot, basename)
    const failures = rec?.failures ?? 0
    const unparked = rec !== null && onFailureHold(rec)
    if (!ctx.dryRun) clearWorkRunFailures(ctx.projectRoot, basename)
    return { basename, unparked, failures }
  },
})
