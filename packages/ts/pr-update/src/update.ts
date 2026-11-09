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
 * `verify: check` or `verify: test` runs the `verifyVerbs` that
 * `ports.resolveVerifyVerbs` returns before a push. It is asked once per
 * repository, naming the repository and its checkout, so a run over several
 * repositories can verify each with its own commands. Whether a verb list from
 * the project may run is the host's decision, made in that port.
 *
 * A PR number names a PR only within one repository. Two repositories in one
 * run can both hold a PR 1, so every result and skip carries its `repo`, and
 * the run keys its own bookkeeping by repository and number together.
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
  prKey,
  repoEntry,
  runSurvey,
  selectorLabel,
  surveyTargets,
  type PrSelector,
  type SurveyEnv,
  type SurveyReport,
} from './survey.ts'
import type { AttemptKey, AttemptStore, ConfirmPush, Ports } from './ports.ts'
import { terminalConfirmPush } from './update/confirm.ts'
import type { PrUpdateConfig } from './config.ts'

/** A row the run left alone, and the reason, so no row is dropped without a word. */
export interface SkippedPr {
  /** `owner/name`. */
  repo: string
  number: number
  head: string
  reason: string
}

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
  const wantedKeys = new Set(only.filter((s): s is string => typeof s === 'string'))
  const scoped = only.length > 0
  const named = (repo: string, number: number): boolean =>
    !scoped || wantedNumbers.has(number) || wantedKeys.has(prKey(repo, number))
  const ancestors = options.restack === true && scoped ? ancestorsOfNamed(report, named) : null
  const selected = (repo: string, number: number): boolean =>
    named(repo, number) || ancestors?.has(prKey(repo, number)) === true
  const seen = new Set<string>()
  const seenNumbers = new Set<number>()
  const targets: UpdateTarget[] = []
  const skipped: SkippedPr[] = []

  for (const row of report.prs) {
    seen.add(prKey(row.repo, row.number))
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
    } else if (row.status === 'unknown') note('drift could not be measured')
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
      const key = prKey(repo, number)
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
    .filter((s) => (typeof s === 'number' ? !seenNumbers.has(s) : !seen.has(s)))
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
  remote: SCOPE_SHAPE.remote.describe('Remote to fetch from, measure against and push to.'),
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
  restack: z
    .boolean()
    .default(false)
    .describe(
      "Update a whole stack in one run. A PR blocked only because its parent is behind is updated right after that parent, onto the head the parent just got, instead of waiting for the next run. A rebase replays only its own commits (`rebase --onto`), not its parent's old ones. With --pr or --branch, the named PRs' stack ancestors are updated too.",
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
  const confirmPush = bindConfirmPush(args, env.ports, env.dryRun)
  const effectiveCfg = applyStrategyOverride(env.cfg, args.strategy)
  const report = runSurvey(args, { ...env, cfg: effectiveCfg })
  const attempts = env.ports.attempts
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
  const { targets, skipped, notFound } = selectTargets(report, only, policy, {
    restack: args.restack,
  })

  const writes = wantsWrite(args, env.dryRun)

  // Each repository's PRs are updated in that repository's own checkout, the
  // one the survey measured them in.
  const located = surveyTargets(args, env).targets
  const pathOf = new Map(located.map((t) => [t.repo, t.path ?? env.projectRoot]))
  const groups = new Map<string, { path: string; targets: UpdateTarget[] }>()
  for (const t of targets) {
    const group = groups.get(t.repo)
    if (group !== undefined) group.targets.push(t)
    else groups.set(t.repo, { path: pathOf.get(t.repo) ?? env.projectRoot, targets: [t] })
  }
  const runId = `${process.pid}.${Date.now()}`
  // Once per repository, not inside `updateAll`'s per-PR loop. All of them
  // before any update, so a list the host refuses for one repository stops
  // the run before anything in any repository is pushed. And every surveyed
  // checkout, not only those with a PR to update, so a missing or refused
  // list is reported on every run, not first on the run that needs it.
  const verify = effectiveCfg.verify
  const verifyVerbsOf = new Map<string, readonly string[]>()
  if (verify !== 'none') {
    const toAsk = new Map<string, string>()
    for (const { repo, measurable, failure } of report.repos) {
      const checkout = pathOf.get(repo)
      if (measurable && failure === undefined && checkout !== undefined) toAsk.set(repo, checkout)
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
  const settings = {
    remote: args.remote,
    resolvers: effectiveCfg.resolvers,
    lockfileInstall: effectiveCfg.lockfile_install,
    generators: env.ports.generators,
    repair: env.ports.repair,
    repairOn: effectiveCfg.repair.on,
    onRebaseConflict: effectiveCfg.on_rebase_conflict,
    confirmPush,
  }
  const results: UpdateResult[] = []
  for (const [repo, { path, targets: group }] of groups) {
    const git = new Git(path, { runner: env.git })
    const worktreeRoot = join(path, '.pr-update', runId)
    const verifyVerbs = verifyVerbsOf.get(repo) ?? []
    results.push(
      ...(await updateAll(git, group, { ...settings, verifyVerbs }, env.ports.runVerb, {
        apply: writes,
        worktreeRoot,
        prepare: (target, done) => {
          const ready = restackTarget(target, done, writes, policy)
          if (typeof ready !== 'string') return ready
          skipped.push({
            repo: target.repo,
            number: target.number,
            head: target.head,
            reason: ready,
          })
          return null
        },
      })),
    )
  }
  // A rehearsal cannot repair, so its failures say nothing about a real run.
  if (writes && attempts !== undefined) recordAttempts(attempts, results)

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

  const t = tally(results)
  return {
    applied: writes,
    results: results.map((r) => toResult(r, local.get(prKey(r.repo, r.number)))),
    skipped,
    notFound,
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
    if (r.localCheckout !== undefined) {
      lines.push(
        `    checkout: ${r.localCheckout.updated ? 'moved' : 'left'} — ${r.localCheckout.detail}`,
      )
    }
  }
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
