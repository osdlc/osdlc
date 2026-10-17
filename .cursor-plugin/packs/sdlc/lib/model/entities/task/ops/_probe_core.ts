/**
 * Shared per-basename probe primitives for the task-worktree signals that both
 * `sdlc task inflight` (roster scan) and `sdlc task probe-state` (single-task
 * pre-flight) read.
 *
 * Factored out of `inflight.ts` (Cluster 5 of the skill-determinism extraction
 * plan) so the single-task probe `/sdlc:task-work` Step 2 needs is one home, not
 * a hand-rolled copy of inflight's loop. Every function here is read-only on the
 * project: no worktree creation, no branch mutation, no state cleanup. The op
 * REPORTS signals; the stop/proceed and "don't sweep the user's WIP" decisions
 * stay with the skill's AskUserQuestion (the deliberate consent hand-off the
 * critique pins).
 */

import { resolve } from 'node:path'

import type { OpCtx } from '@lib/registry'
import { readRawFrontmatter } from '@lib/model/read'
import { Git } from '@sksizer/easy-git'
import { openPrsForBranch, pickPrForBranch } from '@sksizer/easy-gh'
import { worktreeDirFor } from '@lib/util/git'
import { TaskLifecycleLeaseSchema, validateDict } from '@lib/services/lease'

// ── filesystem probes ───────────────────────────────────────────────────────

export { isFile, isDir } from '@lib/util/fs'

/** Read+parse a doc's frontmatter; null on missing/unreadable/no-frontmatter. */
export function readFrontmatter(path: string): Record<string, unknown> | null {
  return readRawFrontmatter(path)
}

// ── path conventions ────────────────────────────────────────────────────────

/** The canonical task branch name for a basename. */
export function taskBranch(basename: string): string {
  return `task/${basename}`
}

/**
 * Absolute worktree path `/sdlc:task-work` parks a basename's worktree at:
 * `<primary-checkout>/.sdlc/worktrees/<basename>`. Rooted at the git primary
 * checkout, NOT `projectRoot` (the nearest `sdlc.yaml`, possibly nested), so
 * every op agrees with `task begin`. Keep `projectRoot` for the task file,
 * branches and lease.
 */
export function worktreePath(projectRoot: string, basename: string, ctx: OpCtx): string {
  return worktreeDirFor(projectRoot, basename, { runner: ctx.git })
}

/** Absolute path of a basename's task document under docs/planning/tasks. */
export function taskFilePath(projectRoot: string, basename: string): string {
  return resolve(projectRoot, 'docs', 'planning', 'tasks', `${basename}.md`)
}

// ── git/gh probes (DI seam — no ambient cwd) ────────────────────────────────

/** Every `task/*` local branch in `projectRoot`, as a set of short refnames. */
export function listLocalBranches(projectRoot: string, ctx: OpCtx): Set<string> {
  return new Set(new Git(projectRoot, { runner: ctx.git }).branches('task/*'))
}

/** True iff a local branch `task/<basename>` exists. */
export function branchExists(basename: string, projectRoot: string, ctx: OpCtx): boolean {
  return new Git(projectRoot, { runner: ctx.git }).branchExists(taskBranch(basename))
}

/**
 * The open-PR number for a branch, or null when none / unreachable — a thin
 * view over the shared easyGh pures (`@sksizer/easy-gh`), exact-headRefName
 * matched (the gh search is a prefix match, so a non-exact hit is discarded).
 */
export function openPrForBranch(branch: string, projectRoot: string, ctx: OpCtx): number | null {
  const verb = openPrsForBranch(branch)
  const rows = verb.parse(ctx.gh.run(verb.argv, { cwd: projectRoot }))
  return pickPrForBranch(rows, branch)?.number ?? null
}

/** The subject line of the `main` branch's HEAD commit, or null when unreadable. */
export function mainHeadSubject(projectRoot: string, ctx: OpCtx): string | null {
  return new Git(projectRoot, { runner: ctx.git }).logSubject('main')
}

// ── lease probes (LOCAL ref mirror — never the authority) ───────────────────

/** The lease ref a basename's task-lifecycle claim lives at. */
export function leaseRef(basename: string): string {
  return `refs/sdlc/tasks/${basename}`
}

/**
 * The execution-plane facts probe readers need off a lease payload
 * ([[D-S30G-task-state-plane-split]]). Deliberately a projection, not the whole
 * `TaskLifecycleLease`: these ops report signals, and a wider surface would
 * invite them to re-derive claim semantics the lease library owns.
 */
export interface LocalLeaseSnapshot {
  /** Execution phase: claimed | working | blocked | awaiting-review | responding | closing. */
  phase: string
  /** Who holds the lease (`claude-code`, `human`, ...). A `human` lease is a person driving the task. */
  ownerKind: string
  /** The in-flight PR binding carried on the lease, or null. */
  prNumber: number | null
  /** Per-run gate stamps (payload v2), or null on a v1 payload. */
  gates: {
    readiness_verified_at: string | null
    touchpoints_verified_at: string | null
  } | null
}

/**
 * Read a basename's lease from the LOCAL ref mirror — `refs/sdlc/tasks/<id>`
 * as this repo last fetched it — and project it to the signals probe readers
 * consume. Returns null when the ref is absent, its `lease.json` unreadable, or
 * the payload fails schema validation.
 *
 * Network-free BY DESIGN ([[D-S30G-task-state-plane-split]]): `probe-state` and
 * `task inflight` run on every orchestrate tick and must not pay an authority
 * round-trip, so this reads refs a prior `git fetch` mirrored rather than
 * calling `fetchRef`/`fetchNamespace`. A stale mirror degrades safely — a
 * stale-missing ref under-reports in-flight state, and `cas_create` at claim
 * time remains the hard backstop against double dispatch.
 */
export function readLocalLease(
  basename: string,
  projectRoot: string,
  ctx: OpCtx,
): LocalLeaseSnapshot | null {
  const git = new Git(projectRoot, { runner: ctx.git })
  const ref = leaseRef(basename)
  // `try`, not the default door: this probe's contract is "null when the
  // mirror has nothing to say", and it runs on every orchestrate tick against
  // roots the caller has not proved are repos. A broken store degrades the
  // same way a stale mirror does — under-reporting in-flight state, with
  // `cas_create` at claim time as the hard backstop.
  const listing = git.try.forEachRef(ref, { format: '%(objectname)' })
  if (!listing.ok) return null
  const sha = listing.value[0]?.trim() ?? ''
  if (sha === '') return null

  const blob = git.showAtRev(sha, 'lease.json')
  if (blob === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(blob)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  let lease
  try {
    lease = validateDict(TaskLifecycleLeaseSchema, parsed as Record<string, unknown>)
  } catch {
    return null
  }

  return {
    phase: lease.phase,
    ownerKind: lease.owner_kind,
    prNumber: lease.pr_number,
    gates:
      lease.gates === undefined
        ? null
        : {
            readiness_verified_at: lease.gates.readiness_verified_at,
            touchpoints_verified_at: lease.gates.touchpoints_verified_at,
          },
  }
}

// ── frontmatter field readers ───────────────────────────────────────────────

/** A string frontmatter field, or null when missing / non-string / no file. */
export function frontmatterString(fm: Record<string, unknown> | null, key: string): string | null {
  if (fm === null) return null
  const v = fm[key]
  return typeof v === 'string' ? v : null
}
