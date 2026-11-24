/**
 * `pr-update update`: bring out-of-date PRs up to date.
 *
 * The plan comes from calling `survey` directly, not from a second
 * implementation, so what this applies is exactly what that reports. Rows
 * arrive in stack order and are applied in it. A stack updated child first is
 * work that has to be redone as soon as the parent moves.
 *
 * Nothing is written without `apply`. A bare run goes through the whole path
 * (checkout, integrate, resolve) and pushes nothing, so the report says which
 * PRs would conflict before anything reaches a remote. That is the default
 * because the worst failure of this command is a bad force-push, and a default
 * that could cause one would be wrong. `confirmPush` adds a second check: a
 * y/N before each rebase force-push.
 *
 * What is skipped, and why it is skipped rather than attempted:
 *
 *   - `strategy: skip`: the strategy guards already decided. A branch with
 *     unpushed work in somebody's worktree, or a fork this run cannot push to.
 *   - `status: blocked`: its base is another PR that is itself behind.
 *     Updating it now integrates a base that is about to move.
 *   - `status: unknown`: drift could not be measured, so nothing shows that an
 *     update is needed.
 *   - a recorded failure: the update already failed `max_failed_attempts`
 *     times at this head and base sha, and would fail the same way again.
 *     `--retry-failed` attempts it anyway.
 *
 * `verify: check`, `test` or `detect` runs the `verifyVerbs` that
 * `ports.resolveVerifyVerbs` returns before a push. `verify: detect` asks it once per PR,
 * naming the PR's update worktree as `checkout`. Otherwise it is asked once per
 * repository, naming the repository and its checkout, so a run over several
 * repositories can verify each with its own commands. Whether a verb list from
 * the project may run is the host's decision, made in that port.
 *
 * A PR number names a PR only within one repository. Two repositories in one
 * run can both hold a PR 1, so every result and skip carries its `repo`, and
 * the run keys its own bookkeeping by repository and number together.
 */

import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { forwardedSignal } from '@osdlc/command-seam'
import { Git, withoutRepositoryVars } from '@osdlc/typed-git'

import {
  describeOutcome,
  errorLine,
  tally,
  targetGitOptions,
  updateAll,
  type UpdateResult,
  type UpdateTarget,
} from './update/execute.ts'
import { ownedUnder, type WorktreeRecords } from './update/registrations.ts'
import {
  SCOPE_SHAPE,
  SurveyUsageError,
  hostKey,
  prKey,
  repoEntry,
  selectorLabel,
  surveyTargets,
  surveyWithTargets,
  type ManagedClones,
  type PrSelector,
  type RepoTarget,
  type SurveyEnv,
  type SurveyReport,
} from './survey.ts'
import type {
  AttemptKey,
  AttemptStore,
  BranchLease,
  ConfirmPush,
  Ports,
  TargetCheckout,
} from './ports.ts'
import { CLONE_MARKER } from './mirror.ts'
import { realOr } from './real-path.ts'
import { terminalConfirmPush } from './update/confirm.ts'
import {
  checkoutKept,
  discardKept,
  findKept,
  keptIsCurrent,
  keptIsTouched,
  keptOwnerElsewhere,
  keptOwnerGone,
  keptTreeCheck,
  keptFolderProblem,
  keptOwnerGoneReason,
  keptRefusal,
  listKept,
  type KeptPlace,
  type KeptRecord,
  type KeptRefusal,
  type KeptTreeCheck,
} from './update/kept.ts'
import type { PrUpdateConfig } from './config.ts'

/** A row the run left alone, and the reason, so no row is dropped without a word. */
export interface SkippedPr {
  /** `owner/name`. */
  repo: string
  number: number
  head: string
  reason: string
}

/** The reason a PR whose drift the survey could not measure is skipped. */
const UNMEASURED = 'drift could not be measured'

/** What `selectTargets` makes of a survey. */
export interface Selection {
  targets: UpdateTarget[]
  skipped: SkippedPr[]
  /** The `only` selectors no surveyed PR matched, as `selectorLabel` prints them. */
  notFound: string[]
}

/** The failed-attempt key for a target, or null when either sha is unknown. */
export function attemptKey(
  t: Pick<UpdateTarget, 'repo' | 'head' | 'headOid' | 'base' | 'baseOid'>,
): AttemptKey | null {
  if (t.headOid === null || t.baseOid === null) return null
  return { repo: t.repo, head: t.head, headOid: t.headOid, base: t.base, baseOid: t.baseOid }
}

/** Whether a run updates a whole stack in one pass. See {@link selectTargets}. */
export interface SelectOptions {
  restack?: boolean | undefined
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
 * Every row lands in exactly one list. Every selector `only` (`--pr`) named
 * lands somewhere too, even one the survey never reported (a typo, or a PR
 * that closed between the survey and this run). Such a selector is listed in
 * `notFound` instead of disappearing. A PR that disappeared from the report
 * would be the worst outcome, because the reader would assume it was fine.
 *
 * A PR is identified by repository and number together. In a run over
 * several repositories, two of them can each hold a PR 1, and both must be
 * reported.
 *
 * With `restack`, a `blocked` PR whose parent is a target is a target too,
 * marked with `stackParent`: the run updates it after its parent, onto the
 * head the parent got (see `runUpdate`). Its failed-attempt check waits until
 * then, because its new base sha is not known before. A scoped restack run
 * also selects the stack ancestors of each PR it names, since a PR cannot be
 * restacked onto a parent the run leaves behind.
 */
export function selectTargets(
  report: SurveyReport,
  only: readonly PrSelector[],
  policy: FailedAttemptPolicy = { maxFailedAttempts: 0, retryFailed: false },
  options: SelectOptions = {},
): Selection {
  const store = policy.retryFailed || policy.maxFailedAttempts === 0 ? undefined : policy.attempts
  const wantedNumbers = new Set(only.filter((s): s is number => typeof s === 'number'))
  // A key names its repository in any letter case, as `--repo` does.
  const wantedKeys = new Set(
    only.filter((s): s is string => typeof s === 'string').map((s) => s.toLowerCase()),
  )
  const scoped = only.length > 0
  const named = (repo: string, number: number): boolean =>
    !scoped || wantedNumbers.has(number) || wantedKeys.has(prKey(repo, number).toLowerCase())
  const ancestors = options.restack === true && scoped ? ancestorsOfNamed(report, named) : null
  const selected = (repo: string, number: number): boolean =>
    named(repo, number) || ancestors?.has(prKey(repo, number)) === true
  const seen = new Set<string>()
  const seenNumbers = new Set<number>()
  const targets: UpdateTarget[] = []
  const skipped: SkippedPr[] = []

  for (const row of report.prs) {
    seen.add(prKey(row.repo, row.number).toLowerCase())
    seenNumbers.add(row.number)
    const note = (reason: string): void => {
      skipped.push({ repo: row.repo, number: row.number, head: row.head, reason })
    }
    if (!selected(row.repo, row.number)) {
      // `note`, not a bare `continue`. A PR outside this run's `--pr` scope is
      // still a row the survey reported, and every surveyed PR must land in
      // `targets` or `skipped`.
      note('not selected by --pr/--branch')
      continue
    }
    // The output schema types `strategy` as a plain string. Only these two can
    // run, and this check narrows the type for the code after it.
    if (row.strategy !== 'rebase' && row.strategy !== 'merge') {
      note(row.strategyReason)
    } else if (row.status === 'blocked') {
      const parentIsTarget =
        row.parent !== null && targets.some((t) => t.repo === row.repo && t.number === row.parent)
      if (options.restack === true && parentIsTarget) {
        targets.push({
          repo: row.repo,
          number: row.number,
          head: row.head,
          base: row.base,
          headOid: row.headOid,
          baseOid: row.baseOid,
          strategy: row.strategy,
          stackParent: row.parent!,
        })
      } else {
        const why =
          options.restack === true && row.parent !== null
            ? `; parent #${row.parent} is not updated in this run`
            : ''
        note(`blocked on #${row.blockedBy ?? '?'}${why}`)
      }
    } else if (row.status === 'unknown') note(UNMEASURED)
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
  // A PR in a base/head cycle has no row, because it has no place in the
  // stack order. It is still a PR the survey listed, so it is reported here.
  for (const { repo, cycles } of report.repos) {
    for (const number of cycles) {
      const key = prKey(repo, number).toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      seenNumbers.add(number)
      const reason = selected(repo, number)
        ? 'in a base/head cycle; no stack order to update it in'
        : 'not selected by --pr/--branch'
      skipped.push({ repo, number, head: '', reason })
    }
  }
  // A `--pr` selector the survey never reported (a typo, or a PR that closed
  // between the survey and this run) never reaches `note()` in the loops
  // above, which see only what the survey listed. Report it here, so every
  // selector this run was asked about is accounted for.
  const notFound = only
    .filter((s) => (typeof s === 'number' ? !seenNumbers.has(s) : !seen.has(s.toLowerCase())))
    .map(selectorLabel)
  return { targets, skipped, notFound: [...new Set(notFound)] }
}

/** The keys of every stack ancestor of a PR `named` selects. Rows come parent first. */
function ancestorsOfNamed(
  report: SurveyReport,
  named: (repo: string, number: number) => boolean,
): Set<string> {
  const parentOf = new Map(report.prs.map((r) => [prKey(r.repo, r.number), r.parent]))
  const out = new Set<string>()
  for (const row of report.prs) {
    if (!named(row.repo, row.number)) continue
    let parent = row.parent
    while (parent !== null && !out.has(prKey(row.repo, parent))) {
      out.add(prKey(row.repo, parent))
      parent = parentOf.get(prKey(row.repo, parent)) ?? null
    }
  }
  return out
}

export const input = z.object({
  ...SCOPE_SHAPE,
  remote: SCOPE_SHAPE.remote.describe(
    "The project root's remote to fetch from, measure against and push to. A checkout `locate` describes with its own remote is read and pushed through that one.",
  ),
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
      "Treat every repository of this run as trusted for this run, satisfying any trust gate the host puts on project-sourced commands and on commands run in a `--repo` target's checkout.",
    ),
  retryFailed: z
    .boolean()
    .default(false)
    .describe(
      'Attempt PRs whose update already failed at their current head and base sha. New failures are still recorded.',
    ),
  restack: z
    .boolean()
    .optional()
    .describe(
      "Update a whole stack in one run; absent defers to `pr_update.restack`, `false` turns a configured `true` off for this run. A PR blocked only because its parent is behind is updated right after that parent, onto the head the parent just got, instead of waiting for the next run. A rebase replays only its own commits (`rebase --onto`), not its parent's old ones. With --pr or --branch, the named PRs' stack ancestors are updated too.",
    ),
  keepFailed: z
    .boolean()
    .optional()
    .describe(
      "Move the worktree of a PR that ended `conflict` or `failed` to `.pr-update/failed/<owner>-<name>-<number>/` (a `--repo` target's, to where `Ports.targetHome` says: the standalone run's is `kept/<host>/<owner>/<name>/<number>/` in pr-update's state directory), on a branch named for the PR, for a person to finish and push; absent defers to `pr_update.keep_failed`. Needs --apply. A later run skips that PR until its head or base moves, unless --retry-failed or --discard-kept; a kept tree someone has changed stays until --discard-kept.",
    ),
  discardKept: z
    .boolean()
    .optional()
    .describe(
      'Remove every kept worktree of the surveyed repositories before the run. Needs --apply; the run then goes on as usual.',
    ),
  strategy: z
    .enum(['rebase', 'merge'])
    .optional()
    .describe(
      "Override this run's default strategy (`rebase` or `merge`) for every target — beating the config `strategy` default, but NOT a per-PR `overrides` rule (a protected base pinned to `merge` stays pinned) and NOT the non-negotiable `unpushed_local` guard.",
    ),
})

export const result = z.object({
  repo: z
    .string()
    .describe('`owner/name`. A PR number alone is ambiguous in a run over several repositories.'),
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
  keptWorktree: z
    .string()
    .optional()
    .describe(
      "Present when `keepFailed` kept this PR's worktree: its path. A failed verify's log is in it, as `.pr-update-verify.log`.",
    ),
  keepError: z
    .string()
    .optional()
    .describe('Present when `keepFailed` could not keep the worktree (one holding submodules).'),
  recordError: z
    .string()
    .optional()
    .describe(
      "Present when a `--repo` target's own attempt record could not be read or written for this PR (its remote refused `refs/pr-update/*`, say): the error. The outcome stands; the target's later PRs in this run are skipped with it.",
    ),
  restackedOnto: z
    .number()
    .optional()
    .describe(
      'Present when a restack run updated this PR onto the head its parent (this PR number, same repository) got earlier in the run.',
    ),
})

export const output = z.object({
  applied: z.boolean().describe('False when this was a rehearsal.'),
  results: z.array(result).describe('One per PR acted on, in the order applied.'),
  skipped: z
    .array(
      z.object({
        repo: z.string().describe('`owner/name`.'),
        number: z.number(),
        head: z.string(),
        reason: z.string(),
      }),
    )
    .describe('PRs deliberately not acted on. Every surveyed PR is here or in `results`.'),
  notFound: z
    .array(z.string())
    .describe(
      '`--pr` selectors no surveyed PR matched, as `#N` (a number no repository has) or `owner/name#N`: a typo, or a PR that closed.',
    ),
  recordErrors: z
    .array(z.object({ repo: z.string().describe('`owner/name`.'), error: z.string() }))
    .optional()
    .describe(
      "Errors from a `--repo` target's own attempt record that no PR's `recordError` or `skipped` reason already shows.",
    ),
  discarded: z
    .array(z.string())
    .optional()
    .describe(
      'Kept worktrees this run removed (`--discard-kept`, `--retry-failed`, or a PR that moved).',
    ),
  keptRefused: z
    .array(
      z.object({
        record: z.string().describe("The kept record's file."),
        reason: z.string(),
      }),
    )
    .optional()
    .describe(
      'Kept records the run would not act on: one that names another branch, path or git directory than pr-update gives it, whose path is a symbolic link, or whose folder its checkout does not list as a worktree. Neither the record nor its folder is removed, and its PR is updated as if nothing were kept.',
    ),
  keptLeft: z
    .array(z.object({ path: z.string(), reason: z.string() }))
    .optional()
    .describe(
      'Kept worktrees `--discard-kept` left because a person moved them to a branch of their own or a detached HEAD. A PR whose kept tree is like that is skipped as changed.',
    ),
  madeTargetWorktree: z
    .literal(true)
    .optional()
    .describe(
      "Present when a run that writes made a run worktree where `Ports.targetHome` puts a `--repo` target's (for the CLI, `worktrees/` in pr-update's cache directory), even when no PR there got as far as a result. The CLI's pruning after the run reads it.",
    ),
  repos: z
    .array(repoEntry)
    .describe(
      "Repositories surveyed, as `survey` reports them. A repository's `failure` is set when it could not be listed; the run still acted on the others.",
    ),
  counts: z.object({
    updated: z.number(),
    upToDate: z.number(),
    conflict: z.number(),
    failed: z.number(),
    skipped: z.number(),
    notFound: z.number(),
  }),
})

/** Map one executor result to the `result` schema. Exported for tests. */
export function toResult(r: UpdateResult, localCheckout?: LocalCheckout): z.infer<typeof result> {
  return {
    repo: r.repo,
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
    ...(r.keptWorktree === undefined ? {} : { keptWorktree: r.keptWorktree }),
    ...(r.keepError === undefined ? {} : { keepError: r.keepError }),
    ...(r.recordError === undefined ? {} : { recordError: r.recordError }),
    ...(r.onto === undefined ? {} : { restackedOnto: r.onto.parent }),
  }
}

/** What happened to the working directory's checkout after a branch-mode push. */
export type LocalCheckout = { updated: boolean; detail: string }

/**
 * Move the working directory's checkout onto the head just pushed, when that
 * loses nothing: it is on the PR's branch, holds no uncommitted change, and is
 * exactly at the head the run started from. Otherwise leave it and say why.
 *
 * A merge update is a fast-forward of the branch. A rebase is not, and the
 * checkout still moves with `reset --hard`. It is clean and at the old remote
 * head, so every commit it held is one the push replaced or kept. Paths under
 * `.pr-update/` (this tool's own scratch files and record) do not count as
 * changes.
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
  /**
   * The trust gate for a target other than the project root: null when the run may start its
   * commands (resolvers, lockfile install, verify, repair) in that target's worktrees, else the
   * reason its PRs are skipped. Asked once per such target with a PR to update, before any
   * verify list is resolved and before anything is updated. Absent means every target may: a
   * host applies its own trust rules in `Ports.resolveVerifyVerbs`.
   */
  targetTrust?: ((target: TargetCheckout) => Promise<string | null>) | undefined
}

/**
 * `args.strategy`, folded into `cfg` for this run.
 *
 * Replaces only `strategy`. `overrides` and `guards` pass through unchanged,
 * so `chooseStrategy` (`./strategy.ts`) still reads the original `overrides`
 * (a per-PR rule still wins), and `guards.unpushed_local` still always
 * applies. The new default is used only when no override matched and no guard
 * fired. Exported and pure, so this order can be tested without running the
 * whole survey and update.
 */
export function applyStrategyOverride(
  cfg: PrUpdateConfig,
  strategy: 'rebase' | 'merge' | undefined,
): PrUpdateConfig {
  return strategy === undefined ? cfg : { ...cfg, strategy }
}

/**
 * Whether this run may write: push updates and call a repair. `--apply` is the
 * user's intent. `dryRun` is the caller's global override and beats it, so a
 * rehearsal never writes.
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
 * Exported apart from any CLI wrapper, so a test can call it directly, and a
 * host that embeds this package as a library does not run a preflight it does
 * not need.
 */
export async function runUpdate(args: UpdateArgs, env: UpdateEnv): Promise<UpdateOutput> {
  try {
    return await updateRun(args, env)
  } finally {
    // A clone whose group never reached `worktree add` still holds its lock.
    env.clones?.close()
  }
}

async function updateRun(args: UpdateArgs, env: UpdateEnv): Promise<UpdateOutput> {
  const confirmPush = bindConfirmPush(args, env.ports, env.dryRun)
  const effectiveCfg = applyStrategyOverride(env.cfg, args.strategy)
  const writes = wantsWrite(args, env.dryRun)
  const resolved = surveyTargets(args, env)
  // The clones the run uses are locked before the survey fetches them. Only `update --apply`
  // makes clones, and before its survey, so the survey measures them.
  if (env.clones !== undefined) {
    resolved.targets = env.clones.provide(resolved.targets, { apply: writes })
  }
  const { report, targets: repoTargets } = surveyWithTargets(
    args,
    { ...env, cfg: effectiveCfg },
    resolved,
  )
  // Each repository's PRs are updated in the checkout the survey measured them in, through the
  // remote it was measured against.
  const served = servedTargets(repoTargets, env)
  const routed = routeAttempts(served, env.ports.attempts)
  const attempts = routed?.store
  // Branch mode names its PR by head branch. The survey has already narrowed
  // the report to it and its stack parents. The match is by repository and
  // number, so a same-numbered PR in another repository is not swept in.
  const only: PrSelector[] =
    args.branch === undefined
      ? args.pr
      : [
          ...args.pr,
          ...report.prs.filter((r) => r.head === args.branch).map((r) => prKey(r.repo, r.number)),
        ]
  const policy: FailedAttemptPolicy = {
    attempts,
    maxFailedAttempts: effectiveCfg.max_failed_attempts,
    retryFailed: args.retryFailed,
  }
  const selection = selectTargets(report, only, policy, {
    restack: args.restack ?? effectiveCfg.restack,
  })
  const { skipped, notFound } = selection
  // A target the run looked for and could not serve (a clone another run holds, say) is
  // skipped with why, not as one whose drift could not be measured.
  const unserved = new Map(
    repoTargets.flatMap((t) => (t.unserved === undefined ? [] : [[t.repo, t.unserved] as const])),
  )
  for (const s of skipped) {
    const why = unserved.get(s.repo)
    if (why !== undefined && s.reason === UNMEASURED) s.reason = why
  }
  // A target whose own record could not be read is left out, with the store's error.
  // Each `broken` entry is shown once: as a skip reason, or on the PR it happened to.
  const shown = new Set<string>()
  const targets = selection.targets.filter((t) => {
    const why = routed?.broken.get(t.repo)
    if (why !== undefined) {
      skipped.push({ repo: t.repo, number: t.number, head: t.head, reason: why })
      shown.add(t.repo)
    }
    return why === undefined
  })

  const keepFailed = (args.keepFailed ?? effectiveCfg.keep_failed) && writes
  if (args.keepFailed === true && !args.apply)
    throw new UpdateUsageError('--keep-failed needs --apply')
  if (args.discardKept === true && !args.apply)
    throw new UpdateUsageError('--discard-kept needs --apply')

  const groups = new Map<string, Group>()
  for (const t of targets) {
    const at = served.get(t.repo)
    const skip = (reason: string): void => {
      skipped.push({ repo: t.repo, number: t.number, head: t.head, reason })
    }
    // `--branch` names a branch of the checkout the run was started in, so a target served from
    // any other checkout is left alone.
    if (args.branch !== undefined && at !== undefined && at.path !== env.projectRoot) {
      skip(`--branch names a branch of the project root; not updated in ${at.path}`)
      continue
    }
    const group = groups.get(t.repo)
    if (group !== undefined) group.targets.push(t)
    else {
      groups.set(t.repo, {
        path: at?.path ?? env.projectRoot,
        remote: at?.remote ?? args.remote,
        targets: [t],
      })
    }
  }
  // A clone with no PR to update is let go before anything else is done, so another run that
  // needs it does not wait for this run's other targets. The rest are let go as each one's
  // worktree is added.
  const releaseIdle = (): void => {
    if (env.clones === undefined) return
    const working = new Set([...groups.values()].map((g) => g.path))
    for (const t of repoTargets) {
      if (t.source === 'clone' && t.path !== null && !working.has(t.path)) {
        env.clones.release(t.path)
      }
    }
  }
  releaseIdle()
  // Before any verify list is asked for, so a list the host refuses for a target skipped here
  // does not stop the run.
  const refused = new Set<string>()
  for (const [repo, group] of groups) {
    const target = served.get(repo)?.target ?? null
    if (target === null || env.targetTrust === undefined) continue
    const why = await env.targetTrust(target)
    if (why === null) continue
    refused.add(repo)
    groups.delete(repo)
    for (const t of group.targets) {
      skipped.push({ repo: t.repo, number: t.number, head: t.head, reason: why })
    }
  }
  const runId = `${process.pid}.${Date.now()}`
  // Once per repository, not inside `updateAll`'s per-PR loop (`detect` resolves per PR
  // instead; see `verifyVerbs` in update/execute.ts). All of them
  // before any update, so a list the host refuses for one repository stops
  // the run before anything in any repository is pushed. And every surveyed
  // checkout, not only those with a PR to update, so a missing or refused
  // list is reported on every run, not first on the run that needs it.
  const verify = effectiveCfg.verify
  const verifyVerbsOf = new Map<string, readonly string[]>()
  if (verify !== 'none' && verify !== 'detect') {
    const toAsk = new Map<string, string>()
    for (const { repo, measurable, failure } of report.repos) {
      const checkout = served.get(repo)?.path
      if (measurable && failure === undefined && checkout !== undefined && !refused.has(repo)) {
        toAsk.set(repo, checkout)
      }
    }
    // Every repository with a PR to update is asked, so none is pushed
    // unverified for want of a list.
    for (const [repo, { path }] of groups) if (!toAsk.has(repo)) toAsk.set(repo, path)
    for (const [repo, checkout] of toAsk) {
      verifyVerbsOf.set(
        repo,
        await env.ports.resolveVerifyVerbs({ which: verify, trust: args.trust, repo, checkout }),
      )
    }
  }
  const {
    removed: discarded,
    refused: keptRefused,
    left: keptLeft,
  } = settleKept(args, writes, env, served, refused, groups, skipped)
  const settings = {
    resolvers: effectiveCfg.resolvers,
    lockfileInstall: effectiveCfg.lockfile_install,
    generators: env.ports.generators,
    repair: env.ports.repair,
    repairOn: effectiveCfg.repair.on,
    onRebaseConflict: effectiveCfg.on_rebase_conflict,
    maxRebaseStops: effectiveCfg.repair.max_rebase_stops,
    submodules: effectiveCfg.submodules,
    confirmPush,
  }
  // Records too old to matter go before this run writes new ones. A rehearsal writes nothing.
  // A target's own store is pruned only when the run updates it, so not for one the trust gate
  // refused, and a store that fails leaves that target out.
  if (writes) {
    routed?.prune(new Set(groups.keys()))
    for (const [repo, group] of groups) {
      const why = routed?.broken.get(repo)
      if (why === undefined) continue
      groups.delete(repo)
      if (group.targets.length > 0) shown.add(repo)
      for (const t of group.targets) {
        skipped.push({ repo: t.repo, number: t.number, head: t.head, reason: why })
      }
    }
  }
  // Those the trust gate or a broken record took out.
  releaseIdle()
  const results: UpdateResult[] = []
  let madeTargetWorktree = false
  for (const [repo, { path, remote, targets: group }] of groups) {
    const at = served.get(repo)
    const git = gitOf(path, at, env)
    // `<run>` last: a later run reads the pid of a killed one from it.
    const worktreeRoot = join(at?.worktrees ?? join(path, '.pr-update'), runId)
    // `updateAll` makes it for any PR left, before it asks for a lease, so even a run whose
    // every lease is refused wrote there.
    if (writes && at?.home === true && group.length > 0) madeTargetWorktree = true
    const verifyVerbs =
      verify === 'detect'
        ? (worktree: string, pr: number) =>
            env.ports.resolveVerifyVerbs({
              pr,
              which: 'detect',
              trust: args.trust,
              repo,
              checkout: worktree,
            })
        : (verifyVerbsOf.get(repo) ?? [])
    const lease = writes ? (at === undefined ? env.ports.lease : at.lease) : undefined
    results.push(
      ...(await updateAll(
        git,
        group,
        { ...settings, lease, remote, verifyVerbs },
        env.ports.runVerb,
        {
          apply: writes,
          worktreeRoot,
          ...(keepFailed ? { keepFailed: { place: at?.kept ?? checkoutKept(path) } } : {}),
          ...(at?.records === undefined ? {} : { records: at.records }),
          // Only a target's own lease: the host's (`Ports.lease`) ends the run on an error.
          skipOnLeaseError: at?.lease !== undefined && at.lease !== env.ports.lease,
          ...(at?.target?.source === 'clone' && env.clones !== undefined
            ? { lock: cloneLock(env.clones, path, worktreeRoot) }
            : {}),
          onSkip: (s) => skipped.push(s),
          // A rehearsal cannot repair, so `writes` keeps it from recording anything. Recorded as
          // each PR finishes, so a run killed part-way (a job timeout) keeps what it
          // learned about the PRs it had already done. Once the host is signalled nothing more is
          // recorded: the last PR may have failed only because it was stopped, and a recorded
          // failure would skip that PR on the next run.
          onResult: (r) => {
            if (writes && attempts !== undefined && forwardedSignal() === undefined) {
              recordAttempt(attempts, r)
            }
            // An error from this target's own record, during this PR, is reported on it.
            const why = routed?.broken.get(r.repo)
            if (why !== undefined && !shown.has(r.repo)) {
              r.recordError = why
              shown.add(r.repo)
            }
          },
          prepare: (target, done) => {
            // A record that failed part-way through the run leaves the rest of its PRs out. Read
            // again after `restackTarget`, whose look-up of the child's new key can fail too:
            // the routed store then answers "no record", which must not let the child run.
            const broken = routed?.broken.get(target.repo)
            const next = broken ?? restackTarget(target, done, writes, policy)
            const why = routed?.broken.get(target.repo)
            const ready = why ?? next
            if (typeof ready !== 'string') return ready
            if (why !== undefined) shown.add(target.repo)
            skipped.push({
              repo: target.repo,
              number: target.number,
              head: target.head,
              reason: ready,
            })
            return null
          },
        },
      )),
    )
  }

  const local = new Map<string, LocalCheckout>()
  if (writes && args.branch !== undefined) {
    // Branch mode names a branch of the checkout at the project root.
    const git = new Git(env.projectRoot, { runner: env.git })
    const atRoot = new Set(
      [...groups].filter(([, g]) => g.path === env.projectRoot).map(([repo]) => repo),
    )
    for (const r of results) {
      if (!atRoot.has(r.repo)) continue
      const synced = syncLocalCheckout(git, r)
      if (synced !== undefined) local.set(prKey(r.repo, r.number), synced)
    }
  }

  // Anything a target's own record raised that no PR or skip shows yet.
  const recordErrors = [...(routed?.broken ?? [])]
    .filter(([repo]) => !shown.has(repo))
    .map(([repo, error]) => ({ repo, error }))
  const t = tally(results)
  return {
    applied: writes,
    results: results.map((r) => toResult(r, local.get(prKey(r.repo, r.number)))),
    skipped,
    notFound,
    ...(recordErrors.length > 0 ? { recordErrors } : {}),
    ...(discarded.length > 0 ? { discarded } : {}),
    ...(keptRefused.length > 0 ? { keptRefused } : {}),
    ...(keptLeft.length > 0 ? { keptLeft } : {}),
    ...(madeTargetWorktree ? { madeTargetWorktree: true as const } : {}),
    repos: report.repos,
    counts: {
      updated: t['updated'] ?? 0,
      upToDate: t['up-to-date'] ?? 0,
      conflict: t['conflict'] ?? 0,
      failed: t['failed'] ?? 0,
      skipped: skipped.length,
      notFound: notFound.length,
    },
  }
}

/**
 * `updateAll`'s hold on the managed clone at `path`, whose run worktree is `worktree`, through
 * the run's {@link ManagedClones}.
 */
function cloneLock(
  clones: ManagedClones,
  path: string,
  worktree: string,
): { added: () => void; removing: (remove: () => void) => void } {
  return {
    added: () => clones.release(path),
    removing: (remove) => {
      clones.removing(path, { path: worktree, kind: 'run' }, remove)
    },
  }
}

/** One repository's PRs to update, in the checkout and through the remote that serve it. */
interface Group {
  path: string
  remote: string
  targets: UpdateTarget[]
}

/** A surveyed repository's checkout, and where the run keeps what it makes for it. */
interface Served {
  path: string
  remote: string
  /** The target as `Ports.targetHome` and the trust gate see it; null for the project root. */
  target: TargetCheckout | null
  /** The directory the run worktrees go under. */
  worktrees: string
  kept: KeptPlace
  attempts: AttemptStore | undefined
  lease: BranchLease | undefined
  /**
   * Set for a target other than the project root, whose checkout is someone else's: git runs
   * there with hooks off and without an inherited `GIT_DIR` (`targetGitOptions`), and only
   * worktrees under pr-update's own directories are cleaned up (`records`).
   */
  elsewhere?: true | undefined
  records?: WorktreeRecords | undefined
  /** Set when its worktrees and kept trees are where `Ports.targetHome` put them. */
  home?: true | undefined
}

/**
 * The client a served checkout is updated through. Its `at()` clients run in the run's worktrees
 * and kept trees, so every call it makes runs without an inherited `GIT_DIR`, `GIT_WORK_TREE` or
 * the other variables that pick a repository: in a linked worktree they would act on the
 * repository `GIT_DIR` names and could move its checked-out branch. For a target other than the
 * project root it also runs with hooks off, since a worktree checks out the PR's own files and a
 * relative `core.hooksPath` (`.husky`) would run the hooks the PR's author wrote. The project
 * root's fetch, survey, listing and branch mode's sync keep the environment as given
 * (`survey.ts`, `syncLocalCheckout`). The two agree on the project root because the CLI refuses,
 * before it fetches, a run whose variables find another repository or another top level than the
 * directory's own (`repositoryVarsRefusal`).
 */
function gitOf(path: string, at: Served | undefined, env: Pick<UpdateEnv, 'git'>): Git {
  return new Git(
    path,
    at?.elsewhere === true ? targetGitOptions(env.git) : { runner: withoutRepositoryVars(env.git) },
  )
}

/**
 * Each surveyed repository with a checkout, by `owner/name`. The project root's records, lease
 * and worktrees are the run's own (`Ports.attempts`, `Ports.lease`, `<checkout>/.pr-update/`).
 * Any other target's are where `Ports.targetHome` puts them, outside its checkout, so a run
 * writes in a located checkout only git records (D-0005's Build notes list them). Without that
 * port, a target is served from its own checkout's `.pr-update/`. Either way git runs in it
 * with hooks off, and its path is resolved through symlinks once, here.
 */
function servedTargets(repoTargets: readonly RepoTarget[], env: UpdateEnv): Map<string, Served> {
  const out = new Map<string, Served>()
  for (const t of repoTargets) {
    if (t.path === null) continue
    const own = {
      path: t.path,
      remote: t.remote,
      worktrees: join(t.path, '.pr-update'),
      kept: checkoutKept(t.path),
      attempts: env.ports.attempts,
      lease: env.ports.lease,
    }
    // A host's `locate` may answer with the project root's own checkout: that is the project root.
    if (t.source === 'root' || t.source === null || realOr(t.path) === realOr(env.projectRoot)) {
      out.set(t.repo, { ...own, target: null })
      continue
    }
    // Resolved once: the trust gate, the worktrees and the kept record all see this path.
    const path = realOr(t.path)
    const [owner = '', name = ''] = t.repo.split('/')
    const target: TargetCheckout = {
      host: hostKey(t.host ?? 'github.com'),
      owner,
      name,
      path,
      source: t.source,
      remote: t.remote,
    }
    const home = env.ports.targetHome?.(target)
    if (home === undefined) {
      // Still someone else's checkout: only what the run made under its `.pr-update/` is cleaned.
      const records = ownedUnder([join(path, '.pr-update')])
      out.set(t.repo, {
        ...own,
        path,
        worktrees: join(path, '.pr-update'),
        kept: { ...checkoutKept(path), records },
        target,
        elsewhere: true,
        records,
      })
      continue
    }
    const records = ownedUnder([home.worktrees, home.kept])
    out.set(t.repo, {
      path,
      remote: t.remote,
      target,
      worktrees: home.worktrees,
      kept: {
        dir: home.kept,
        root: home.keptRoot ?? home.kept,
        naming: 'repository',
        gitDir: commonDirOf(path, env),
        records,
      },
      attempts: home.attempts,
      lease: home.lease,
      elsewhere: true,
      records,
      home: true,
    })
  }
  return out
}

/** The real path of the git common directory of the checkout at `path`, or undefined. */
function commonDirOf(path: string, env: Pick<UpdateEnv, 'git'>): string | undefined {
  try {
    const dir = new Git(path, targetGitOptions(env.git)).gitCommonDir()
    return dir === null ? undefined : realpathSync.native(dir)
  } catch {
    return undefined
  }
}

/** The run's attempt store, routed by repository, and what went wrong with a target's own. */
interface RoutedAttempts {
  store: AttemptStore
  /**
   * The repositories whose own store failed, each with the error. Their PRs are skipped with it,
   * and the run goes on with the others.
   */
  broken: Map<string, string>
  /** Prune `fallback`, and the own store of each repository in `repos`. */
  prune: (repos: ReadonlySet<string>) => void
}

/**
 * One attempt store over each served repository's own, by the `repo` of each key, so selection,
 * recording and clearing all reach the store of the repository the PR is in. `fallback`
 * (`Ports.attempts`) serves any repository with none of its own; undefined when there is no
 * store at all.
 *
 * A target's own store lives on its own remote or in its own folder, so an error from it (a
 * remote that refuses `refs/pr-update/*`) is that target's alone: it lands in `broken`, and the
 * call reads as no record. An error from `fallback`, the project root's store, ends the run as
 * it always has.
 */
function routeAttempts(
  served: ReadonlyMap<string, Served>,
  fallback: AttemptStore | undefined,
): RoutedAttempts | undefined {
  const own = new Map<string, AttemptStore>()
  for (const [repo, s] of served) {
    if (s.target !== null && s.attempts !== undefined && s.attempts !== fallback) {
      own.set(repo, s.attempts)
    }
  }
  if (own.size === 0 && fallback === undefined) return undefined
  const broken = new Map<string, string>()
  /** Run `call` on `repo`'s store: its own, guarded, or `fallback`. */
  const on = <R>(repo: string, call: (store: AttemptStore) => R, none: R): R => {
    const store = own.get(repo)
    if (store === undefined) return fallback === undefined ? none : call(fallback)
    if (broken.has(repo)) return none
    try {
      return call(store)
    } catch (e) {
      broken.set(repo, `attempt record: ${errorLine(e)}`)
      return none
    }
  }
  const store: AttemptStore =
    own.size === 0
      ? fallback!
      : {
          get: (key) => on(key.repo, (s) => s.get(key), null),
          recordFailure: (key, reason) =>
            on(key.repo, (s) => s.recordFailure(key, reason), undefined),
          clear: (repo, head, base) => on(repo, (s) => s.clear(repo, head, base), undefined),
          prune: () => {
            fallback?.prune?.()
            for (const repo of own.keys()) on(repo, (s) => s.prune?.(), undefined)
          },
        }
  return {
    store,
    broken,
    prune: (repos) => {
      fallback?.prune?.()
      for (const repo of own.keys()) if (repos.has(repo)) on(repo, (s) => s.prune?.(), undefined)
    },
  }
}

/**
 * Settle each repository's kept worktrees before the run: `--discard-kept` removes them all, a PR
 * whose head or base moved (or that `--retry-failed` names) loses its own, and a PR whose kept
 * worktree is still current is taken out of `groups` and reported as skipped. A rehearsal removes
 * nothing, and skips only what it would not have retried.
 *
 * A kept worktree another git directory owns (a target served from another checkout this time)
 * is removed only when the PR moved or `--discard-kept` asks, and through that directory. Else
 * the PR is skipped as `kept elsewhere`, and the tree and its owner are left alone. A target the
 * trust gate `refused` is not touched.
 *
 * A record the checkout's content could have forged is refused (`KeptRefusal`): one that breaks
 * `readRecord`'s rules, or whose folder its owner does not list as a worktree at that path. It
 * is left alone, tree and file, and its PR goes on as if nothing were kept. A tree its owner lists
 * on another branch or detached is a person's (`KeptTreeCheck`): it counts as changed, and
 * `--discard-kept` leaves it.
 *
 * @returns the paths removed, the records refused, and the trees `--discard-kept` left.
 */
function settleKept(
  args: UpdateArgs,
  writes: boolean,
  env: UpdateEnv,
  served: ReadonlyMap<string, Served>,
  refused: ReadonlySet<string>,
  groups: Map<string, Group>,
  skipped: SkippedPr[],
): { removed: string[]; refused: KeptRefusal[]; left: { path: string; reason: string }[] } {
  const removed: string[] = []
  const refusals: KeptRefusal[] = []
  const onRefused = (r: KeptRefusal): void => {
    if (!refusals.some((x) => x.record === r.record)) refusals.push(r)
  }
  const left: { path: string; reason: string }[] = []
  /** What its owner's worktree list says of `record`'s tree; a forged one is refused. */
  const treeOf = (git: Git, place: KeptPlace, record: KeptRecord): KeptTreeCheck => {
    const tree = keptTreeCheck(git, place, record)
    if (tree.kind === 'forged') onRefused(keptRefusal(place, record, tree.why))
    return tree
  }
  // The run's managed clones, by real path, since a kept record names its owner by real path.
  const clones = new Map<string, string>()
  for (const s of served.values()) {
    if (s.target?.source === 'clone') clones.set(realOr(s.path), s.path)
  }
  /**
   * Discard `record`. One that a managed clone owns is discarded only under the clone's lock
   * (`ManagedClones.removing`): false when the lock could not be had, and the tree stays.
   */
  const discard = (git: Git, checkout: string, place: KeptPlace, record: KeptRecord): boolean => {
    const owner = record.gitDir ?? realOr(checkout)
    const clone = clones.get(owner) ?? (existsSync(join(owner, CLONE_MARKER)) ? owner : undefined)
    if (clone === undefined || env.clones === undefined) {
      discardKept(git, place, record)
      return true
    }
    return env.clones.removing(clone, { path: record.path, kind: 'kept' }, () =>
      discardKept(git, place, record),
    )
  }
  const places = new Map<string, { checkout: string; place: KeptPlace; at?: Served }>()
  for (const [repo, s] of served) {
    if (!refused.has(repo)) places.set(s.kept.dir, { checkout: s.path, place: s.kept, at: s })
  }
  for (const [repo, group] of groups) {
    const place = served.get(repo)?.kept ?? checkoutKept(group.path)
    if (!places.has(place.dir)) places.set(place.dir, { checkout: group.path, place })
  }
  if (args.discardKept === true) {
    for (const { checkout, place, at } of places.values()) {
      const git = gitOf(checkout, at, env)
      for (const record of listKept(place, onRefused)) {
        const tree = treeOf(git, place, record)
        if (tree.kind === 'forged') continue
        if (tree.kind === 'moved') {
          left.push({ path: record.path, reason: `${tree.why}, so a person moved it` })
          continue
        }
        const why = keptFolderProblem(place, record)
        if (why !== null) {
          onRefused(keptRefusal(place, record, why))
          continue
        }
        if (writes && !discard(git, checkout, place, record)) continue
        removed.push(record.path)
      }
    }
  }
  for (const [repo, group] of groups) {
    const at = served.get(repo)
    const place = at?.kept ?? checkoutKept(group.path)
    const git = gitOf(group.path, at, env)
    group.targets = group.targets.filter((t) => {
      const record = findKept(place, t.repo, t.number, onRefused)
      if (record === null || removed.includes(record.path)) return true
      const skip = (reason: string): false => {
        skipped.push({ repo: t.repo, number: t.number, head: t.head, reason })
        return false
      }
      // Its owner is gone, so git cannot say whether a person changed it: it stays until
      // `--discard-kept` (handled above).
      const gone = keptOwnerGone(record)
      if (gone !== null) return skip(keptOwnerGoneReason(record, gone))
      // A restack child's base is its parent's new head, known only once the parent has run, so
      // whether its tree is current waits: it is left, and a new keep replaces it. The checks
      // that do not need that still hold it back.
      const child = t.stackParent !== undefined
      const moved = !child && !keptIsCurrent(record, t)
      const owner = keptOwnerElsewhere(place, record)
      if (owner !== null && (child || args.retryFailed === true || !moved)) {
        return skip(`kept elsewhere: ${record.path} is a worktree of ${owner}`)
      }
      // Before `keptIsTouched` runs git in the folder.
      const tree = treeOf(git, place, record)
      if (tree.kind === 'forged') return true
      // A tree a person moved to a branch of their own, or detached, is theirs: changed.
      const touched = (): boolean => tree.kind === 'moved' || keptIsTouched(git, record)
      if (child) {
        return touched()
          ? skip(`kept worktree ${record.path} has local changes; push them or pass --discard-kept`)
          : true
      }
      const stale = args.retryFailed === true || moved
      // `--retry-failed` too: only `--discard-kept` removes a tree with a person's changes in it.
      if (stale && touched()) {
        return skip(
          `kept worktree ${record.path} has local changes; push them or pass --discard-kept`,
        )
      }
      if (stale) {
        const why = keptFolderProblem(place, record)
        if (why !== null) return skip(`kept worktree ${record.path} stays: ${why}`)
        if (writes && !discard(git, group.path, place, record)) {
          return skip(
            `mirror busy: kept worktree ${record.path} could not be removed under its clone's lock`,
          )
        }
        removed.push(record.path)
        return true
      }
      return skip(`failed worktree kept at ${record.path}`)
    })
  }
  return { removed: writes ? removed : [], refused: refusals, left }
}

/**
 * A restack child, ready to run after its parent: onto the head the parent
 * just got, or a reason it is held back. A target with no `stackParent` is
 * returned unchanged.
 *
 * In a run that writes, the child goes only onto a parent that was pushed.
 * A child pushed onto a head its parent's PR does not have would show the
 * parent's new commits in its own diff. A rehearsal goes onto the parent's
 * built head, which exists only in this run.
 */
export function restackTarget(
  target: UpdateTarget,
  done: readonly UpdateResult[],
  writes: boolean,
  policy: FailedAttemptPolicy,
): UpdateTarget | string {
  if (target.stackParent === undefined) return target
  const parentNumber = target.stackParent
  const parent = done.find((r) => r.repo === target.repo && r.number === parentNumber)
  const label = `parent #${parentNumber}`
  if (parent === undefined) return `blocked on #${parentNumber}; ${label} was not updated`
  const o = parent.outcome
  // A parent that turned out current never moved, so the child is
  // measured against its base as the survey saw it.
  if (o.status === 'up-to-date') return target
  if (o.status !== 'updated') return `blocked on #${parentNumber}; ${label} ended ${o.status}`
  if (writes && !o.pushed) {
    return `blocked on #${parentNumber}; ${label} was not pushed (${o.declined ?? 'not pushed'})`
  }
  const oid = o.pushedOid ?? o.builtOid
  if (oid === undefined) return `blocked on #${parentNumber}; ${label}'s new head is unknown`
  const next: UpdateTarget = {
    ...target,
    baseOid: oid,
    onto: { parent: parentNumber, oid, upstream: parent.headOid },
  }
  const store = policy.retryFailed || policy.maxFailedAttempts === 0 ? undefined : policy.attempts
  const key = attemptKey(next)
  const failures = store === undefined || key === null ? 0 : (store.get(key)?.failures ?? 0)
  if (store !== undefined && failures >= policy.maxFailedAttempts) {
    return `failed ${failures} time(s) at this head and base; waiting for either to move`
  }
  return next
}

/** Record this PR's failure under its key; forget a PR target once it updates, pushed or not. */
function recordAttempt(store: AttemptStore, r: UpdateResult): void {
  const { status } = r.outcome
  // A failure that says nothing about the PR (see `unrecorded`) neither blocks nor clears.
  if (r.outcome.status === 'failed' && r.outcome.unrecorded === true) return
  if (status === 'updated' || status === 'up-to-date') store.clear(r.repo, r.head, r.base)
  else {
    const key = attemptKey(r)
    if (key !== null) store.recordFailure(key, describeOutcome(r.outcome))
  }
}

/**
 * Render an update report as the same text `pr-update update` prints.
 *
 * Every PR is shown as `owner/name#N`, whatever the number of repositories,
 * so a run prints the same text with or without `--repo`, and each PR can be
 * pasted back into `--pr` or into GitHub.
 */
export function renderUpdateText(out: UpdateOutput): string {
  const lines: string[] = []
  for (const r of out.results) {
    const mark = r.status === 'updated' ? (r.pushed ? '✓' : '·') : r.status === 'failed' ? '✗' : '!'
    const onto =
      r.restackedOnto === undefined ? '' : `  (restacked onto ${prKey(r.repo, r.restackedOnto)})`
    lines.push(`${mark} ${prKey(r.repo, r.number)}  ${r.strategy}  ${r.head}  ${r.detail}${onto}`)
    if (r.keptWorktree !== undefined) lines.push(`    kept: ${r.keptWorktree}`)
    if (r.keepError !== undefined) lines.push(`    could not keep the worktree: ${r.keepError}`)
    if (r.recordError !== undefined) lines.push(`    record not saved: ${r.recordError}`)
    if (r.localCheckout !== undefined) {
      lines.push(
        `    checkout: ${r.localCheckout.updated ? 'moved' : 'left'} — ${r.localCheckout.detail}`,
      )
    }
  }
  for (const e of out.recordErrors ?? []) lines.push(`! ${e.repo}  ${e.error}`)
  for (const path of out.discarded ?? []) lines.push(`- discarded kept worktree ${path}`)
  for (const r of out.keptRefused ?? []) {
    lines.push(`! kept record ${r.record} left alone: ${r.reason}`)
  }
  for (const k of out.keptLeft ?? []) lines.push(`! kept worktree ${k.path} left: ${k.reason}`)
  for (const s of out.skipped) {
    lines.push(`- ${prKey(s.repo, s.number)}  ${s.head}  ${s.reason}`)
  }
  for (const selector of out.notFound) {
    lines.push(`? ${selector}  no open PR in the surveyed repositories`)
  }
  const c = out.counts
  const mode = out.applied ? 'PR-UPDATE' : 'PR-UPDATE (rehearsal — nothing pushed)'
  lines.push(
    `\n${mode}: updated=${c.updated} up-to-date=${c.upToDate} ` +
      `conflict=${c.conflict} failed=${c.failed} skipped=${c.skipped}` +
      (c.notFound > 0 ? ` not-found=${c.notFound}` : ''),
  )
  return `${lines.join('\n')}\n`
}
