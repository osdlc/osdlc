/**
 * `pr-update update` — bring out-of-date PRs up to date.
 *
 * The plan comes from `survey`, called directly rather than reimplemented, so
 * what this applies is exactly what that reports. Rows arrive in stack order
 * and are applied in it: a stack updated child-first is work that gets redone
 * the moment the parent moves.
 *
 * **Nothing is written without `apply`.** A bare invocation walks the whole
 * path — checkout, integrate, resolve — and pushes nothing, so the report
 * tells you which PRs would conflict before you have touched a remote. That
 * is the default because the failure mode of this verb is a bad force-push,
 * and a default that could cause one would be wrong. `confirmPush` adds a
 * second gate: a y/N before each rebase force-push.
 *
 * What is skipped, and why it is skipped rather than attempted:
 *
 *   - `strategy: skip` — the strategy guards already decided. A branch with
 *     unpushed work in somebody's worktree, or a fork we cannot push to.
 *   - `status: blocked` — its base is another PR that is itself behind.
 *     Updating it now integrates a base about to move.
 *   - `status: unknown` — drift could not be measured, so there is no
 *     evidence an update is wanted.
 *   - a recorded failure — the update already failed `max_failed_attempts`
 *     times at this head and base sha, and would fail the same way again.
 *     `--retry-failed` attempts it anyway.
 *
 * `verify: check` or `verify: test` runs the `verifyVerbs` that
 * `ports.resolveVerifyVerbs` returns before a push. Trust-gating a
 * project-sourced verb list is the host's business, decided in that port.
 */

import { join } from 'node:path'

import { z } from 'zod'

import { Git } from '@osdlc/typed-git'

import {
  describeOutcome,
  tally,
  updateAll,
  type UpdateResult,
  type UpdateTarget,
} from './update/execute.ts'
import {
  SCOPE_SHAPE,
  SurveyUsageError,
  runSurvey,
  type SurveyEnv,
  type SurveyReport,
} from './survey.ts'
import type { AttemptKey, AttemptStore, ConfirmPush, Ports } from './ports.ts'
import { terminalConfirmPush } from './update/confirm.ts'
import type { PrUpdateConfig } from './config.ts'

/** A row the run declined to touch, and the reason, so nothing is silently dropped. */
export interface SkippedPr {
  number: number
  head: string
  reason: string
}

/** The failed-attempt key for a target, or null when either sha is unknown. */
export function attemptKey(
  t: Pick<UpdateTarget, 'repo' | 'head' | 'headOid' | 'base' | 'baseOid'>,
): AttemptKey | null {
  if (t.headOid === null || t.baseOid === null) return null
  return { repo: t.repo, head: t.head, headOid: t.headOid, base: t.base, baseOid: t.baseOid }
}

export interface FailedAttemptPolicy {
  attempts?: AttemptStore | undefined
  /** See `PrUpdateConfig.max_failed_attempts`. */
  maxFailedAttempts: number
  retryFailed: boolean
}

/**
 * Split the survey into what this run will act on and what it will not.
 *
 * Every row lands in exactly one list, AND every number `only` (`--pr`)
 * named lands somewhere too, even one the survey never reported (a typo, or
 * a PR that closed between the survey and this run) — it gets a synthetic
 * `skipped` entry rather than vanishing. A PR that quietly disappeared would
 * be the worst outcome here: the reader would assume it was fine.
 */
export function selectTargets(
  report: SurveyReport,
  only: readonly number[],
  policy: FailedAttemptPolicy = { maxFailedAttempts: 0, retryFailed: false },
): { targets: UpdateTarget[]; skipped: SkippedPr[] } {
  const store = policy.retryFailed || policy.maxFailedAttempts === 0 ? undefined : policy.attempts
  const wanted = new Set(only)
  const seen = new Set<number>()
  const targets: UpdateTarget[] = []
  const skipped: SkippedPr[] = []

  for (const row of report.prs) {
    seen.add(row.number)
    const note = (reason: string): void => {
      skipped.push({ number: row.number, head: row.head, reason })
    }
    if (wanted.size > 0 && !wanted.has(row.number)) {
      // `note`, not a bare `continue`: a PR this run's own `--pr` scope
      // excludes is still a row the survey reported, and the doc comment
      // above (and the `skipped` schema's own description) both promise
      // every surveyed PR lands in `targets` or here — a PR that vanished
      // from both because `--pr` named other numbers would be exactly the
      // silent-disappearance case this function exists to rule out.
      note('not selected by --pr/--branch')
      continue
    }
    // The output schema types `strategy` as a plain string; only these two
    // are executable, and narrowing here is what makes that true downstream.
    if (row.strategy !== 'rebase' && row.strategy !== 'merge') {
      note(row.strategyReason)
    } else if (row.status === 'blocked') note(`blocked on #${row.blockedBy ?? '?'}`)
    else if (row.status === 'unknown') note('drift could not be measured')
    else if (row.status === 'up-to-date') note('already up to date')
    else {
      const target: UpdateTarget = {
        repo: row.repo,
        number: row.number,
        head: row.head,
        base: row.base,
        headOid: row.headOid,
        baseOid: row.baseOid,
        strategy: row.strategy,
      }
      const key = attemptKey(target)
      const failures = store === undefined || key === null ? 0 : (store.get(key)?.failures ?? 0)
      if (store !== undefined && failures >= policy.maxFailedAttempts) {
        note(`failed ${failures} time(s) at this head and base; waiting for either to move`)
      } else targets.push(target)
    }
  }
  // A `--pr` number the survey never reported (a typo, or a PR that closed
  // between survey and this run) would otherwise vanish with no mention at
  // all — the loop above only ever sees `report.prs`'s own rows, so a wanted
  // number outside that set never reaches `note()`. Same invariant as the
  // rest of this function: every number this run was asked about ends up
  // somewhere, not silently dropped.
  for (const number of wanted) {
    if (!seen.has(number)) skipped.push({ number, head: '', reason: 'not found in survey' })
  }
  return { targets, skipped }
}

export const input = z.object({
  ...SCOPE_SHAPE,
  apply: z
    .boolean()
    .default(false)
    .describe(
      'Actually update the PRs. Without it the run rehearses everything — checkout, integration, conflict resolution — and pushes nothing, which is how you find out what would conflict before touching a remote.',
    ),
  confirmPush: z
    .boolean()
    .optional()
    .describe(
      'Before each rebase force-push, show the commits and diffstat and ask y/N. Needs --apply, and a terminal unless the host supplies Ports.confirmPush.',
    ),
  trust: z
    .boolean()
    .default(false)
    .describe(
      'Treat this repo as trusted for this run, satisfying any trust gate the host puts on project-sourced commands.',
    ),
  retryFailed: z
    .boolean()
    .default(false)
    .describe(
      'Attempt PRs whose update already failed at their current head and base sha. New failures are still recorded.',
    ),
  strategy: z
    .enum(['rebase', 'merge'])
    .optional()
    .describe(
      "Override this run's default strategy (`rebase` or `merge`) for every target — beating the config `strategy` default, but NOT a per-PR `overrides` rule (a protected base pinned to `merge` stays pinned) and NOT the non-negotiable `unpushed_local` guard.",
    ),
})

export const result = z.object({
  number: z.number(),
  head: z.string(),
  base: z.string(),
  strategy: z
    .string()
    .describe(
      'The strategy that ran. `merge` when `strategyFallback` is set, whatever the survey planned.',
    ),
  strategyFallback: z
    .string()
    .optional()
    .describe(
      'Present when a rebase was abandoned and the PR retried as a merge: the conflict that stopped it.',
    ),
  status: z.string().describe('up-to-date | updated | conflict | failed'),
  pushed: z.boolean(),
  detail: z.string(),
  conflicts: z
    .array(z.object({ path: z.string(), why: z.string() }))
    .optional()
    .describe(
      'Present when status is `conflict`: each unresolved path and why no resolver claimed it.',
    ),
  repaired: z
    .array(z.object({ kind: z.enum(['conflict', 'verify-failed']), note: z.string() }))
    .optional()
    .describe('Present when the repair command fixed a problem in this update.'),
  localCheckout: z
    .object({ updated: z.boolean(), detail: z.string() })
    .optional()
    .describe(
      "Present in branch mode after a push: whether the working directory's checkout was moved to the pushed head, and why not when it was left alone.",
    ),
})

export const output = z.object({
  applied: z.boolean().describe('False when this was a rehearsal.'),
  results: z.array(result).describe('One per PR acted on, in the order applied.'),
  skipped: z
    .array(z.object({ number: z.number(), head: z.string(), reason: z.string() }))
    .describe('PRs deliberately not acted on. Every surveyed PR is here or in `results`.'),
  counts: z.object({
    updated: z.number(),
    upToDate: z.number(),
    conflict: z.number(),
    failed: z.number(),
    skipped: z.number(),
  }),
})

/** Map one executor result onto the `result` schema. Exported for direct testing. */
export function toResult(r: UpdateResult, localCheckout?: LocalCheckout): z.infer<typeof result> {
  return {
    number: r.number,
    head: r.head,
    base: r.base,
    strategy: r.strategy,
    status: r.outcome.status,
    pushed: r.outcome.status === 'updated' && r.outcome.pushed,
    detail: describeOutcome(r.outcome),
    ...('strategyFallback' in r.outcome && r.outcome.strategyFallback !== undefined
      ? { strategyFallback: r.outcome.strategyFallback }
      : {}),
    ...(r.outcome.status === 'conflict' ? { conflicts: r.outcome.needsHuman } : {}),
    ...(r.outcome.status === 'updated' && r.outcome.repaired !== undefined
      ? { repaired: r.outcome.repaired }
      : {}),
    ...(localCheckout === undefined ? {} : { localCheckout }),
  }
}

/** What happened to the working directory's checkout after a branch-mode push. */
export type LocalCheckout = { updated: boolean; detail: string }

/**
 * Move the working directory's checkout onto the head just pushed, when that
 * loses nothing: it is on the PR's branch, holds no uncommitted change and sits
 * exactly at the head the run started from. Otherwise leave it and say why.
 *
 * A merge update is a fast-forward of the branch. A rebase is not, and the
 * checkout still moves with `reset --hard`: it is clean and at the old remote
 * head, so every commit it held is one the push replaced or kept. Paths under
 * `.pr-update/` (this tool's own scratch and record) do not count as changes.
 */
export function syncLocalCheckout(git: Git, r: UpdateResult): LocalCheckout | undefined {
  if (r.outcome.status !== 'updated' || !r.outcome.pushed) return undefined
  const { pushedOid } = r.outcome
  const left = (detail: string): LocalCheckout => ({ updated: false, detail })
  if (pushedOid === undefined) return left('the pushed head is unknown')
  try {
    const branch = git.currentBranch()
    if (branch !== r.head) {
      return left(`this checkout is on ${branch ?? 'a detached HEAD'}, not ${r.head}`)
    }
    if (git.statusEntries().some((e) => !e.path.startsWith('.pr-update/'))) {
      return left('the working tree has uncommitted changes')
    }
    if (r.headOid === null) return left('the head the run started from is unknown')
    if (git.resolveRef('HEAD') !== r.headOid) {
      return left(`${r.head} here is not at the old remote head ${r.headOid.slice(0, 9)}`)
    }
    git.resetHard(pushedOid)
    return { updated: true, detail: `moved to ${pushedOid.slice(0, 9)}` }
  } catch (e) {
    return left(`could not move it: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export type UpdateArgs = z.infer<typeof input>
export type UpdateOutput = z.infer<typeof output>

/** Everything a run needs beyond the args and the config. */
export interface UpdateEnv extends SurveyEnv {
  ports: Ports
}

/**
 * `args.strategy`, folded into `cfg` for this run.
 *
 * Swaps only `strategy` — `overrides` and `guards` pass through untouched —
 * so `chooseStrategy` (`./strategy.ts`) still consults the ORIGINAL
 * `overrides` array (a per-PR rule keeps winning) and `guards.unpushed_local`
 * stays unconditional regardless of which default strategy is in effect. Only
 * the branch that falls through to "no override, no guard fired" ever sees
 * the swapped default. Exported and pure so this precedence is testable
 * without driving the whole survey/update pipeline.
 */
export function applyStrategyOverride(
  cfg: PrUpdateConfig,
  strategy: 'rebase' | 'merge' | undefined,
): PrUpdateConfig {
  return strategy === undefined ? cfg : { ...cfg, strategy }
}

/**
 * Whether this run may write: push updates and call a repair. `--apply` is the
 * user's intent; `dryRun` is the harness-wide override that must beat it, so a
 * global rehearsal never writes.
 */
export function wantsWrite(args: Pick<UpdateArgs, 'apply'>, dryRun: boolean): boolean {
  return args.apply && !dryRun
}

/** A `confirmPush` run `runUpdate` refuses before touching any PR. */
export class UpdateUsageError extends SurveyUsageError {
  override name = 'UpdateUsageError'
}

/**
 * The push confirmation for this run: `Ports.confirmPush`, else the terminal
 * prompt. Undefined without `confirmPush`, and in a dry run, which never pushes.
 *
 * @throws UpdateUsageError without `apply`, or with no port and no terminal.
 */
function bindConfirmPush(args: UpdateArgs, ports: Ports, dryRun: boolean): ConfirmPush | undefined {
  if (args.confirmPush !== true) return undefined
  if (!args.apply) throw new UpdateUsageError('--confirm-push needs --apply')
  if (dryRun) return undefined
  if (ports.confirmPush !== undefined) return ports.confirmPush
  try {
    return terminalConfirmPush()
  } catch (e) {
    throw new UpdateUsageError((e as Error).message)
  }
}

/**
 * Run the update.
 *
 * Exported separately from any CLI/op wrapper so a test can invoke it
 * directly, and so a host embedding this package as a library never pays for
 * a preflight it does not need.
 */
export async function runUpdate(args: UpdateArgs, env: UpdateEnv): Promise<UpdateOutput> {
  const confirmPush = bindConfirmPush(args, env.ports, env.dryRun)
  const effectiveCfg = applyStrategyOverride(env.cfg, args.strategy)
  const report = runSurvey(args, { ...env, cfg: effectiveCfg })
  const attempts = env.ports.attempts
  // Branch mode names its PR by head branch; the survey has already narrowed
  // the report to it and its stack parents.
  const only =
    args.branch === undefined
      ? args.pr
      : [...args.pr, ...report.prs.filter((r) => r.head === args.branch).map((r) => r.number)]
  const { targets, skipped } = selectTargets(report, only, {
    attempts,
    maxFailedAttempts: effectiveCfg.max_failed_attempts,
    retryFailed: args.retryFailed,
  })

  const writes = wantsWrite(args, env.dryRun)

  const git = new Git(env.projectRoot, { runner: env.git })
  const worktreeRoot = join(env.projectRoot, '.pr-update', `${process.pid}.${Date.now()}`)
  // Resolve once here, not inside `updateAll`'s per-PR loop.
  const verify = effectiveCfg.verify
  const verifyVerbs =
    verify === 'none'
      ? []
      : await env.ports.resolveVerifyVerbs({ which: verify, trust: args.trust })
  const settings = {
    remote: args.remote,
    resolvers: effectiveCfg.resolvers,
    lockfileInstall: effectiveCfg.lockfile_install,
    verifyVerbs,
    generators: env.ports.generators,
    repair: env.ports.repair,
    repairOn: effectiveCfg.repair.on,
    onRebaseConflict: effectiveCfg.on_rebase_conflict,
    confirmPush,
  }
  const results = await updateAll(git, targets, settings, env.ports.runVerb, {
    apply: writes,
    worktreeRoot,
  })
  // A rehearsal cannot repair, so its failures say nothing about a real run.
  if (writes && attempts !== undefined) recordAttempts(attempts, results)

  const local = new Map<number, LocalCheckout>()
  if (writes && args.branch !== undefined) {
    for (const r of results) {
      const synced = syncLocalCheckout(git, r)
      if (synced !== undefined) local.set(r.number, synced)
    }
  }

  const t = tally(results)
  return {
    applied: writes,
    results: results.map((r) => toResult(r, local.get(r.number))),
    skipped,
    counts: {
      updated: t['updated'] ?? 0,
      upToDate: t['up-to-date'] ?? 0,
      conflict: t['conflict'] ?? 0,
      failed: t['failed'] ?? 0,
      skipped: skipped.length,
    },
  }
}

/** Record each failure under its key; forget a PR target once it updates, pushed or not. */
function recordAttempts(store: AttemptStore, results: readonly UpdateResult[]): void {
  for (const r of results) {
    const { status } = r.outcome
    if (status === 'updated' || status === 'up-to-date') store.clear(r.repo, r.head, r.base)
    else {
      const key = attemptKey(r)
      if (key !== null) store.recordFailure(key, describeOutcome(r.outcome))
    }
  }
}

/** Render an update report as the same text `pr-update update` prints. */
export function renderUpdateText(out: UpdateOutput): string {
  const lines: string[] = []
  for (const r of out.results) {
    const mark = r.status === 'updated' ? (r.pushed ? '✓' : '·') : r.status === 'failed' ? '✗' : '!'
    lines.push(`${mark} #${r.number}  ${r.strategy}  ${r.head}  ${r.detail}`)
    if (r.localCheckout !== undefined) {
      lines.push(
        `    checkout: ${r.localCheckout.updated ? 'moved' : 'left'} — ${r.localCheckout.detail}`,
      )
    }
  }
  for (const s of out.skipped) {
    lines.push(`- #${s.number}  ${s.head}  ${s.reason}`)
  }
  const c = out.counts
  const mode = out.applied ? 'PR-UPDATE' : 'PR-UPDATE (rehearsal — nothing pushed)'
  lines.push(
    `\n${mode}: updated=${c.updated} up-to-date=${c.upToDate} ` +
      `conflict=${c.conflict} failed=${c.failed} skipped=${c.skipped}`,
  )
  return `${lines.join('\n')}\n`
}
