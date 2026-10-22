/**
 * `sdlc task inflight` — categorise in-flight tasks for /sdlc:orchestrate.
 *
 * An "in-flight" task is any task that has a worktree under
 * `.sdlc/worktrees/<basename>/` AND a matching local branch named
 * `task/<basename>`. For each such pair the task file's `state:` frontmatter
 * is read, the task's lease is read off the LOCAL ref mirror, and
 * `gh pr list --search "head:<branch>"` is queried to detect an open PR.
 *
 * Categories: implementing | awaiting-review | stale | other.
 *
 * Classification prefers the LEASE ([[D-S30G-task-state-plane-split]]):
 * execution state is authoritative in the lease substrate, and frontmatter
 * `state` no longer moves during a run. The frontmatter rule stays as the
 * fallback for tasks with no lease in the mirror.
 *
 * The render hook reproduces the `--format summary` line that
 * count_inflight_tasks.ts emits for /sdlc:orchestrate digest consumption:
 *
 *     inflight={implementing=I,awaiting-review=A,stale=S} caps-reached=<list|none>
 *
 * `--output json` carries the full structured buckets (limits, counts,
 * caps_reached, tasks[]).
 */

import { z } from 'zod'

import { defineOp } from '@lib/registry'
import type { OpCtx, OpIo } from '@lib/registry'
import { listWorktreeBasenames, worktreeDir, worktreeRoot } from '@lib/util/git'
import { realResolve } from '@lib/util/paths'
import { pidAlive } from '@lib/util/process'
import { readWorkRun, RunOutputSchema, workRunIdentity } from '@lib/services/orchestrator/work-runs'

import {
  frontmatterString,
  listLocalBranches,
  openPrForBranch,
  readFrontmatter,
  readLocalLease,
  taskBranch,
  taskFilePath,
} from './_probe_core.ts'

// ── constants ─────────────────────────────────────────────────────────────────

const DEFAULT_IMPLEMENT_LIMIT = 5
const DEFAULT_MAX_AWAITING_REVIEW = 20

const CATEGORY_IMPLEMENTING = 'implementing'
const CATEGORY_AWAITING_REVIEW = 'awaiting-review'
const CATEGORY_STALE = 'stale'
const CATEGORY_OTHER = 'other'

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Bucket one task from its frontmatter state, its lease phase, and its open PR.
 *
 * Precedence:
 *
 * 1. `closed/*` on frontmatter → `stale`. Closure is a semantic commit that
 *    outlives any run, so a closed task whose worktree/branch/lease survive is
 *    exactly the leftover this category names — the lease cannot argue.
 * 2. The lease phase, when the mirror carries one. `claimed`/`working` hold an
 *    implementation slot only while the run is live (`runLive`: lease not
 *    expired and any work-run pid answering); a dead one is `stale`, so a
 *    crashed run cannot hold a slot until the sweep reaps it.
 *    `awaiting-review`/`responding` hold a review slot.
 *    Phase beats an open PR: the PR appears a moment before the transition to
 *    `awaiting-review` lands, and the lease is the authority on which slot the
 *    run occupies.
 *    The lease's OWNER does not change the bucket: a person's (`human`) lease
 *    in `claimed`/`working` holds an implementation slot exactly as a
 *    worker's does, so a task someone started by hand counts against
 *    `orchestrator.limits.implement` and never reads as free.
 * 3. `blocked` → `other`, matching the frontmatter rule it replaces
 *    (`in-progress/blocked` has always landed in `other`). `closing` also falls
 *    through: a run in close-out is neither implementing nor awaiting review.
 * 4. No lease → the pre-split frontmatter rule: `in-progress` with an open PR
 *    is awaiting review; without one it is implementing only while a run is
 *    live, else `stale` (nothing holds it).
 *
 * `leasePhase` defaults to null and `runLive` to true: with no lease and no
 * work-run record the frontmatter rule applies. Every surface reaches this
 * through {@link collectInflight}, never directly; the export is only the
 * seam the precedence-table test drives.
 */
export function classify(
  taskState: string | null,
  openPrNumber: number | null,
  leasePhase: string | null = null,
  runLive = true,
): string {
  if (taskState && taskState.startsWith('closed/')) return CATEGORY_STALE

  if (leasePhase === 'claimed' || leasePhase === 'working') {
    return runLive ? CATEGORY_IMPLEMENTING : CATEGORY_STALE
  }
  if (leasePhase === 'awaiting-review' || leasePhase === 'responding') {
    return CATEGORY_AWAITING_REVIEW
  }
  if (leasePhase !== null) return CATEGORY_OTHER

  if (taskState === 'in-progress') {
    if (openPrNumber !== null) return CATEGORY_AWAITING_REVIEW
    return runLive ? CATEGORY_IMPLEMENTING : CATEGORY_STALE
  }
  return CATEGORY_OTHER
}

/**
 * Whether a run still plausibly holds the task: its work-run record has not
 * ended and any recorded pid answers a signal-0 probe, and (with a lease) the
 * lease has not expired. With no lease, only a live work-run record counts.
 * Network-free: a local file read, a clock compare and a pid probe.
 */
function runIsLive(
  lease: { expiresAt: string | null } | null,
  workRun: { pid: number | null; endedAt: string | null } | null,
  now: Date,
): boolean {
  const runDead =
    workRun !== null &&
    (workRun.endedAt !== null || (workRun.pid !== null && !pidAlive(workRun.pid)))
  if (runDead) return false
  if (lease === null) return workRun !== null
  return lease.expiresAt === null || Date.parse(lease.expiresAt) > now.getTime()
}

// ── output schema ─────────────────────────────────────────────────────────────

const InflightTask = z.object({
  basename: z.string(),
  worktree_path: z.string(),
  branch: z.string(),
  task_state: z.string().nullable(),
  open_pr_number: z.number().int().nullable(),
  /** Execution phase off the local lease mirror, or null when no lease. */
  lease_phase: z.string().nullable(),
  /** PR number the local lease mirror records, or null when no lease or none recorded. */
  lease_pr_number: z.number().int().nullable(),
  /** Who holds the lease (`human` for a person driving the task), or null when no lease. */
  lease_owner_kind: z.string().nullable(),
  /** The task's work run (`sdlc log search --run <id>` reads its events), or null when it has no record. */
  runId: z.string().nullable(),
  /** True when a person started that run with `task dispatch`; null when there is no record. */
  manual: z.boolean().nullable(),
  /** Where that run's output is (scratch while it runs, the published `runs/<run-id>/output.log` after, none for a foreground manual run); null when there is no record. */
  output: RunOutputSchema.nullable(),
  category: z.string(),
})

/** Exported so the TUI's Orchestrator source validates the child's `--json` against it. */
export const output = z.object({
  limits: z.object({
    implement: z.number(),
    max_awaiting_review: z.number(),
  }),
  counts: z.record(z.string(), z.number()),
  caps_reached: z.array(z.string()),
  tasks: z.array(InflightTask),
})

type Output = z.infer<typeof output>

// ── render hook ───────────────────────────────────────────────────────────────

function renderInflight(out: Output, io: OpIo): number {
  const c = out.counts
  const parts = [
    `implementing=${c[CATEGORY_IMPLEMENTING] ?? 0}`,
    `awaiting-review=${c[CATEGORY_AWAITING_REVIEW] ?? 0}`,
    `stale=${c[CATEGORY_STALE] ?? 0}`,
  ]
  const inflightField = 'inflight={' + parts.join(',') + '}'
  const caps = out.caps_reached ?? []
  const capsField = 'caps-reached=' + (caps.length ? caps.join(',') : 'none')
  io.stdout(`${inflightField} ${capsField}\n`)
  return 0
}

// ── op definition ─────────────────────────────────────────────────────────────

const input = z.object({
  noGh: z.boolean().default(false),
})

export default defineOp({
  path: ['task', 'inflight'],
  summary: 'Categorise in-flight tasks (implementing / awaiting-review / stale / other).',
  // Read-only: reads worktree/branch/frontmatter/lease/PR state and reports
  // categories; writes nothing.
  mutating: false,
  input,
  output,
  cli: {
    flags: { noGh: { help: 'Skip gh pr list queries (hermetic/offline mode).' } },
    render: renderInflight,
  },
  handler: (args, ctx) =>
    collectInflight(ctx, (branch, projectRoot) =>
      args.noGh ? null : openPrForBranch(branch, projectRoot, ctx),
    ),
})

/**
 * Which worktrees are in flight: each `<worktree root>/<basename>` dir whose
 * `task/<basename>` branch exists locally. Cheap and local (one branch list,
 * one directory read), so a caller that must look up PRs before classifying
 * can name the branches without running {@link collectInflight} twice.
 */
export function inflightRoster(ctx: OpCtx): {
  wtBase: string
  entries: { basename: string; branch: string }[]
} {
  const projectRoot = realResolve(ctx.projectRoot)
  const branches = listLocalBranches(projectRoot, ctx)
  // Worktrees live under the primary checkout, not the (possibly nested) project root.
  const wtBase = worktreeRoot(projectRoot, { runner: ctx.git })
  const entries = listWorktreeBasenames(wtBase)
    .map((basename) => ({ basename, branch: taskBranch(basename) }))
    .filter((e) => branches.has(e.branch))
  return { wtBase, entries }
}

/**
 * The roster scan behind `task inflight`, shared so a surface that already
 * holds the open-PR numbers (the web dashboard fetches them concurrently) calls
 * this instead of re-deriving categories. `openPrFor` supplies each branch's
 * open PR number; the op passes a `gh` probe, the dashboard its own map.
 * Everything else is local: worktrees, branches, frontmatter, lease mirror,
 * work-run records.
 */
export function collectInflight(
  ctx: OpCtx,
  openPrFor: (branch: string, projectRoot: string) => number | null,
): Output {
  const projectRoot = realResolve(ctx.projectRoot)

  // ctx.sdlcConfig is hydrated by createCtx; degrade-to-defaults on any error.
  const maxImpl =
    ctx.sdlcConfig.orchestrator?.limits?.executor?.implement ?? DEFAULT_IMPLEMENT_LIMIT
  const maxRev = ctx.sdlcConfig.orchestrator?.max_awaiting_review ?? DEFAULT_MAX_AWAITING_REVIEW

  const { wtBase, entries } = inflightRoster(ctx)

  const tasks: z.infer<typeof InflightTask>[] = []
  for (const { basename, branch } of entries) {
    const taskState = frontmatterString(
      readFrontmatter(taskFilePath(projectRoot, basename)),
      'state',
    )

    const openPrNumber = openPrFor(branch, projectRoot)

    // Local mirror only — the roster scan runs every orchestrate tick and
    // must stay network-free.
    const lease = readLocalLease(basename, projectRoot, ctx)
    const leasePhase = lease?.phase ?? null
    const workRun = readWorkRun(projectRoot, basename)
    const runLive = runIsLive(lease, workRun, new Date())

    const category = classify(taskState, openPrNumber, leasePhase, runLive)
    tasks.push({
      basename,
      worktree_path: worktreeDir(wtBase, basename),
      branch,
      task_state: taskState,
      open_pr_number: openPrNumber,
      lease_phase: leasePhase,
      lease_pr_number: lease?.prNumber ?? null,
      lease_owner_kind: lease?.ownerKind ?? null,
      ...(workRun !== null
        ? workRunIdentity(projectRoot, workRun)
        : { runId: null, manual: null, output: null }),
      category,
    })
  }

  const counts: Record<string, number> = {
    [CATEGORY_IMPLEMENTING]: 0,
    [CATEGORY_AWAITING_REVIEW]: 0,
    [CATEGORY_STALE]: 0,
    [CATEGORY_OTHER]: 0,
  }
  for (const t of tasks) {
    counts[t.category] = (counts[t.category] ?? 0) + 1
  }

  const capsReached: string[] = []
  if ((counts[CATEGORY_IMPLEMENTING] ?? 0) >= maxImpl) capsReached.push('implement')
  if ((counts[CATEGORY_AWAITING_REVIEW] ?? 0) >= maxRev) capsReached.push('max_awaiting_review')

  return {
    limits: { implement: maxImpl, max_awaiting_review: maxRev },
    counts,
    caps_reached: capsReached,
    tasks,
  }
}
