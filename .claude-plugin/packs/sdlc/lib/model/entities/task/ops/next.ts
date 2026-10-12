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
 *   1. priority (true above false)
 *   2. impact   (high > medium > low > missing)
 *   3. complexity (small > medium > large > missing)
 *   4. created  (oldest first)
 *   5. basename (final tiebreak)
 *
 * Dependency handling has two distinct passes:
 *   - **Lift** (ordering): a dependent's lead sort-tuple propagates to its
 *     `depends_on` targets so a low-impact blocker of high-impact work sorts
 *     first. Runs to a fixed point.
 *   - **Dispatchability filter** (selection, default on): a candidate with any
 *     `depends_on` target not satisfied per the per-entity-type band in
 *     `@lib/model/corpus` (`SATISFIED_BY_TYPE`/`isSatisfied`) is dropped and
 *     recorded in `skipped_blocked`. An unresolved target (no such entity) is
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
 * Both run over the SORTED list, after the lift pass, so an excluded task still
 * lifts the blockers it depends on — the same staging the dispatchability
 * filter uses.
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

import { defineOp } from '@lib/registry'
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

function sortKeyFromFm(basename: string, fm: Record<string, unknown>): SortKey {
  let created = fm['created']
  if (typeof created !== 'string') created = '9999-12-31'
  return {
    priorityRank: priorityRank(fm['priority']),
    impactRank: impactRank(fm['impact']),
    complexityRank: complexityRank(fm['complexity']),
    created: created as string,
    basename,
  }
}

function compareSortKeys(a: SortKey, b: SortKey): number {
  if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank
  if (a.impactRank !== b.impactRank) return a.impactRank - b.impactRank
  if (a.complexityRank !== b.complexityRank) return a.complexityRank - b.complexityRank
  if (a.created !== b.created) return a.created < b.created ? -1 : 1
  if (a.basename !== b.basename) return a.basename < b.basename ? -1 : 1
  return 0
}

function compareLeadTuples(a: SortKey, b: SortKey): number {
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

// ---------------------------------------------------------------------------
// Dispatchability ([[T-0015]]) — the cross-entity corpus loader, target
// resolver, and satisfied-band predicate now live in `@lib/model/corpus`
// ([[T-7EJO]]); this op imports them above and keeps only the task-local
// dispatch + sort/lift wiring below.
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
 * Re-read one task's `depends_on` against the current corpus, by the same
 * rule the dispatchability filter uses. Throws when the task or its
 * frontmatter cannot be read.
 */
export function checkDependsOn(projectRoot: string, basename: string): DependsOnCheck {
  const task = readTask(basename, { projectRoot })
  if (task === null) throw new Error(`task not found: ${basename}`)
  const fm = task.fm
  if (fm === null) throw new Error(`cannot read frontmatter for task ${basename}`)
  const corpus = loadCorpus(join(projectRoot, 'docs', 'planning'))
  const unsatisfied = unsatisfiedTargets(fm, corpus, new Set(corpus.keys()))
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
  /** Candidates dropped because a person holds the task lease (read off the local ref mirror). */
  skipped_human: z.array(skippedHumanSchema),
})

export default defineOp({
  path: ['task', 'next'],
  summary:
    'Select the next dispatchable tasks: pickup-order sort (priority > impact > complexity > created > basename, with dependency lift), keeping only leaves (a task with children is a rollup) of kind implementation (absent kind counts as implementation), and filtering out tasks whose depends_on is unsatisfied (use --include-blocked to keep them).',
  // Read-only: scans task/corpus frontmatter and reports a sort order; never
  // writes.
  mutating: false,
  input,
  output,
  cli: {
    flags: {
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
              `created=${e.created_rank}${liftedStr}\n`,
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
        skipped_human: [],
      }
    }

    const baseKeys = new Map<string, SortKey>()
    for (const b of candidates) baseKeys.set(b, sortKeyFromFm(b, taskFm.get(b)!))
    const { lifted, liftedFrom } = liftSortKeys(candidates, baseKeys, reverseEdges)

    let orderedBasenames = [...candidates].sort((a, b) =>
      compareSortKeys(lifted.get(a)!, lifted.get(b)!),
    )

    // Selection predicates, applied to the sorted list so the lift pass above
    // still saw every candidate. Order is leaf > kind > dispatchability: a
    // rollup is reported as a rollup even when its kind or deps would also
    // exclude it. `--include-blocked` opts out of the last one only.
    const skippedParent: Array<{ basename: string; children: string[] }> = []
    const skippedKind: Array<{ basename: string; kind: string }> = []
    const skippedBlocked: Array<{ basename: string; unsatisfied: string[] }> = []
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
      if (!args.includeBlocked) {
        const unsat = unsatisfiedTargets(fm, corpus, corpusBasenames)
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
      skipped_human: skippedHuman,
    }
  },
})
