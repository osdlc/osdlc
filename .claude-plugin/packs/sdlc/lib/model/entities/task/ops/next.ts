/**
 * `sdlc task next` — deterministic, dispatchability-aware pickup-order op.
 *
 * The algorithm is the single source of truth for orchestrator dispatch and
 * task-work's no-arg pickup per [[D-Q2WR-task-pickup-order]]. The verb
 * *selects dispatchable work*, not merely sorts — by default it filters out
 * any candidate whose `depends_on` targets are not yet satisfied.
 * `--include-blocked` restores the pure sort-and-lift view (human triage /
 * `--explain`).
 *
 * Default sort chain (highest weight first):
 *   1. milestone (the task's milestone, ranked by its place in the roadmap's
 *      release order; a task in no milestone sorts last — see
 *      `../milestone-walk.ts`, [[T-JSJJ]])
 *   2. priority (true above false)
 *   3. impact   (high > medium > low > missing)
 *   4. complexity (small > medium > large > missing)
 *   5. created  (oldest first)
 *   6. basename (final tiebreak)
 *
 * The milestone rank leads the chain, so within one milestone the chain is
 * unchanged and across milestones the release order wins over priority.
 *
 * Dependency handling has two distinct passes:
 *   - **Lift** (ordering): a dependent's lead sort-tuple (milestone rank
 *     included, so lift crosses milestones) propagates to its `depends_on`
 *     targets so a low-impact blocker of high-impact work sorts first. Runs to
 *     a fixed point.
 *   - **Dispatchability filter** (selection, default on): a candidate with any
 *     `depends_on` target not satisfied per the per-entity-type band in
 *     `@lib/model/corpus` (`SATISFIED_BY_TYPE`/`isSatisfied`) is dropped and
 *     recorded in `skipped_blocked`. The task's milestone `depends_on` gates
 *     it the same way, by the same rule; such a target is reported as
 *     `<target> (milestone <M-XXXX>)`. A task in several milestones is gated by all of
 *     them, and a milestone `depends_on` cycle is reported like a task cycle. An unresolved target (no such entity) is
 *     treated as unsatisfied (fail-safe). `--include-blocked` disables this pass.
 *     {@link checkDependsOn} applies the same rule to one named task at launch.
 *
 * Two further selection predicates implement the settled orchestrator-selection
 * rule of [[D-VSLI-distributed-work-runner-architecture]] ([[T-JOXA]]):
 *   - **Leaf** ({@link isLeaf}): a task with one or more children is an
 *     organizational rollup, never dispatched. Children are derived by inverting
 *     `parent_key` across the FULL task corpus, not the filtered candidates — a
 *     parent whose only child is `closed/done` is still a parent. Dropped
 *     candidates land in `skipped_parent`. Leaf-only is interim scaffolding
 *     toward nested traversal; relaxing it is a swap of this one predicate.
 *   - **Kind** ({@link passesKind}): a candidate's effective kind (absent
 *     `kind:` reads as `implementation`) must be one the caller accepts.
 *     `--kind` is repeatable and defaults to `implementation`, so `planning` /
 *     `research` leaves stay human-driven until their runners exist. Dropped
 *     candidates land in `skipped_kind`.
 * A goal scope (`--milestone`, `--until-version`) is a third cut of the same
 * kind ({@link inScope}): a task whose milestone is not among the named
 * milestones, or is released after the version ceiling, is dropped into
 * `skipped_scope`; with either flag set, a task in no milestone is dropped
 * too. A task that transitively blocks an in-scope task is admitted whatever
 * its own milestone: dependency lift crosses milestones, so it is ranked at
 * its dependent's rank rather than cut. The three predicates run over the SORTED list,
 * after the lift pass, so an excluded task still lifts the blockers it
 * depends on — the same staging the dispatchability filter uses.
 *
 * A lease predicate keeps the pool free of work a person has taken: a candidate
 * whose local lease mirror names a `human` owner (`sdlc task start`) is dropped
 * into `skipped_human`, so neither `task-work`'s no-arg pickup nor the
 * orchestrator offers it. It runs last and only on the survivors, since it
 * reads one git ref per task.
 *
 * `cli.render` preserves the line-per-basename stdout format and the
 * `CYCLE basenames=<comma-separated>` stderr marker; it returns 1 on a cycle so
 * the exit code shapes correctly without throwing. `--explain` emits the lifted
 * sort tuple alongside each basename. Skipped candidates surface on stderr
 * (`skipped-parent: …`, `skipped-kind: …`, `skipped-human: …`, `skipped-blocked: …`) and,
 * structurally, in the matching output arrays (`--output json`).
 */

import { join, resolve } from 'node:path'

import { z } from 'zod'

import { defineOp, OpError } from '@lib/registry'
import { isDir } from '@lib/util/fs'
import { mainCheckoutFrom } from '@lib/util/git'
import { unwrapWikilink } from '@lib/util/wikilinks'
import { loadCorpus, type CorpusEntry } from '@lib/model/corpus/loader'
import { scanEntities } from '@lib/model/read'
import { resolveTarget } from '@lib/model/corpus/resolve'
import { isNonExpiringOwner } from '@lib/services/lease/index'
import { isSatisfied, CLOSED_PREFIX } from '@lib/model/corpus/satisfied'
import { buildEdges, findCycles } from '@lib/model/corpus/graph'
import { readTask } from '../read.ts'
import {
  buildMilestoneWalk,
  canonicalVersion,
  compareVersions,
  UNPOSITIONED_RANK,
  type MilestonePosition,
  type MilestoneWalk,
} from '../milestone-walk.ts'
import { readLocalLease } from './_probe_core.ts'

// ---------------------------------------------------------------------------
// Sort key helpers (algorithm unchanged from the pre-rename `task sort`)
// ---------------------------------------------------------------------------

const IMPACT_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }
const IMPACT_MISSING = -1
const COMPLEXITY_RANK: Record<string, number> = { small: 1, medium: 2, large: 3 }
const COMPLEXITY_MISSING = 99
const CYCLE_MARKER_PREFIX = 'CYCLE basenames='

interface SortKey {
  milestoneRank: number
  priorityRank: number
  impactRank: number
  complexityRank: number
  created: string
  basename: string
}

function priorityRank(value: unknown): number {
  return value === true ? 0 : 1
}

function impactRank(value: unknown): number {
  if (typeof value !== 'string' || !(value in IMPACT_RANK)) return -IMPACT_MISSING
  return -IMPACT_RANK[value]!
}

function complexityRank(value: unknown): number {
  if (typeof value !== 'string' || !(value in COMPLEXITY_RANK)) return COMPLEXITY_MISSING
  return COMPLEXITY_RANK[value]!
}

function sortKeyFromFm(
  basename: string,
  fm: Record<string, unknown>,
  milestoneRank: number,
): SortKey {
  let created = fm['created']
  if (typeof created !== 'string') created = '9999-12-31'
  return {
    milestoneRank,
    priorityRank: priorityRank(fm['priority']),
    impactRank: impactRank(fm['impact']),
    complexityRank: complexityRank(fm['complexity']),
    created: created as string,
    basename,
  }
}

function compareSortKeys(a: SortKey, b: SortKey): number {
  if (a.milestoneRank !== b.milestoneRank) return a.milestoneRank - b.milestoneRank
  if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank
  if (a.impactRank !== b.impactRank) return a.impactRank - b.impactRank
  if (a.complexityRank !== b.complexityRank) return a.complexityRank - b.complexityRank
  if (a.created !== b.created) return a.created < b.created ? -1 : 1
  if (a.basename !== b.basename) return a.basename < b.basename ? -1 : 1
  return 0
}

function compareLeadTuples(a: SortKey, b: SortKey): number {
  if (a.milestoneRank !== b.milestoneRank) return a.milestoneRank - b.milestoneRank
  if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank
  if (a.impactRank !== b.impactRank) return a.impactRank - b.impactRank
  if (a.complexityRank !== b.complexityRank) return a.complexityRank - b.complexityRank
  if (a.created !== b.created) return a.created < b.created ? -1 : 1
  return 0
}

function resolveProjectRoot(override: string): string {
  if (override !== '') return resolve(override)
  return mainCheckoutFrom(process.cwd()) ?? resolve(process.cwd())
}

interface FilterOptions {
  states: readonly string[]
  excludeAutonomy: readonly string[]
}

function passesFilters(fm: Record<string, unknown>, opts: FilterOptions): boolean {
  const state = fm['state']
  if (typeof state !== 'string' || !opts.states.includes(state)) return false
  const autonomy = fm['autonomy']
  if (typeof autonomy === 'string' && opts.excludeAutonomy.includes(autonomy)) {
    return false
  }
  return true
}

function dependsOnTargets(fm: Record<string, unknown>): string[] {
  const raw = fm['depends_on']
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const target = unwrapWikilink(entry)
    if (target !== null) out.push(target)
  }
  return out
}

// ---------------------------------------------------------------------------
// Selection predicates ([[D-VSLI-distributed-work-runner-architecture]], [[T-JOXA]])
//
// Each predicate is a standalone function over one candidate plus a derived
// corpus fact, so the handler loop below is a sequence of predicate calls
// rather than inlined conditions. Relaxing leaf-only into nested traversal is
// then a change to `isLeaf` and its call site, not a rewrite.
// ---------------------------------------------------------------------------

/** Effective kind of a task whose `kind:` is absent. */
const DEFAULT_KIND = 'implementation'

/**
 * Invert `parent_key` across the WHOLE task corpus into `parent -> children`.
 *
 * Every task file feeds this map, not just the filtered candidates: a parent
 * whose only child is `closed/done` is still a parent. `parent_key` is a
 * wikilink, so it is unwrapped and then resolved against task basenames the
 * same way `depends_on` targets are — a parent referenced by bare id
 * (`[[T-JOXA]]`) resolves to its full basename. An unresolvable reference
 * names no parent and is ignored.
 */
function childrenByParent(
  taskFm: ReadonlyMap<string, Record<string, unknown>>,
): Map<string, string[]> {
  const taskBasenames = new Set(taskFm.keys())
  const children = new Map<string, string[]>()
  for (const [basename, fm] of taskFm) {
    const raw = fm['parent_key']
    if (typeof raw !== 'string') continue
    const unwrapped = unwrapWikilink(raw)
    if (unwrapped === null) continue
    const parent = resolveTarget(unwrapped, taskBasenames)
    if (parent === null) continue
    const bucket = children.get(parent)
    if (bucket === undefined) children.set(parent, [basename])
    else bucket.push(basename)
  }
  for (const bucket of children.values()) bucket.sort()
  return children
}

/**
 * True when no task names `basename` as its parent. A non-leaf is a structural
 * rollup ([[D-ORMG-data-model]]) and is skipped regardless of its `kind`.
 */
function isLeaf(basename: string, children: ReadonlyMap<string, string[]>): boolean {
  return (children.get(basename) ?? []).length === 0
}

/** A task's effective kind: absent `kind:` reads as `implementation`. */
function effectiveKind(fm: Record<string, unknown>): string {
  const raw = fm['kind']
  return typeof raw === 'string' && raw !== '' ? raw : DEFAULT_KIND
}

/** True when a task's effective kind is one the caller accepts. */
function passesKind(fm: Record<string, unknown>, kinds: readonly string[]): boolean {
  return kinds.includes(effectiveKind(fm))
}

/** The goal scope `--milestone` / `--until-version` cut the frontier to. */
interface GoalScope {
  /** Resolved milestone basenames; empty means "any milestone". */
  milestones: ReadonlySet<string>
  /** Release-version ceiling, canonical; `null` means no ceiling. */
  untilVersion: string | null
}

function scopeIsActive(scope: GoalScope): boolean {
  return scope.milestones.size > 0 || scope.untilVersion !== null
}

/**
 * True when a task lies inside the goal scope, through any one of its
 * milestones (`positions` maps each to its release version). With no scope set
 * everything is in scope. With one set, a task in no milestone is out, and so
 * is a milestone with no release version when a version ceiling is set (it is
 * not known to ship by then).
 */
function inScope(
  milestones: readonly string[],
  positions: ReadonlyMap<string, MilestonePosition>,
  scope: GoalScope,
): boolean {
  if (!scopeIsActive(scope)) return true
  return milestones.some((m) => {
    if (scope.milestones.size > 0 && !scope.milestones.has(m)) return false
    if (scope.untilVersion === null) return true
    const version = positions.get(m)?.version ?? null
    return version !== null && compareVersions(version, scope.untilVersion) <= 0
  })
}

/**
 * Parse a caller-supplied release-version ceiling to its canonical spelling.
 * Throws when it is not a full `X.Y.Z[-pre]` semver: `1.0` would otherwise
 * compare as a ceiling nothing meets and silently cut the whole frontier.
 */
export function parseUntilVersion(raw: string): string {
  const v = canonicalVersion(raw)
  if (v === null) {
    throw new OpError('INVALID_INPUT', `--until-version is not a full semver (X.Y.Z): ${raw}`)
  }
  return v
}

/**
 * The `<target> (milestone <M-XXXX>)` entries for every unsatisfied
 * `depends_on` of the given milestones. A task in several milestones is gated
 * by all of them.
 */
function milestoneGate(
  milestones: readonly string[],
  walk: MilestoneWalk,
  corpus: Map<string, CorpusEntry>,
  corpusBasenames: Set<string>,
): string[] {
  return milestones.flatMap((m) =>
    unsatisfiedTargets(walk.frontmatter.get(m)!, corpus, corpusBasenames).map(
      (target) => `${target} (milestone ${m})`,
    ),
  )
}

// ---------------------------------------------------------------------------
// Dispatchability ([[T-0015]]) — the cross-entity corpus loader, target
// resolver, and satisfied-band predicate now live in `@lib/model/corpus`
// ([[T-7EJO]]), and the task-to-milestone walk in `../milestone-walk.ts`
// ([[T-JSJJ]]); this op imports them above and keeps only the dispatch +
// sort/lift wiring below.
// ---------------------------------------------------------------------------

/**
 * Resolve a candidate's `depends_on` targets against the corpus and return the
 * subset that is NOT satisfied (unresolved targets included — fail-safe). An
 * empty result means the candidate is dispatchable.
 */
function unsatisfiedTargets(
  fm: Record<string, unknown>,
  corpus: Map<string, CorpusEntry>,
  corpusBasenames: Set<string>,
): string[] {
  const out: string[] = []
  for (const raw of dependsOnTargets(fm)) {
    const target = resolveTarget(raw, corpusBasenames)
    if (target === null) {
      out.push(raw)
      continue
    }
    const entry = corpus.get(target)
    if (!entry || !isSatisfied(entry.type, entry.state)) out.push(target)
  }
  return out
}

export type DependsOnCheck = { ok: true } | { ok: false; unsatisfied: string[] }

/**
 * Re-read one task's `depends_on`, and its milestone's, against the current
 * corpus, by the same rule the dispatchability filter uses. Throws when the
 * task or its frontmatter cannot be read.
 */
export function checkDependsOn(projectRoot: string, basename: string): DependsOnCheck {
  const task = readTask(basename, { projectRoot })
  if (task === null) throw new Error(`task not found: ${basename}`)
  const fm = task.fm
  if (fm === null) throw new Error(`cannot read frontmatter for task ${basename}`)
  const corpus = loadCorpus(join(projectRoot, 'docs', 'planning'))
  const names = new Set(corpus.keys())
  const unsatisfied = unsatisfiedTargets(fm, corpus, names)
  const taskFm = new Map<string, Record<string, unknown>>()
  for (const row of scanEntities('task', projectRoot)) taskFm.set(row.basename, row.fm ?? {})
  const walk = buildMilestoneWalk(projectRoot, corpus, taskFm)
  unsatisfied.push(...milestoneGate(walk.milestonesOf(basename, fm), walk, corpus, names))
  return unsatisfied.length === 0 ? { ok: true } : { ok: false, unsatisfied }
}

function liftSortKeys(
  candidates: Set<string>,
  baseKeys: Map<string, SortKey>,
  reverseEdges: Map<string, string[]>,
): { lifted: Map<string, SortKey>; liftedFrom: Map<string, string | null> } {
  const lifted = new Map<string, SortKey>(baseKeys)
  const liftedFrom = new Map<string, string | null>()
  for (const b of candidates) liftedFrom.set(b, null)

  let changed = true
  while (changed) {
    changed = false
    const sortedTargets = [...candidates].sort()
    for (const target of sortedTargets) {
      const targetKey = lifted.get(target)!
      for (const dependent of reverseEdges.get(target) ?? []) {
        if (!lifted.has(dependent)) continue
        const depKey = lifted.get(dependent)!
        if (compareLeadTuples(depKey, targetKey) < 0) {
          const newKey: SortKey = {
            milestoneRank: depKey.milestoneRank,
            priorityRank: depKey.priorityRank,
            impactRank: depKey.impactRank,
            complexityRank: depKey.complexityRank,
            created: depKey.created,
            basename: targetKey.basename,
          }
          lifted.set(target, newKey)
          liftedFrom.set(target, dependent)
          changed = true
        }
      }
    }
  }
  return { lifted, liftedFrom }
}

// ---------------------------------------------------------------------------
// Op descriptor
// ---------------------------------------------------------------------------

const input = z.object({
  projectRoot: z.string().default(''),
  milestone: z.array(z.string()).default([]),
  untilVersion: z.string().nullable().default(null),
  state: z.array(z.string()).default([]),
  kind: z.array(z.string()).default([]),
  excludeAutonomy: z.array(z.string()).default([]),
  includeBlocked: z.boolean().default(false),
  limit: z.coerce.number().int().nullable().default(null),
  explain: z.boolean().default(false),
})

/** One sorted task entry carrying frontmatter fields + lifted sort tuple. */
const sortedEntrySchema = z.object({
  basename: z.string(),
  priority: z.boolean(),
  impact: z.union([z.string(), z.null()]),
  complexity: z.union([z.string(), z.null()]),
  created: z.union([z.string(), z.null()]),
  lifted_from: z.union([z.string(), z.null()]),
  /** The milestone the task belongs to; `null` when it belongs to none. */
  milestone: z.union([z.string(), z.null()]),
  /** The task's own milestone rank (its earliest milestone's place in the release order). */
  milestone_rank: z.number(),
  /** The rank it sorts at when dependency lift moved it; `null` when lift left it alone. */
  lifted_rank: z.union([z.number(), z.null()]),
  /** Lifted sort-tuple fields (always present; used by `--explain` render). */
  priority_rank: z.number(),
  impact_rank: z.number(),
  complexity_rank: z.number(),
  created_rank: z.string(),
})

/** A candidate removed by the dispatchability filter, with the targets that
 *  were not satisfied (resolved-but-unsatisfied basenames or raw unresolved
 *  references). */
const skippedBlockedSchema = z.object({
  basename: z.string(),
  unsatisfied: z.array(z.string()),
})

/** A candidate removed by the leaf predicate, with the children that make it a
 *  structural rollup (sorted basenames). */
const skippedParentSchema = z.object({
  basename: z.string(),
  children: z.array(z.string()),
})

/** A candidate removed by the kind predicate, with the effective kind that did
 *  not match (`implementation` when the task carries no `kind:`). */
const skippedKindSchema = z.object({
  basename: z.string(),
  kind: z.string(),
})

/** A candidate removed by the goal scope, with the milestone that put it
 *  outside (`null` when it belongs to none). */
const skippedScopeSchema = z.object({
  basename: z.string(),
  milestone: z.union([z.string(), z.null()]),
})

/** A candidate removed because a person holds its lease (`sdlc task start`), with the lease's phase. */
const skippedHumanSchema = z.object({
  basename: z.string(),
  phase: z.string(),
})

const output = z.object({
  /** Ordered list of dispatchable task entries (after lift, sort, the leaf and
   *  kind predicates, and — unless `--include-blocked` — the dispatchability
   *  filter). */
  ordered: z.array(sortedEntrySchema),
  /**
   * Non-null when a dependency cycle was detected; contains the cycle members
   * sorted alphabetically. The render hook returns exit code 1 in this case.
   */
  cycle: z.array(z.string()).nullable(),
  /** When true the render hook emits the sort tuple alongside each basename. */
  explain: z.boolean(),
  /** Candidates dropped by the dispatchability filter (empty under
   *  `--include-blocked`). */
  skipped_blocked: z.array(skippedBlockedSchema),
  /** Candidates dropped by the leaf predicate (they have children). */
  skipped_parent: z.array(skippedParentSchema),
  /** Candidates dropped by the kind predicate. */
  skipped_kind: z.array(skippedKindSchema),
  /** Candidates dropped by the goal scope (`--milestone` / `--until-version`). */
  skipped_scope: z.array(skippedScopeSchema),
  /** Candidates dropped because a person holds the task lease (read off the local ref mirror). */
  skipped_human: z.array(skippedHumanSchema),
})

export default defineOp({
  path: ['task', 'next'],
  summary:
    'Select the next dispatchable tasks: pickup-order sort (milestone release order > priority > impact > complexity > created > basename, with dependency lift), keeping only leaves (a task with children is a rollup) of kind implementation (absent kind counts as implementation), and filtering out tasks whose own or milestone depends_on is unsatisfied (use --include-blocked to keep them). --milestone / --until-version cut the frontier to a goal scope.',
  // Read-only: scans task/corpus frontmatter and reports a sort order; never
  // writes.
  mutating: false,
  input,
  output,
  cli: {
    flags: {
      milestone: {
        repeatable: true,
        valueName: 'id',
        help: 'Goal scope: keep only tasks in this milestone (repeatable; an id or basename), plus any task that blocks one of them. Other tasks in no milestone are dropped.',
      },
      untilVersion: {
        valueName: 'version',
        help: "Goal scope: keep only tasks whose milestone's release version is at or before this one (e.g. 1.0.0). Tasks in no milestone are dropped.",
      },
      state: {
        repeatable: true,
        valueName: 'state',
        help: 'State to include (repeatable). Default: open/ready.',
      },
      kind: {
        repeatable: true,
        valueName: 'kind',
        help: 'Task kind to include (repeatable); a task with no kind counts as implementation. Default: implementation.',
      },
      excludeAutonomy: {
        repeatable: true,
        valueName: 'value',
        help: 'Autonomy value to exclude (repeatable).',
      },
      includeBlocked: {
        help: 'Keep candidates whose depends_on targets are unsatisfied (disables the default dispatchability filter; for human triage / --explain).',
      },
      limit: { valueName: 'n', help: 'Truncate output to the first N entries after filtering.' },
      explain: { help: 'Emit each basename alongside its lifted sort tuple (debug aid).' },
    },
    render: (out, io) => {
      if (out.cycle !== null) {
        io.stderr(`${CYCLE_MARKER_PREFIX}${out.cycle.join(',')}\n`)
        return 1
      }
      for (const s of out.skipped_parent) {
        io.stderr(`skipped-parent: ${s.basename} (has children: ${s.children.join(', ')})\n`)
      }
      for (const s of out.skipped_kind) {
        io.stderr(`skipped-kind: ${s.basename} (kind: ${s.kind})\n`)
      }
      for (const s of out.skipped_scope) {
        io.stderr(`skipped-scope: ${s.basename} (milestone: ${s.milestone ?? 'none'})\n`)
      }
      for (const s of out.skipped_human) {
        io.stderr(`skipped-human: ${s.basename} (held by a person, lease phase: ${s.phase})\n`)
      }
      for (const s of out.skipped_blocked) {
        io.stderr(
          `skipped-blocked: ${s.basename} (depends_on unsatisfied: ${s.unsatisfied.join(', ')})\n`,
        )
      }
      if (out.explain) {
        for (const e of out.ordered) {
          const liftedStr = e.lifted_from ? ` lifted_from=${e.lifted_from}` : ''
          io.stdout(
            `${e.basename}  priority_rank=${e.priority_rank} ` +
              `impact_rank=${e.impact_rank} ` +
              `complexity_rank=${e.complexity_rank} ` +
              `created=${e.created_rank} milestone=${e.milestone ?? 'none'} ` +
              `milestone_rank=${e.milestone_rank}` +
              `${e.lifted_rank === null ? '' : ` lifted_rank=${e.lifted_rank}`}${liftedStr}\n`,
          )
        }
      } else {
        for (const e of out.ordered) {
          io.stdout(`${e.basename}\n`)
        }
      }
      return 0
    },
  },
  handler: (args, ctx) => {
    const states = args.state.length > 0 ? args.state : ['open/ready']
    const kinds = args.kind.length > 0 ? args.kind : [DEFAULT_KIND]
    const excludeAutonomy = args.excludeAutonomy

    // The registry adapter always injects `--project-root` into `args.projectRoot`
    // (see registry_adapter.ts §GLOBAL_FLAGS injection); when empty (direct
    // invokeOp calls), fall back to ctx.projectRoot (which resolveProjectRoot sets to the nearest sdlc.yaml at or above the cwd, else the cwd).
    const projectRoot = resolveProjectRoot(
      args.projectRoot !== '' ? args.projectRoot : ctx.projectRoot,
    )
    const planningDir = join(projectRoot, 'docs', 'planning')
    const tasksDir = join(planningDir, 'tasks')
    if (!isDir(tasksDir)) {
      throw new Error(`tasks directory not found: ${tasksDir}`)
    }

    // Task candidates: full frontmatter (sort keys + filters).
    const taskFm = new Map<string, Record<string, unknown>>()
    for (const row of scanEntities('task', projectRoot)) {
      taskFm.set(row.basename, row.fm ?? {})
    }

    // Cross-entity corpus: every entity's {type, state} for resolving and
    // satisfaction-checking depends_on targets across entity types.
    const corpus = loadCorpus(planningDir)
    const corpusBasenames = new Set(corpus.keys())
    const corpusState = new Map<string, string>([...corpus].map(([b, e]) => [b, e.state]))

    // Leaf facts come from the FULL task corpus, before any candidate
    // filtering: a parent whose only child is closed/done is still a parent.
    const children = childrenByParent(taskFm)

    // Milestone walk: each task's milestone and that milestone's place in the
    // release order. Built over the full corpus, like the leaf facts above.
    const walk = buildMilestoneWalk(projectRoot, corpus, taskFm)
    const milestonesOf = new Map<string, string[]>()
    for (const [b, fm] of taskFm) milestonesOf.set(b, walk.milestonesOf(b, fm))
    /** A task's own rank: that of its earliest milestone. */
    const rankOf = (b: string): number => {
      const first = milestonesOf.get(b)?.[0]
      return first === undefined ? UNPOSITIONED_RANK : walk.positions.get(first)!.rank
    }

    // Milestone `depends_on` cycles are reported like task cycles, whatever
    // the candidates: they would otherwise read as "blocked forever".
    const milestoneEdges = buildEdges({
      nodes: new Set(walk.frontmatter.keys()),
      targetsOf: (m) => dependsOnTargets(walk.frontmatter.get(m) ?? {}),
      resolve: (raw) => resolveTarget(raw, corpusBasenames),
      skip: (target) => !walk.frontmatter.has(target),
    })
    const milestoneCycles = findCycles(
      new Set(walk.frontmatter.keys()),
      milestoneEdges.forwardEdges,
    )
    if (milestoneCycles.length > 0) {
      return {
        ordered: [],
        cycle: [...new Set(milestoneCycles[0]!)].sort(),
        explain: false,
        skipped_blocked: [],
        skipped_parent: [],
        skipped_kind: [],
        skipped_scope: [],
        skipped_human: [],
      }
    }

    const scopeMilestones = new Set<string>()
    for (const raw of args.milestone) {
      const target = resolveTarget(unwrapWikilink(raw) ?? raw, corpusBasenames)
      if (target === null || !walk.frontmatter.has(target)) {
        throw new OpError('INVALID_INPUT', `--milestone does not name a milestone: ${raw}`)
      }
      scopeMilestones.add(target)
    }
    const scope: GoalScope = {
      milestones: scopeMilestones,
      untilVersion: args.untilVersion === null ? null : parseUntilVersion(args.untilVersion),
    }

    const candidates = new Set<string>()
    for (const [b, fm] of taskFm.entries()) {
      if (passesFilters(fm, { states, excludeAutonomy })) candidates.add(b)
    }

    if (candidates.size === 0) {
      return {
        ordered: [],
        cycle: null,
        explain: args.explain,
        skipped_blocked: [],
        skipped_parent: [],
        skipped_kind: [],
        skipped_scope: [],
        skipped_human: [],
      }
    }

    const { forwardEdges, reverseEdges, unresolved } = buildEdges({
      nodes: candidates,
      targetsOf: (b) => dependsOnTargets(taskFm.get(b) ?? {}),
      resolve: (raw) => resolveTarget(raw, corpusBasenames),
      skip: (target) => (corpusState.get(target) ?? '').startsWith(CLOSED_PREFIX),
    })
    for (const u of unresolved) {
      ctx.io.stderr(`warning: depends_on target does not resolve: ${u.source}:${u.raw}\n`)
    }

    const cycles = findCycles(candidates, forwardEdges)
    if (cycles.length > 0) {
      const cycle = [...new Set(cycles[0]!)].sort()
      return {
        ordered: [],
        cycle,
        explain: false,
        skipped_blocked: [],
        skipped_parent: [],
        skipped_kind: [],
        skipped_scope: [],
        skipped_human: [],
      }
    }

    const baseKeys = new Map<string, SortKey>()
    for (const b of candidates) baseKeys.set(b, sortKeyFromFm(b, taskFm.get(b)!, rankOf(b)))
    const { lifted, liftedFrom } = liftSortKeys(candidates, baseKeys, reverseEdges)

    let orderedBasenames = [...candidates].sort((a, b) =>
      compareSortKeys(lifted.get(a)!, lifted.get(b)!),
    )

    // Goal scope: the tasks whose own milestone is in scope, plus every
    // candidate that transitively blocks one of them. A blocker is pulled in
    // at its dependent's lifted rank (dependency lift crosses milestones)
    // rather than cut, or the in-scope task would never unblock.
    const admitted = new Set<string>()
    const pending: string[] = []
    for (const b of candidates) {
      if (inScope(milestonesOf.get(b) ?? [], walk.positions, scope)) pending.push(b)
    }
    while (pending.length > 0) {
      const b = pending.pop()!
      if (admitted.has(b)) continue
      admitted.add(b)
      pending.push(...(forwardEdges.get(b) ?? []))
    }

    // Selection predicates, applied to the sorted list so the lift pass above
    // still saw every candidate. Order is leaf > kind > scope > dispatchability:
    // a rollup is reported as a rollup even when its kind or deps would also
    // exclude it. `--include-blocked` opts out of the last one only.
    const skippedParent: Array<{ basename: string; children: string[] }> = []
    const skippedKind: Array<{ basename: string; kind: string }> = []
    const skippedBlocked: Array<{ basename: string; unsatisfied: string[] }> = []
    const skippedScope: Array<{ basename: string; milestone: string | null }> = []
    const skippedHuman: Array<{ basename: string; phase: string }> = []
    const kept: string[] = []
    for (const b of orderedBasenames) {
      const fm = taskFm.get(b)!
      if (!isLeaf(b, children)) {
        skippedParent.push({ basename: b, children: children.get(b)! })
        continue
      }
      if (!passesKind(fm, kinds)) {
        skippedKind.push({ basename: b, kind: effectiveKind(fm) })
        continue
      }
      const milestones = milestonesOf.get(b) ?? []
      if (!admitted.has(b)) {
        skippedScope.push({ basename: b, milestone: milestones[0] ?? null })
        continue
      }
      if (!args.includeBlocked) {
        const unsat = unsatisfiedTargets(fm, corpus, corpusBasenames)
        unsat.push(...milestoneGate(milestones, walk, corpus, corpusBasenames))
        if (unsat.length > 0) {
          skippedBlocked.push({ basename: b, unsatisfied: unsat })
          continue
        }
      }
      // A person started this task by hand (`sdlc task start`): it is theirs
      // until they release it, so it is never offered for pickup or dispatch.
      // Read off the local lease mirror, network-free like `task inflight`.
      const lease = readLocalLease(b, projectRoot, ctx)
      if (lease !== null && isNonExpiringOwner(lease.ownerKind)) {
        skippedHuman.push({ basename: b, phase: lease.phase })
        continue
      }
      kept.push(b)
    }
    orderedBasenames = kept

    if (args.limit !== null) orderedBasenames = orderedBasenames.slice(0, args.limit)

    const ordered = orderedBasenames.map((b) => {
      const fm = taskFm.get(b)!
      const liftedKey = lifted.get(b)!
      return {
        basename: b,
        priority: 'priority' in fm ? Boolean(fm['priority']) : false,
        impact: (fm['impact'] as string | null | undefined) ?? null,
        complexity: (fm['complexity'] as string | null | undefined) ?? null,
        created: (fm['created'] as string | null | undefined) ?? null,
        lifted_from: liftedFrom.get(b) ?? null,
        milestone: milestonesOf.get(b)?.[0] ?? null,
        milestone_rank: rankOf(b),
        lifted_rank: liftedKey.milestoneRank === rankOf(b) ? null : liftedKey.milestoneRank,
        priority_rank: liftedKey.priorityRank,
        impact_rank: liftedKey.impactRank,
        complexity_rank: liftedKey.complexityRank,
        created_rank: liftedKey.created,
      }
    })

    return {
      ordered,
      cycle: null,
      explain: args.explain,
      skipped_blocked: skippedBlocked,
      skipped_parent: skippedParent,
      skipped_kind: skippedKind,
      skipped_scope: skippedScope,
      skipped_human: skippedHuman,
    }
  },
})
