/**
 * `pr-update survey`: every open PR's drift from its base, the stack it is in,
 * and how it would be brought up to date.
 *
 * Read-only: it fetches, then reads. No checkout, no worktree, no index, and
 * nothing is pushed. `pr-update update` acts on this.
 *
 * It knows three things that a per-PR check cannot.
 *
 * Drift is measured locally. GitHub reports `mergeStateStatus: BEHIND` only
 * when branch protection requires an up-to-date branch. Without that rule the
 * field says nothing, however far a branch has drifted. So the count of
 * commits behind comes from `rev-list --left-right --count` over the
 * remote-tracking refs.
 *
 * Being out of date passes down a stack. When PR A targets PR B's head branch,
 * A is stacked on B. Updating A before B is wasted work, because A's base is
 * about to move. A PR can be zero commits behind and still be blocked, so the
 * survey builds the stack graph, sorts it parent first, and marks a child
 * `blocked` on the nearest ancestor that is itself behind.
 *
 * A rebase is not always safe. Each row carries the strategy it would be
 * updated with and the rule that chose it, so the plan can be checked before
 * anything runs. See `./strategy.ts` for why the unpushed-work guard comes
 * before everything else.
 *
 * Conflicts are predicted with `merge-tree`, which merges in the object
 * database and never touches a working tree. That is what makes a survey of
 * every PR cheap. The alternative is a full checkout per PR, and most of them
 * merge cleanly. A conflict prediction also carries `conflictBaseSha`, the sha
 * the base ref pointed at when it was measured. A caller can use it to tell
 * whether the prediction is still current.
 *
 * A scoped run measures only what it needs. `--pr` (or `--branch`) names the
 * PRs a caller cares about. Only those PRs and their stack parents are fetched
 * and run through `merge-tree`, because a host that updates one PR at a time
 * cannot afford a fifty-PR survey per call. The code host is still listed
 * once, since the stack graph, and so the blocked-parent check, comes from the
 * whole listing.
 *
 * Scope defaults come from `PrUpdateConfig`, and every key there has a
 * default, so the command works with no config. Flags override config, and
 * config overrides the built-in defaults.
 */

import { z } from 'zod'

import { Git, parseGitUrl, parseRemoteUrl, type Worktree } from '@osdlc/typed-git'

import type { CodeHost, CodeHostPrDetail } from '@osdlc/code-host'
import type { CommandRunner } from '@osdlc/command-seam'
import { FailureError, type Failure } from '@osdlc/result'
import { githubCodeHostFor } from './code-host.ts'
import { chooseStrategy, type Strategy } from './strategy.ts'
import type { PrUpdateConfig } from './config.ts'
import type { Ports } from './ports.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where a PR stands relative to its base, and to its stack. Declared once so
 *  the `status` zod enum below always matches this type. */
const SURVEY_STATUSES = ['up-to-date', 'behind', 'blocked', 'unknown'] as const
export type SurveyStatus = (typeof SURVEY_STATUSES)[number]

/** What merging the base into the head would do. Declared once for the same
 *  reason as {@link SURVEY_STATUSES}. */
const MERGE_PREDICTIONS = ['clean', 'conflict', 'unknown'] as const
export type MergePrediction = (typeof MERGE_PREDICTIONS)[number]

/**
 * A scope the run cannot honour: `--branch` named a branch that is the head of
 * no open PR. It is a usage error, not an empty result. A caller that asked to
 * update "the PR of this branch" and got nothing back would assume it was
 * current.
 */
export class SurveyUsageError extends Error {
  override name = 'SurveyUsageError'
}

/** A repository to survey, and the checkout its drift is measured in. */
export interface RepoTarget {
  /** `owner/name`, as the code host knows it. */
  slug: string
  /**
   * Local checkout, or null when this machine has none. Drift and conflict
   * prediction read git objects, so a target with no path is listed and
   * reported unmeasurable, not guessed at.
   */
  path: string | null
}

export interface SurveyRow {
  repo: string
  number: number
  title: string
  url: string
  base: string
  head: string
  isDraft: boolean
  /** True when the head branch lives in a fork. */
  crossRepo: boolean
  /**
   * The head sha the code host reports now. A rebase force-push is pinned to
   * it, so if someone pushes to the PR between the survey and the update, the
   * push is refused instead of overwriting their work.
   */
  headOid: string | null
  /** The base's remote-tracking sha when measured. Null when unmeasurable. */
  baseOid: string | null
  /** Commits the head carries that the base does not. Null when unmeasurable. */
  ahead: number | null
  /** Commits the base carries that the head does not. Null when unmeasurable. */
  behind: number | null
  /** The open PR this one is stacked on, if any. */
  parent: number | null
  /** Nearest ancestor that is itself behind, which is the one to update first. */
  blockedBy: number | null
  status: SurveyStatus
  merge: MergePrediction
  conflicts: string[]
  /**
   * The base ref's resolved sha at the moment `merge-tree` predicted this
   * conflict. Null when `merge` is not `'conflict'`, or when the base ref
   * itself could not be resolved.
   */
  conflictBaseSha: string | null
  /** Submitted reviews. A rewrite would outdate the threads anchored to them. */
  reviews: number
  /** The head branch is checked out somewhere holding unpushed commits. */
  unpushedLocal: boolean
  strategy: Strategy
  strategyRule: string
  strategyReason: string
}

// ---------------------------------------------------------------------------
// The stack graph
// ---------------------------------------------------------------------------

/**
 * Order PRs parent-first, so a stack is updated from its root down.
 *
 * A topological sort (Kahn's algorithm) over the "A's base is B's head" edges.
 * PRs at the same depth keep PR-number order, so two runs over the same state
 * print the same list. Anything left at the end is in a cycle. The GitHub UI
 * cannot make one, but a survey that dropped those PRs would report the wrong
 * thing, so they are returned separately.
 */
export function topoOrder(prs: readonly CodeHostPrDetail[]): {
  order: CodeHostPrDetail[]
  cycles: number[]
} {
  const parentOf = parentEdges(prs)
  const pending = [...prs].sort((a, b) => a.number - b.number)
  const emitted = new Set<number>()
  const order: CodeHostPrDetail[] = []

  let progress = true
  while (progress) {
    progress = false
    for (const pr of pending) {
      if (emitted.has(pr.number)) continue
      const parent = parentOf.get(pr.number) ?? null
      if (parent !== null && !emitted.has(parent)) continue
      emitted.add(pr.number)
      order.push(pr)
      progress = true
    }
  }

  const cycles = pending.filter((pr) => !emitted.has(pr.number)).map((pr) => pr.number)
  return { order, cycles }
}

/** The `parent` edge for each PR, by number. */
export function parentEdges(prs: readonly CodeHostPrDetail[]): Map<number, number | null> {
  const byHead = new Map<string, number>()
  for (const pr of prs) byHead.set(pr.headRef, pr.number)
  const edges = new Map<number, number | null>()
  for (const pr of prs) {
    const parent = byHead.get(pr.baseRef) ?? null
    // A PR whose base is its own head is not a stack, it is a broken row.
    edges.set(pr.number, parent === pr.number ? null : parent)
  }
  return edges
}

/**
 * The nearest ancestor that is behind: the PR to update before this one.
 *
 * Walks up the whole stack, not only to the parent. A grandparent's drift
 * reaches every descendant, and stopping at one level would report a child as
 * ready when its base is still about to move.
 */
export function nearestBehindAncestor(
  prNumber: number,
  edges: ReadonlyMap<number, number | null>,
  behindOf: ReadonlyMap<number, number | null>,
): number | null {
  const seen = new Set<number>([prNumber])
  let cursor = edges.get(prNumber) ?? null
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor)
    const behind = behindOf.get(cursor) ?? null
    if (behind !== null && behind > 0) return cursor
    cursor = edges.get(cursor) ?? null
  }
  return null
}

/** Classify one row, given its own drift and its ancestry. */
export function statusFor(behind: number | null, blockedBy: number | null): SurveyStatus {
  if (blockedBy !== null) return 'blocked'
  if (behind === null) return 'unknown'
  return behind > 0 ? 'behind' : 'up-to-date'
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * Drift and predicted merge for one PR, read from the remote-tracking refs.
 *
 * Every git call goes through `try`. A ref this checkout has never fetched is
 * a valid "not known", and one unmeasurable PR must not fail the survey. Null
 * and zero are kept apart: only zero means up to date.
 */
export function measure(
  git: Git,
  pr: CodeHostPrDetail,
): Pick<SurveyRow, 'baseOid' | 'ahead' | 'behind' | 'merge' | 'conflicts' | 'conflictBaseSha'> {
  const base = `origin/${pr.baseRef}`
  const head = `origin/${pr.headRef}`

  // `resolveRef` returns `null` for a ref that does not resolve. `soft` also
  // returns `null` for a broken object store.
  const baseOid = git.soft.resolveRef(base)

  const counts = git.try.aheadBehind(base, head)
  const ahead = counts.ok ? counts.value.ahead : null
  const behind = counts.ok ? counts.value.behind : null
  const quiet = { baseOid, ahead, behind, conflicts: [], conflictBaseSha: null }

  // Nothing to merge when the head already contains the base, so skip the
  // merge-tree subprocess.
  if (behind === 0) return { ...quiet, merge: 'clean' }

  const predicted = git.try.mergeTree(head, base)
  if (!predicted.ok) return { ...quiet, merge: 'unknown' }
  if (predicted.value.status === 'clean') return { ...quiet, merge: 'clean' }
  return {
    ...quiet,
    merge: 'conflict',
    conflicts: predicted.value.conflicts,
    conflictBaseSha: baseOid,
  }
}

/**
 * Does a checkout of `head` hold commits the remote has not seen?
 *
 * A force-push cannot check this for itself. `--force-with-lease` compares
 * against the remote ref, which a local-only commit does not change, so it
 * reports the push as safe even when it will discard local work.
 *
 * Unknown counts as unsafe. A check that cannot read the refs has not shown
 * that a rewrite is fine. Being wrong one way costs a needless merge commit.
 * Being wrong the other way loses work that cannot be recovered.
 */
export function unpushedLocalWork(git: Git, worktrees: readonly Worktree[], head: string): boolean {
  const wt = worktrees.find((w) => w.branch === head)
  if (wt === undefined) return false
  if (wt.head === null) return true
  const counts = git.try.aheadBehind(`origin/${head}`, wt.head)
  if (!counts.ok) return true
  return counts.value.ahead > 0
}

/** Assemble one repository's rows. Pure given `git`. */
export function surveyRows(
  git: Git,
  prs: readonly CodeHostPrDetail[],
  opts: { repo: string; worktrees: readonly Worktree[]; cfg: PrUpdateConfig; measurable: boolean },
): { rows: SurveyRow[]; cycles: number[] } {
  const { order, cycles } = topoOrder(prs)
  const edges = parentEdges(prs)

  const unmeasured = {
    baseOid: null,
    ahead: null,
    behind: null,
    merge: 'unknown' as const,
    conflicts: [],
    conflictBaseSha: null,
  }
  const measured = new Map<number, ReturnType<typeof measure>>()
  for (const pr of order) {
    measured.set(pr.number, opts.measurable ? measure(git, pr) : unmeasured)
  }

  const behindOf = new Map<number, number | null>()
  for (const [num, m] of measured) behindOf.set(num, m.behind)

  return {
    cycles,
    rows: order.map((pr) => {
      const m = measured.get(pr.number)!
      const blockedBy = nearestBehindAncestor(pr.number, edges, behindOf)
      const unpushed = opts.measurable ? unpushedLocalWork(git, opts.worktrees, pr.headRef) : false
      const decision = chooseStrategy(
        {
          base: pr.baseRef,
          labels: pr.labels,
          ahead: m.ahead,
          reviews: pr.reviewCount,
          unpushedLocal: unpushed,
          crossRepo: pr.isCrossRepository,
        },
        opts.cfg,
      )
      return {
        repo: opts.repo,
        number: pr.number,
        title: pr.title,
        url: pr.url,
        base: pr.baseRef,
        head: pr.headRef,
        isDraft: pr.isDraft,
        crossRepo: pr.isCrossRepository,
        headOid: pr.headSha,
        ...m,
        parent: edges.get(pr.number) ?? null,
        blockedBy,
        status: statusFor(m.behind, blockedBy),
        reviews: pr.reviewCount,
        unpushedLocal: unpushed,
        strategy: decision.strategy,
        strategyRule: decision.rule,
        strategyReason: decision.reason,
      }
    }),
  }
}

/**
 * The PRs named by `wanted`, plus every stack ancestor of each.
 *
 * Ancestors are kept because a PR whose parent is behind is `blocked`, and
 * reporting that needs the parent measured. The order of `prs` is kept. A
 * number not in `prs` is ignored. Reporting it missing is the caller's job.
 */
export function scopeToPrs(
  prs: readonly CodeHostPrDetail[],
  wanted: ReadonlySet<number>,
): CodeHostPrDetail[] {
  const edges = parentEdges(prs)
  const keep = new Set<number>()
  for (const pr of prs) {
    if (!wanted.has(pr.number)) continue
    let cursor: number | null = pr.number
    while (cursor !== null && !keep.has(cursor)) {
      keep.add(cursor)
      cursor = edges.get(cursor) ?? null
    }
  }
  return prs.filter((pr) => keep.has(pr.number))
}

// ---------------------------------------------------------------------------
// Repository targets
// ---------------------------------------------------------------------------

/**
 * Which repositories to survey, and where each is checked out.
 *
 * The repository at `--project-root` is always the default target and needs
 * no config. `--repo owner/name` names others, and `ports.locate` finds each
 * one's checkout, through the host's own registry or what a standalone run
 * provides (see `defaults.ts`).
 *
 * Only `--repo` puts a repository in scope. A host's repository registry does
 * not, so a bare run stays on the local repository and never spreads to every
 * repository on the machine.
 *
 * A named slug with no checkout on this machine is kept and reported
 * unmeasurable, not dropped. Quietly surveying fewer repositories than were
 * asked for would be worse.
 */
export function resolveTargets(
  localSlug: string | null,
  localPath: string,
  selected: readonly string[],
  locate: (slug: string) => string | null,
): RepoTarget[] {
  if (selected.length === 0) {
    return localSlug === null ? [] : [{ slug: localSlug, path: localPath }]
  }
  const seen = new Set<string>()
  const out: RepoTarget[] = []
  for (const slug of selected) {
    if (seen.has(slug)) continue
    seen.add(slug)
    out.push({ slug, path: slug === localSlug ? localPath : locate(slug) })
  }
  return out
}

// ---------------------------------------------------------------------------
// Op I/O schemas
// ---------------------------------------------------------------------------

/**
 * The scope flags. Exported as a zod shape, not a schema, because `update`
 * takes all of them plus its own, and shapes can be combined where built
 * schemas cannot.
 */
export const SCOPE_SHAPE = {
  author: z
    .string()
    .optional()
    .describe(
      'Only survey PRs by this author; `@me` is the authenticated user. Defaults to `pr_update.author`, which itself defaults to every author.',
    ),
  repo: z
    .array(z.string())
    .default([])
    .describe(
      'Repository to survey as `owner/name`, repeatable. Defaults to the repository at --project-root alone. Others are located via the host `locate` port; one with no checkout on this machine is listed as unmeasurable.',
    ),
  noFetch: z
    .boolean()
    .default(false)
    .describe(
      'Skip the fetch and measure against the remote-tracking refs as they stand. Drift is only as fresh as the last fetch.',
    ),
  noDrafts: z
    .boolean()
    .default(false)
    .describe('Exclude draft PRs. Defaults to `pr_update.include_drafts`.'),
  limit: z.coerce
    .number()
    .int()
    .default(100)
    .describe('Maximum number of open PRs to list per repository.'),
  remote: z
    .string()
    .default('origin')
    .describe('Remote to fetch from. Measurement always reads `origin/*` remote-tracking refs.'),
  pr: z
    .array(z.coerce.number().int())
    .default([])
    .describe(
      'Restrict the run to these PR numbers, repeatable. Only they and their stack parents are fetched and merge-treed. In `update` they are still applied in stack order, and a PR whose parent is behind is still skipped, because updating onto a base about to move is wasted work.',
    ),
  branch: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Restrict the run to the open PR whose head is this branch (and its stack parents), as `--pr` does. No such PR is a usage error. The CLI fills in the current branch of the working directory when `--branch` has no name.',
    ),
} as const

export const input = z.object(SCOPE_SHAPE)

export const row = z.object({
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  base: z.string(),
  head: z.string(),
  isDraft: z.boolean(),
  crossRepo: z
    .boolean()
    .describe('True when the head branch lives in a fork; a host never updates such a PR.'),
  headOid: z.string().nullable(),
  baseOid: z
    .string()
    .nullable()
    .describe("The base branch's remote-tracking sha when measured; null otherwise."),
  ahead: z.number().nullable(),
  behind: z.number().nullable(),
  parent: z.number().nullable(),
  blockedBy: z.number().nullable(),
  /** {@link SurveyStatus}, as a zod enum over the same source array. */
  status: z.enum(SURVEY_STATUSES),
  /** {@link MergePrediction}, as a zod enum over the same source array. */
  merge: z.enum(MERGE_PREDICTIONS),
  conflicts: z.array(z.string()),
  conflictBaseSha: z
    .string()
    .nullable()
    .describe("The base ref's resolved sha when `merge` is `conflict`; null otherwise."),
  reviews: z.number(),
  unpushedLocal: z.boolean(),
  strategy: z.string(),
  strategyRule: z.string(),
  strategyReason: z.string(),
})

/** Why one repository of a several-repository run could not be listed. */
export const repoFailure = z.object({
  kind: z.string().describe('The failure kind, such as `not-authenticated` or `network`.'),
  message: z.string(),
  hint: z.string().optional(),
})

export const output = z.object({
  repos: z
    .array(
      z.object({
        slug: z.string(),
        measurable: z.boolean(),
        fetched: z.boolean(),
        failure: repoFailure
          .optional()
          .describe(
            'Present when this repository could not be listed (several-repository runs only; a single repository throws). It contributes no PRs.',
          ),
      }),
    )
    .describe('Repositories surveyed. `measurable` is false when no local checkout is known.'),
  prs: z.array(row).describe('Open PRs in stack order — a parent always precedes its children.'),
  cycles: z
    .array(z.number())
    .describe('PR numbers whose base/head edges form a cycle; excluded from the ordering.'),
  counts: z.object({
    total: z.number(),
    upToDate: z.number(),
    behind: z.number(),
    blocked: z.number(),
    conflicted: z.number(),
    unknown: z.number(),
    rebase: z.number(),
    merge: z.number(),
    skip: z.number(),
  }),
})

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** A count, or an em dash when it could not be measured. */
export function num(n: number | null): string {
  return n === null ? '—' : String(n)
}

/** Everything `survey` reports. `update` plans from the same call. */
export type SurveyReport = z.infer<typeof output>

/** The scope flags both `survey` and `update` accept. */
export type SurveyArgs = z.infer<typeof input>

/** Everything a run needs beyond the args and the config. */
export interface SurveyEnv {
  projectRoot: string
  dryRun: boolean
  git: CommandRunner
  /** Runs `gh` for the default GitHub code host. Unused when `codeHost` is given. */
  gh: CommandRunner
  /**
   * The code host for one surveyed repository: `cwd` is the checkout to run
   * from, `slug` the repository. Absent means GitHub over `gh`.
   */
  codeHost?: ((target: { cwd: string; slug: string }) => CodeHost) | undefined
  cfg: PrUpdateConfig
  ports: Pick<Ports, 'locate'>
}

/**
 * Refspecs that update just the remote-tracking refs of these PRs' heads and
 * bases. A fork's head is not a branch of this remote, and asking for it would
 * fail the whole fetch, so only its base is requested.
 */
function scopedRefspecs(prs: readonly CodeHostPrDetail[], remote: string): string[] {
  const branches = new Set(
    prs.flatMap((p) => (p.isCrossRepository ? [p.baseRef] : [p.headRef, p.baseRef])),
  )
  return [...branches].map((b) => `+refs/heads/${b}:refs/remotes/${remote}/${b}`)
}

/**
 * `owner/name` from a git remote reference, or null when it names no project.
 * It tries `parseGitUrl`, for the hosts it knows (GitHub, GitLab, ...), first, then
 * any other `host/owner/repo` remote, which is the form of a self-hosted Forgejo.
 */
export function remoteSlug(url: string): string | null {
  const info = parseGitUrl(url)
  if (info !== null && info.user && info.project) return `${info.user}/${info.project}`
  const ref = parseRemoteUrl(url)
  return ref === null ? null : `${ref.owner}/${ref.repo}`
}

/**
 * Run the survey.
 *
 * Kept separate from `update` so `update` plans from exactly what `survey`
 * reports, not from a second implementation that could differ. An update is
 * the survey plus an apply step, and this function keeps that true.
 */
export function runSurvey(args: SurveyArgs, env: SurveyEnv): SurveyReport {
  const { cfg } = env
  const localGit = new Git(env.projectRoot, { runner: env.git })
  const localUrl = localGit.soft.remoteGetUrl(args.remote)
  const localSlug = localUrl !== null ? remoteSlug(localUrl) : null
  const codeHostFor = env.codeHost ?? githubCodeHostFor(env.gh)

  const targets = resolveTargets(localSlug, env.projectRoot, args.repo, env.ports.locate)
  // Flags beat config; config beats the built-in default.
  const author = args.author ?? cfg.author ?? undefined
  const includeDrafts = args.noDrafts ? false : cfg.include_drafts

  const repos: SurveyReport['repos'] = []
  const allRows: SurveyRow[] = []
  const allCycles: number[] = []
  let branchMatches = 0

  for (const target of targets) {
    const measurable = target.path !== null
    const git = new Git(target.path ?? env.projectRoot, { runner: env.git })

    const isLocal = target.slug === localSlug
    const codeHost = codeHostFor({ cwd: target.path ?? env.projectRoot, slug: target.slug })
    const listed = codeHost.listPrDetails({
      limit: args.limit,
      ...(isLocal ? {} : { repo: target.slug }),
      ...(author !== undefined ? { author } : {}),
    })
    // A failed listing (the tool is missing, not signed in, no network) is not
    // an empty one. Reading it as "no open PRs" would hide the failure. With
    // one repository it is thrown as the code host's own classified failure.
    // With several, the others are still surveyed. The failure is recorded on
    // this repository's entry, and the caller reports it and exits with its code.
    if (!listed.ok) {
      const { error } = listed
      if (targets.length === 1) throw new FailureError(error)
      repos.push({
        slug: target.slug,
        measurable,
        fetched: false,
        failure: {
          kind: error.kind,
          message: error.message,
          ...(error.hint === undefined ? {} : { hint: error.hint }),
        },
      })
      continue
    }
    const filtered = includeDrafts ? listed.value : listed.value.filter((p) => !p.isDraft)
    const wanted = new Set(args.pr)
    if (args.branch !== undefined) {
      // A fork's branch of the same name is another repository's branch, and
      // not one this run could push to.
      for (const p of filtered) {
        if (p.headRef === args.branch && !p.isCrossRepository) {
          wanted.add(p.number)
          branchMatches += 1
        }
      }
    }
    const scoped = wanted.size > 0 || args.branch !== undefined
    const prs = scoped ? scopeToPrs(filtered, wanted) : filtered

    // After the listing, so a scoped run knows which branches to ask for.
    // `try`: when the remote cannot be reached, the survey reports what the
    // last fetch left, flagged, instead of failing the whole run.
    const fetched =
      measurable && !args.noFetch && !env.dryRun
        ? scoped
          ? git.try.fetch(args.remote, scopedRefspecs(prs, args.remote)).ok
          : git.try.fetch(args.remote, undefined, { prune: true }).ok
        : false
    const worktrees = measurable ? git.soft.worktrees() : []

    const { rows, cycles } = surveyRows(git, prs, {
      repo: target.slug,
      worktrees,
      cfg,
      measurable,
    })
    repos.push({ slug: target.slug, measurable, fetched })
    allRows.push(...rows)
    allCycles.push(...cycles)
  }

  if (args.branch !== undefined && branchMatches === 0) {
    throw new SurveyUsageError(`no open PR has head branch '${args.branch}'`)
  }

  const count = (fn: (r: SurveyRow) => boolean): number => allRows.filter(fn).length
  return {
    repos,
    prs: allRows,
    cycles: allCycles,
    counts: {
      total: allRows.length,
      upToDate: count((r) => r.status === 'up-to-date'),
      behind: count((r) => r.status === 'behind'),
      blocked: count((r) => r.status === 'blocked'),
      conflicted: count((r) => r.merge === 'conflict'),
      unknown: count((r) => r.status === 'unknown'),
      rebase: count((r) => r.strategy === 'rebase'),
      merge: count((r) => r.strategy === 'merge'),
      skip: count((r) => r.strategy === 'skip'),
    },
  }
}

/**
 * The repositories of a report that could not be listed, as failures whose
 * message names the repository. Empty for a single-repository run, which throws.
 */
export function repoFailuresOf(report: Pick<SurveyReport, 'repos'>): Failure[] {
  return report.repos.flatMap((r) =>
    r.failure === undefined
      ? []
      : [
          {
            kind: r.failure.kind,
            message: `${r.slug}: ${r.failure.message}`,
            ...(r.failure.hint === undefined ? {} : { hint: r.failure.hint }),
          },
        ],
  )
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

/** Render a survey report as the same aligned text `pr-update survey` prints. */
export function renderSurveyText(out: SurveyReport): string {
  const lines: string[] = []
  // Before the rows, and before any early return: a repository that could not
  // be reached must not read as a repository with no PRs.
  const unmeasured = out.repos.filter((r) => !r.measurable)
  for (const r of unmeasured) {
    lines.push(`${r.slug}: no local checkout — drift not measured`)
  }
  // A repository that could not be listed is not one with no PRs.
  for (const r of out.repos) {
    if (r.failure !== undefined) lines.push(`${r.slug}: could not be listed — ${r.failure.message}`)
  }
  if (out.prs.length === 0) {
    lines.push('PR-SURVEY: no open PRs')
    return `${lines.join('\n')}\n`
  }
  if (unmeasured.length > 0) lines.push('')
  const multi = out.repos.length > 1
  const w = {
    pr: Math.max(3, ...out.prs.map((p) => String(p.number).length + 1)),
    status: Math.max(6, ...out.prs.map((p) => p.status.length)),
    plan: Math.max(4, ...out.prs.map((p) => p.strategy.length)),
    head: Math.max(4, ...out.prs.map((p) => p.head.length)),
  }
  const repoCol = multi ? `${pad('REPO', 18)}  ` : ''
  lines.push(
    `${repoCol}${pad('PR', w.pr)}  ${pad('STATUS', w.status)}  ${pad('BEHIND', 6)}  ` +
      `${pad('AHEAD', 5)}  ${pad('PLAN', w.plan)}  ${pad('HEAD', w.head)}  BASE`,
  )
  for (const p of out.prs) {
    // Each note changes what to do about the PR, and more than one can be true
    // at once. For example, a conflicted PR in an out-of-date stack, updated by
    // a strategy a guard picked instead of the project default.
    const notes: string[] = []
    if (p.blockedBy !== null) notes.push(`blocked on #${p.blockedBy}`)
    if (p.merge === 'conflict') {
      const shown = p.conflicts.slice(0, 3).join(', ')
      const rest = p.conflicts.length > 3 ? ` (+${p.conflicts.length - 3})` : ''
      notes.push(`conflicts: ${shown}${rest}`)
    }
    if (p.strategyRule !== 'default') notes.push(p.strategyReason)
    const note = notes.length > 0 ? `  ← ${notes.join('; ')}` : ''
    lines.push(
      `${multi ? `${pad(p.repo, 18)}  ` : ''}${pad(`#${p.number}`, w.pr)}  ` +
        `${pad(p.status, w.status)}  ${pad(num(p.behind), 6)}  ${pad(num(p.ahead), 5)}  ` +
        `${pad(p.strategy, w.plan)}  ${pad(p.head, w.head)}  ${p.base}${note}`,
    )
  }
  if (out.cycles.length > 0) {
    lines.push(`\nunordered (base/head cycle): ${out.cycles.map((n) => `#${n}`).join(', ')}`)
  }
  const c = out.counts
  lines.push(
    `\nPR-SURVEY: total=${c.total} up-to-date=${c.upToDate} behind=${c.behind} ` +
      `blocked=${c.blocked} conflicted=${c.conflicted} unknown=${c.unknown}` +
      ` | plan rebase=${c.rebase} merge=${c.merge} skip=${c.skip}`,
  )
  return `${lines.join('\n')}\n`
}
