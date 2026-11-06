/**
 * The plan: a sweep's deletable rows, each with a fingerprint of the evidence
 * its verdict rests on, and the options the sweep ran with. `check` sweeps
 * again with the same options and drops any row whose fingerprint moved.
 */

import { readFileSync } from 'node:fs'
import { z } from 'zod'

import { PROVIDER_CHOICES } from './providers/types.ts'
import { KINDS, RISKS, RepoCleanerError, type Row, type RowId, type Sweep } from './types.ts'
import { writeJsonAtomic } from './write-json.ts'

export const PLAN_VERSION = 2

const RowIdSchema = z.custom<RowId>(
  (v) =>
    typeof v === 'string' && KINDS.some((k) => v.startsWith(`${k}:`) && v.length > k.length + 1),
  { message: 'expected <kind>:<name>' },
)

export const PlanRowSchema = z.object({
  id: RowIdSchema,
  /** The sweep's verdict when the plan was made. Without a pick, only `delete` rows run. */
  verdict: z.enum(['delete', 'review', 'keep']),
  risks: z.array(z.enum(RISKS)),
  fingerprint: z.record(z.string(), z.unknown()),
})

export type PlanRow = z.infer<typeof PlanRowSchema>

export const PlanRepoSchema = z.object({
  root: z.string(),
  /** Whether this repository's sweep fetched; the re-check fetches too, so it judges against the same default branch. */
  fetched: z.boolean(),
  rows: z.array(PlanRowSchema),
})

export type PlanRepo = z.infer<typeof PlanRepoSchema>

export const PlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  createdAt: z.string(),
  /** What was swept; the re-check sweeps the same. */
  options: z.object({
    only: z.array(z.enum(KINDS)),
    remote: z.boolean(),
    offline: z.boolean(),
    against: z.string().nullable(),
    provider: z.enum(PROVIDER_CHOICES),
    branch: z.string().nullable(),
  }),
  repos: z.array(PlanRepoSchema),
})

export type Plan = z.infer<typeof PlanSchema>

/**
 * The evidence a row's verdict rests on. A branch: its sha and its PR's number
 * and state. A worktree: HEAD, branch, how much unlanded work it holds, whether
 * its lock was stale, whether it is on disk, and each submodule's state, so a
 * lock taken or revived after planning, a directory that came back, or a
 * submodule that changed, drops the row.
 */
export function fingerprint(row: Row): Record<string, unknown> {
  if (row.kind === 'worktree') {
    const e = row.evidence
    return {
      head: e.head,
      branch: e.branch,
      dirtyFiles: e.dirtyFiles ?? null,
      unpushedCommits: e.unpushedCommits ?? null,
      staleLock: e.staleLock ?? null,
      // Prune or remove: a directory that came back between plan and run
      // must not turn a prune into a remove.
      onDisk: e.onDisk ?? null,
      submodules: e.submodules ?? null,
    }
  }
  const pr = row.evidence.pr
  return { sha: row.evidence.sha, prNumber: pr?.number ?? null, prState: pr?.state ?? null }
}

/** Equal fingerprints, treating a missing key as null. */
export function sameFingerprint(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null)) return false
  }
  return true
}

/** The rows of `rows` a plan holds: every one with an action, except a blocked one. */
export function planRows(rows: readonly Row[]): PlanRow[] {
  const out: PlanRow[] = []
  for (const row of rows) {
    if (row.action === null || row.verdict === 'blocked') continue
    out.push({ id: row.id, verdict: row.verdict, risks: row.risks, fingerprint: fingerprint(row) })
  }
  return out
}

/** A plan of `sweep`: every row that could be deleted, in every repository it read. */
export function plan(sweep: Sweep, now: Date = new Date()): Plan {
  return {
    version: PLAN_VERSION,
    createdAt: now.toISOString(),
    options: {
      only: sweep.options.only,
      remote: sweep.options.remote,
      offline: sweep.options.offline,
      against: sweep.options.against,
      provider: sweep.options.provider,
      branch: sweep.options.branch,
    },
    repos: sweep.repos.flatMap((s) =>
      s.repo === null
        ? []
        : [{ root: s.repo.root, fetched: s.repo.fetched, rows: planRows(s.rows) }],
    ),
  }
}

/** A UTC timestamp safe in a file name, e.g. `2026-10-04T12-30-05-123Z`. */
export function fileStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-')
}

export function writePlan(path: string, plan: Plan): void {
  writeJsonAtomic(path, plan)
}

/**
 * Parse a plan's JSON text. `source` names where it came from, for the error.
 * A plan of another version is refused, not translated: sweep again.
 *
 * @throws RepoCleanerError (`bad-plan`)
 */
export function parsePlan(text: string, source: string): Plan {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new RepoCleanerError(
      'bad-plan',
      `cannot read plan ${source}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const version = (raw as { version?: unknown } | null)?.version
  if (version !== PLAN_VERSION) {
    throw new RepoCleanerError(
      'bad-plan',
      `plan ${source} is version ${JSON.stringify(version ?? null)}; this repo-cleaner reads version ${PLAN_VERSION}. Sweep again to make a new plan`,
    )
  }
  const parsed = PlanSchema.safeParse(raw)
  if (!parsed.success) {
    throw new RepoCleanerError('bad-plan', `bad plan ${source}: ${parsed.error.message}`)
  }
  return parsed.data
}

/** @throws RepoCleanerError (`bad-plan`) */
export function readPlan(path: string): Plan {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch (err) {
    throw new RepoCleanerError(
      'bad-plan',
      `cannot read plan ${path}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  return parsePlan(text, path)
}
