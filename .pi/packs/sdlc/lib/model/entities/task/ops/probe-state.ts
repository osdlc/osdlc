/**
 * `sdlc task probe-state <basename>` — report the single-task pre-flight signals
 * `/sdlc:task-work` Step 2 reasons about, factored out of `inflight.ts`'s
 * per-basename loop (Cluster 5 of the skill-determinism extraction plan).
 *
 * The op is read-only and REPORTS signals; it NEVER self-aborts and NEVER
 * mutates project state (no worktree create/remove, no branch delete). The
 * stop/proceed decision and the "don't sweep the user's WIP" consent hand-off
 * stay with the skill's AskUserQuestion — folding them in here would drop the
 * consent semantics the plan/critique pin (Cluster 5 "Critical edge").
 *
 * Signals reported (the pre-flight blockers + the resume detector):
 *   - worktree_exists  — a directory at `.sdlc/worktrees/<basename>`.
 *   - branch_exists    — a local branch `task/<basename>`.
 *   - task_state       — `state:` frontmatter on the task file (main checkout).
 *   - open_pr_number   — open PR whose head is `task/<basename>`, or null.
 *   - lease_present    — `refs/sdlc/tasks/<basename>` is in the local mirror.
 *   - lease_phase      — that lease's execution phase, or null.
 *   - lease_pr_number  — that lease's PR binding, or null.
 *   - lease_holder     — who holds that lease (owner kind, host, claim time,
 *     expiry, author), or null ([[T-HBNN]]).
 *   - readiness_verified_at — LEGACY: the promotion stamp on frontmatter.
 *   - main_head_subject     — subject of main's HEAD commit.
 *   - main_head_is_verify_stamp — LEGACY: main's HEAD subject equals the literal
 *     `docs(tasks): verify <basename> implementation-ready` stamp ensure-ready
 *     used to emit per run.
 *
 * Derived (pure functions of the signals above — the op computes them so every
 * caller reads ONE notion of the gate, not a re-derived prose copy that drifts):
 *   - blocked_preflight — ANY of: state `closed/*` | `in-progress[/blocked]` |
 *     worktree_exists | branch_exists | open PR. (The skill still owns the
 *     planning/* AskUserQuestion soft-gate; that is judgment, left to prose.)
 *   - resume_candidate  — the execution-plane AND-gate
 *     ([[D-S30G-task-state-plane-split]]): state `open/ready` on main (a task
 *     keeps that state for its whole in-flight life now), worktree exists,
 *     branch exists, lease phase is `claimed` or `working`, and NO open PR.
 *     Lease phase — not a main-HEAD commit subject — is what says "a run holds
 *     this". Any other combination falls through to the pre-flight blockers
 *     (resume_candidate is false; the skill keeps the blockers in force).
 *
 * `readiness_verified_at` and `main_head_is_verify_stamp` survive as REPORTED
 * fields only. They stopped being gate inputs at the plane split: the stamp is
 * written once at promotion (so it says nothing about the current run) and the
 * per-run verify commit it named is gone. [[T-11QZ-task-schema-v6-contract-sweep]]
 * retires the fields themselves.
 *
 * Consumer: `/sdlc:task-work` (wires this in its own skill PR; this is Wave-0
 * infra that lands first).
 */

import { z } from 'zod'

import { defineOp } from '@lib/registry'
import type { OpIo } from '@lib/registry'
import { realResolve } from '@lib/util/paths'

import {
  branchExists,
  frontmatterString,
  isDir,
  mainHeadSubject,
  openPrForBranch,
  readFrontmatter,
  readLocalLease,
  taskBranch,
  taskFilePath,
  worktreePath,
} from './_probe_core.ts'

// ── verify-stamp subject (legacy) ───────────────────────────────────────────

/**
 * The literal commit subject /sdlc:task-ensure-ready emitted on main for the
 * per-run verify stamp.
 *
 * LEGACY: no writer produces this subject any more — the plane split replaced
 * the per-run stamp commit with the one-time `promote-ready` promotion commit
 * ([[D-S30G-task-state-plane-split]]). It stays exported because
 * `main_head_is_verify_stamp` stays in this op's output for one transition
 * period; [[T-11QZ-task-schema-v6-contract-sweep]] retires both together.
 */
export function verifyStampSubject(basename: string): string {
  return `docs(tasks): verify ${basename} implementation-ready`
}

/** Lease phases that mean "a run holds this task and has not shipped it yet". */
const RESUMABLE_LEASE_PHASES = new Set(['claimed', 'working'])

// ── output schema ───────────────────────────────────────────────────────────

/** Exported so the TUI's detail modal validates the child's `--json` against the op's own shape ([[T-HBNN]]). */
export const probeStateOutput = z.object({
  basename: z.string(),
  /** Absolute worktree path probed. */
  worktree_path: z.string(),
  /** `task/<basename>`. */
  branch: z.string(),
  /** A directory exists at worktree_path. */
  worktree_exists: z.boolean(),
  /** A local branch `task/<basename>` exists. */
  branch_exists: z.boolean(),
  /** `state:` frontmatter on the main-checkout task file, or null when absent. */
  task_state: z.string().nullable(),
  /** `readiness_verified_at:` frontmatter on the main-checkout task file. */
  readiness_verified_at: z
    .string()
    .nullable()
    .describe(
      'LEGACY (reported, not a gate input): the promotion-time readiness stamp ' +
        'on frontmatter. Says nothing about the current run — lease `gates` ' +
        'carries per-run verification since [[D-S30G-task-state-plane-split]].',
    ),
  /** Open PR whose head is the task branch, or null. */
  open_pr_number: z.number().int().nullable(),
  /** `refs/sdlc/tasks/<basename>` exists in the local ref mirror. */
  lease_present: z
    .boolean()
    .describe(
      'A lease ref for this task is present in the LOCAL mirror (no authority ' +
        'round-trip); false when absent, unreadable, or schema-invalid.',
    ),
  /** Execution phase off the mirrored lease payload, or null when no lease. */
  lease_phase: z
    .string()
    .nullable()
    .describe(
      'Lease execution phase (claimed | working | blocked | awaiting-review | ' +
        'responding | closing) — the authoritative in-flight state.',
    ),
  /** The lease payload's in-flight PR binding, or null. */
  lease_pr_number: z
    .number()
    .int()
    .nullable()
    .describe('PR number bound to the lease, or null when unbound / no lease.'),
  /** Who holds the lease, off the same mirrored payload; null when no lease. */
  lease_holder: z
    .object({
      owner_kind: z.string(),
      hostname: z.string(),
      claimed_at: z.string(),
      expires_at: z.string().nullable(),
      author: z.string().nullable(),
    })
    .nullable(),
  /** Subject of `main`'s HEAD commit, or null when unreadable. */
  main_head_subject: z.string().nullable(),
  /** main's HEAD subject equals the verify-stamp for this basename. */
  main_head_is_verify_stamp: z
    .boolean()
    .describe(
      "LEGACY (reported, not a gate input): main's HEAD subject equals the " +
        'retired per-run verify-stamp. No writer emits that subject any more.',
    ),
  /** ANY hard pre-flight blocker is present (planning/* soft-gate excluded). */
  blocked_preflight: z.boolean(),
  /** The lease-phase resume AND-gate holds. */
  resume_candidate: z.boolean(),
})

export type ProbeState = z.infer<typeof probeStateOutput>
type Output = ProbeState

// ── render hook ─────────────────────────────────────────────────────────────

function bit(b: boolean): string {
  return b ? 'yes' : 'no'
}

/**
 * Deterministic single-line summary for skill/CI consumption. The structured
 * surface is `--output json`; this line is the at-a-glance probe.
 */
function renderProbe(out: Output, io: OpIo): number {
  const parts = [
    `basename=${out.basename}`,
    `worktree=${bit(out.worktree_exists)}`,
    `branch=${bit(out.branch_exists)}`,
    `state=${out.task_state ?? 'none'}`,
    `pr=${out.open_pr_number ?? 'none'}`,
    `lease=${bit(out.lease_present)}`,
    `lease-phase=${out.lease_phase ?? 'none'}`,
    `lease-pr=${out.lease_pr_number ?? 'none'}`,
    `verify-stamp=${bit(out.main_head_is_verify_stamp)}`,
    `blocked=${bit(out.blocked_preflight)}`,
    `resume=${bit(out.resume_candidate)}`,
  ]
  io.stdout(`probe-state ${parts.join(' ')}\n`)
  return 0
}

// ── op definition ───────────────────────────────────────────────────────────

const input = z.object({
  /** Task basename (filename without `.md`). */
  basename: z.string().min(1),
  /** Skip the `gh pr list` query (hermetic/offline mode). */
  noGh: z.boolean().default(false),
})

export default defineOp({
  path: ['task', 'probe-state'],
  summary:
    'Report single-task pre-flight signals (worktree/branch/PR/state + resume detector) for /sdlc:task-work.',
  // Read-only by design (see module docblock): reports signals, never
  // mutates project state.
  mutating: false,
  input,
  output: probeStateOutput,
  cli: {
    positionals: ['basename'],
    flags: { noGh: { help: 'Skip gh pr list queries (hermetic/offline mode).' } },
    render: renderProbe,
  },
  handler: (args, ctx): Output => {
    const projectRoot = realResolve(ctx.projectRoot)
    const { basename } = args
    const branch = taskBranch(basename)

    const wtPath = worktreePath(projectRoot, basename, ctx)
    const worktreeExists = isDir(wtPath)
    const branchPresent = branchExists(basename, projectRoot, ctx)

    const fm = readFrontmatter(taskFilePath(projectRoot, basename))
    const taskState = frontmatterString(fm, 'state')
    const readinessVerifiedAt = frontmatterString(fm, 'readiness_verified_at')

    let openPrNumber: number | null = null
    if (!args.noGh) {
      openPrNumber = openPrForBranch(branch, projectRoot, ctx)
    }

    // Execution plane: the LOCAL lease mirror, no authority round-trip. A
    // missing/unreadable mirror degrades to "no lease" rather than failing the
    // probe ([[D-S30G-task-state-plane-split]]).
    const lease = readLocalLease(basename, projectRoot, ctx)

    const headSubject = mainHeadSubject(projectRoot, ctx)
    const mainHeadIsVerifyStamp = headSubject === verifyStampSubject(basename)

    // Hard pre-flight blockers (task-work Step 2). The planning/* soft-gate is a
    // skill-owned AskUserQuestion (judgment) and is deliberately NOT folded in.
    const stateBlocked =
      taskState !== null &&
      (taskState.startsWith('closed/') ||
        taskState === 'in-progress' ||
        taskState === 'in-progress/blocked')
    const blockedPreflight =
      stateBlocked || worktreeExists || branchPresent || openPrNumber !== null

    // Resume AND-gate (task-work Step 2 resume detector). A stalled run is a
    // task whose frontmatter still reads `open/ready` — it does for the whole
    // in-flight life now — whose worktree and branch survive, whose lease says
    // a run holds it (`claimed`/`working`), and which has not opened a PR.
    const resumeCandidate =
      taskState === 'open/ready' &&
      worktreeExists &&
      branchPresent &&
      lease !== null &&
      RESUMABLE_LEASE_PHASES.has(lease.phase) &&
      openPrNumber === null

    return {
      basename,
      worktree_path: wtPath,
      branch,
      worktree_exists: worktreeExists,
      branch_exists: branchPresent,
      task_state: taskState,
      readiness_verified_at: readinessVerifiedAt,
      open_pr_number: openPrNumber,
      lease_present: lease !== null,
      lease_phase: lease?.phase ?? null,
      lease_pr_number: lease?.prNumber ?? null,
      lease_holder:
        lease === null
          ? null
          : {
              owner_kind: lease.holder.ownerKind,
              hostname: lease.holder.hostname,
              claimed_at: lease.holder.claimedAt,
              expires_at: lease.holder.expiresAt,
              author: lease.holder.author,
            },
      main_head_subject: headSubject,
      main_head_is_verify_stamp: mainHeadIsVerifyStamp,
      blocked_preflight: blockedPreflight,
      resume_candidate: resumeCandidate,
    }
  },
})
