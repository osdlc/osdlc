/**
 * Task entity — Zod schema, schema version 9.
 *
 * `CommonFrontmatter` base + the full Task field set, `.strict()` for the JSON
 * `additionalProperties: false`, plus the `closed/* ⇒ completion_note`
 * conditional required (the JSON's lone allOf if/then) expressed as a
 * `.superRefine`.
 *
 * Task's only common-level required fields are `state` and `id` (the JSON
 * `required: ["state", "id"]`); `type`/`title`/`created` are optional on Task
 * (unlike most types), so the common base's required fields are relaxed here
 * via `.partial({...})` on those keys before the strict()/refine(). `tags` is
 * still common-required-with-default.
 *
 * The two timestamp stamps (`readiness_verified_at`, `touchpoints_verified_at`)
 * are declared LAST so the canonical key order `entities migrate` derives from
 * `Object.keys(shape)` keeps them at the bottom of the frontmatter — the
 * 'stamp at bottom' convention that keeps the rebase-conflict fix in force
 * (see the JSON schema's own note).
 */

import { SESSION_MODES } from '@lib/services/session/mode-values'
import { contract, lenientBody, list, optional, section, table } from 'markdown-contract'
import { z } from 'zod'

import {
  CommonFrontmatter,
  DATE_PATTERN,
  entityIdPattern,
  ENTITY_WIKILINK_PATTERN,
  requiredWhen,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** The current task frontmatter/body schema version. */
export const SCHEMA_VERSION = '9'

/**
 * Canonical shape of the `issue:` field: a bare decimal GitHub issue number
 * as a string (e.g. `"1234"`) — never a `#`-prefix and never the full
 * `https://github.com/...` URL. This project's tasks link issues from
 * exactly one repo (the one `ctx.gh` is rooted at), so a repo-qualified
 * reference would carry information nothing reads; the bare number is what
 * `gh issue view <number>` and `Gh.issueView(number)`
 * ([[T-3YQO]], `@osdlc/typed-gh`) already take verbatim.
 */
export const ISSUE_REF_PATTERN = /^\d+$/

/**
 * The canonical task lifecycle state vocabulary — the single source of truth
 * for the four-major `stage` / `stage/reason` values. Exported so consumers
 * that report or reason over task state (e.g. `sdlc lease task sweep`)
 * reference this enum instead of re-declaring the strings.
 */
export const TASK_STATE = z.enum([
  'planning/draft',
  'planning/proposed',
  'planning/needs-definition',
  'planning/backlog',
  'open/ready',
  'in-progress',
  'in-progress/blocked',
  'closed/done',
  'closed/superseded',
  'closed/partially-superseded',
  'closed/obsoleted',
  'closed/relocated',
  'closed/no-repro',
  'closed/wontdo',
])

/**
 * The task triage vocabularies. Exported so a consumer that matches on them
 * (`routing:` rules, `ROUTING_VOCABULARY` in `lib/config/sections/index.ts`) validates against these sets
 * instead of re-declaring the strings.
 */
export const TASK_IMPACT = z.enum(['high', 'medium', 'low'])
export const TASK_COMPLEXITY = z.enum(['small', 'medium', 'large'])
export const TASK_AUTONOMY = z.enum(['human-only', 'supervised', 'autonomous/pr'])

/** ISO 8601 UTC datetime stamp shape. */
export const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]00:00)$/

export const TaskSchema = CommonFrontmatter.extend({
  type: z
    .literal('task')
    .optional()
    .describe(
      'Artifact type — used by the frontmatter validator to pick this schema. ' +
        'Optional today (the validator falls back to the schema named after the ' +
        'parent directory), but required once other artifact types coexist in the ' +
        'same tree.',
    ),
  id: z
    .string()
    .regex(entityIdPattern('T'))
    .describe(
      "Immutable identifier per [[D-0002-entity-identifier-shape]]: 'T-' + 4 " +
        'base-36 chars [0-9A-Z]. Matches the filename; never renamed once assigned.',
    ),
  state: TASK_STATE.default('planning/draft').describe(
    'Lifecycle stage. Four majors: planning/<stage> (spec still being shaped, ' +
      'not pickable), open/<stage> (available to pick up now), in-progress[/blocked] ' +
      '(someone has it), closed/<reason> (terminal). Under the GitHub Ref Leases ' +
      'protocol, this field is a workflow cache — the lease ref at ' +
      'refs/sdlc/tasks/<id> is the authoritative claim.',
  ),
  title: CommonFrontmatter.shape.title.optional(),
  created: CommonFrontmatter.shape.created.optional(),
  impact: TASK_IMPACT.default('medium').describe('Triage value of doing this work.'),
  priority: z
    .boolean()
    .optional()
    .describe(
      'Human-set ordering override. `true` sorts this task above all ' +
        '`priority: false`/absent tasks regardless of impact/complexity/created. ' +
        "Boolean by design — a sparse 'do this one first' override valve. Absent " +
        'means false.',
    ),
  complexity: TASK_COMPLEXITY.default('medium').describe(
    'Rough effort. small: <1 day, medium: 1-3 days, large: multi-day or ' + 'multi-PR.',
  ),
  autonomy: TASK_AUTONOMY.optional().describe(
    'Who may execute this task. `human-only`: an LLM agent should not pick this ' +
      'up. `supervised`: an LLM may attempt the work, but a human must review and ' +
      'approve before any state-changing action beyond opening a PR. ' +
      '`autonomous/pr`: an agent may best-effort self-ready and implement this ' +
      'task autonomously up to opening a PR; it never merges. Absent: unclassified ' +
      '(downstream pickup skills decide policy).',
  ),
  session: z
    .enum(SESSION_MODES)
    .optional()
    .describe(
      "How an orchestrated run starts this task's work chain (define, implement, check); PR " +
        'review and respond follow only the `--interactive` run flag. `interactive`: in a host ' +
        'pane you can watch and type into (the tick launches it and moves on). `headless`: detached. ' +
        'Absent: `workflows.<name>.session` decides, then `host.session`, then headless. ' +
        'Overridden by the `--interactive` run flag.',
    ),
  kind: z
    .enum(['implementation', 'planning', 'research'])
    .optional()
    .describe(
      "Which runner drives this task's execution ([[D-VSLI-distributed-work-runner-architecture]]). " +
        'Absent means `implementation`, so every pre-existing task stays dispatchable. ' +
        'LEAF-EXECUTION-ONLY: `kind` selects a runner for a leaf task and never gates ' +
        'containers — a task with children is a structural rollup, skipped by ' +
        'orchestration regardless of its kind. `planning` / `research` leaves stay ' +
        'human-driven until their runners exist.',
    ),
  scope: z
    .object({
      patterns: z
        .array(z.string().min(1))
        .min(1)
        .describe(
          "Paths, directories or globs, in this workspace's own syntax. Compared " +
            'between claims by the intersection port; never interpreted by the ' +
            'scheduler itself.',
        ),
      enforcement: z
        .enum(['advisory', 'mandatory'])
        .default('advisory')
        .describe(
          '`advisory`: an intersecting claim is filtered at dispatch, and a missed ' +
            'conflict costs a rebase rather than correctness. `mandatory`: the claim ' +
            "is held as a lease for the work order's lifetime (TTL, heartbeat, " +
            'steal-on-expired) and anything whose declared scope intersects it is ' +
            'blocked until release.',
        ),
      strict: z
        .boolean()
        .default(false)
        .describe(
          'Whether the claim also holds work orders that declare NO scope. ' +
            'Meaningful only under `mandatory`, ignored otherwise: the default hard ' +
            'lock is hard against declared scopes only, so unscoped work still passes ' +
            'and the merge gate stays the backstop. Setting it serialises everything ' +
            'on the region behind the holder.',
        ),
    })
    .strict()
    .optional()
    .describe(
      'The region of the workspace this task expects to write ' +
        "([[D-VSLI-distributed-work-runner-architecture]] §Scope claims). SDLC's " +
        'corpus projection of `foreman::work_order::ScopeClaim`, which is the ' +
        'domain-neutral definition. Absent means unscoped, which schedules exactly ' +
        'as it did before scope claims existed — adoption is additive. Not named ' +
        '`impact`: that word is taken.',
    ),
  scheduling: z
    .object({
      concurrency_class: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Opaque class name for concurrency accounting. Two work orders in the ' +
            'same class count against the same cap, when the project registered one.',
        ),
      not_before: z
        .string()
        .regex(DATETIME_PATTERN)
        .optional()
        .describe('Do not dispatch before this instant. ISO 8601 UTC.'),
      recurrence: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Cron-style recurrence hint for a repeating work order. A hint only: the ' +
            'authoritative trigger declaration belongs to the process registration, ' +
            'which is versioned code, never a corpus entity.',
        ),
    })
    .strict()
    .optional()
    .describe(
      'Soft inputs to scheduling policy, never guarantees — policy may ignore all ' +
        'of them ([[D-VSLI-distributed-work-runner-architecture]] §Scheduling). ' +
        "SDLC's corpus projection of `foreman::work_order::SchedulingHints`, minus " +
        'its `priority` (SDLC expresses relative urgency at the top level via ' +
        '`priority` and `impact`) and its retry budget (no SDLC reader or writer ' +
        'exists for one).',
    ),
  related: z
    .array(z.string().min(1))
    .default([])
    .describe(
      'Loose, non-directional cross-references — task IDs or filenames this task ' +
        "is tied to. For hard 'B cannot start until A closes' dependencies use " +
        '`depends_on` instead.',
    ),
  parent_key: z
    .string()
    .regex(ENTITY_WIKILINK_PATTERN)
    .optional()
    .describe(
      "Wikilink to this task's parent task. A task with one or more children IS " +
        'an epic — epic-ness is derived from parent_key, not a separate entity type. ' +
        'Optional; absent means top-level.',
    ),
  depends_on: z
    .array(z.string().regex(ENTITY_WIKILINK_PATTERN))
    .optional()
    .describe(
      'Hard, one-direction dependencies this task is blocked by. Each entry is a ' +
        'strict wikilink to a task. Semantic: the target must reach a closed/<reason> ' +
        'state before this task starts.',
    ),
  prs: z
    .array(z.string().url().min(1))
    .optional()
    .describe(
      "URLs of PRs opened during this task's lifecycle, in temporal order " +
        "(newest last). Written by /sdlc:task-work's PR-open step; verified/appended " +
        'by /sdlc:task-close-out. Primary use case is Obsidian static-viewer ' +
        'affordance.',
    ),
  issue: z
    .string()
    .trim()
    .min(1)
    .regex(ISSUE_REF_PATTERN, 'issue must be a bare decimal issue number, e.g. "1234"')
    .optional()
    .describe(
      'The linked GitHub issue this task was created for or is tracking ' +
        '([[D-0019-sdlc-chain-stages-and-labels]]), as a BARE DECIMAL ISSUE NUMBER ' +
        '(e.g. "1234" — never a "#" prefix, never the full URL). Set by ' +
        '`lib/services/issues/link.ts#ensureLinkedTask` when an issue enters the ' +
        "`define` chain stage. Once set, this task's `state` is authoritative over " +
        "the issue's `sdlc:stage/<x>` label — `sdlc issues sync` reports (never " +
        'silently fixes) a mismatch between the two.',
    ),
  relevance_note: z
    .string()
    .optional()
    .describe(
      'Short note (one line) on what shifted in the codebase since the task body ' +
        'was written. Cleared once the task is closed.',
    ),
  completion_note: z
    .string()
    .min(1)
    .optional()
    .describe('Multiline summary of what shipped. Required when state starts with ' + 'closed/.'),
  definition_gap: z
    .string()
    .optional()
    .describe(
      "If the task spec is incomplete, what's missing. Set by /sdlc:task-review " +
        'or /sdlc:task-ensure-ready when verification fails; resolved by editing the ' +
        'body.',
    ),
  resolution: z
    .enum(['fixed', 'wontfix', 'superseded', 'obsoleted'])
    .optional()
    .describe('Legacy: outcome of a bare-closed task.'),
  resolution_date: z
    .string()
    .regex(DATE_PATTERN)
    .optional()
    .describe('Legacy: ISO date the bare-closed task was resolved.'),
  resolution_commit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .optional()
    .describe('Legacy: git short-hash of the commit that resolved the task.'),
  readiness_verified_at: z
    .string()
    .regex(DATETIME_PATTERN)
    .optional()
    .describe(
      'ISO 8601 UTC datetime when this task last passed the implementation-ready ' +
        'contract. Written exclusively by /sdlc:task-ensure-ready on pass; cleared ' +
        'on fail and by close-out steps. Declared near the bottom so the canonical ' +
        'key order places the stamp at the bottom of the frontmatter.',
    ),
  touchpoints_verified_at: z
    .string()
    .regex(DATETIME_PATTERN)
    .optional()
    .describe(
      "ISO 8601 UTC datetime when this task's touchpoint tables last resolved " +
        'cleanly against the codebase. Single stamp at the frontmatter level. ' +
        'Declared last so the canonical key order places it at the bottom of the ' +
        'frontmatter.',
    ),
})
  .strict()
  .superRefine((fm, ctx) => {
    // allOf if/then: canonical closed shape requires a completion_note.
    requiredWhen(
      ctx,
      typeof fm.state === 'string' &&
        fm.state.startsWith('closed/') &&
        fm.completion_note === undefined,
      'completion_note',
    )
  })

export type Task = z.infer<typeof TaskSchema>

/** One row of {@link TASK_BODY} — the definition of a single Task body section. */
export interface TaskBodySection {
  /**
   * Stable machine key, independent of how the heading is spelled. What an op
   * that addresses a section programmatically keys on — `parse-touchpoints`
   * names its `areas` output field from this.
   */
  key: string
  /** Accepted H2 spellings. `names[0]` is the canonical one. */
  names: [string, ...string[]]
  birth: 'required' | 'optional'
  /**
   * Whether the section must be PRESENT for a task to be implementation-ready.
   *
   * Deliberately loose between C1 and E4: the universal contract can only be as
   * strict as the loosest kind it must fit, so `Approach` and `Areas`
   * relaxed to `optional` when work orders became minimal
   * ([[D-VSLI-distributed-work-runner-architecture]]). Their definitions —
   * aliases, typed content — survive intact, to be re-tightened per kind by the
   * process registry, where a contract binds one kind and can be as strict as
   * that kind actually needs.
   */
  ready: 'required' | 'optional'
  /**
   * Whether the section carries specification an implementer acts on, so an
   * unresolved placeholder in it means the spec is unfinished — the surface
   * `sdlc task scan-placeholders` walks. `Dependencies` and `Discovery context`
   * are narrative rather than spec (the canonical dependency list is
   * `depends_on:`; provenance is not something to execute), so neither is
   * scanned.
   */
  specBearing: boolean
  /** READY-only typed content leaf (a `table(...)` / `list(...)`); birth ignores it. */
  content?: () => ReturnType<typeof table>
}

/**
 * Single source of truth for the Task body grammar across lifecycle states.
 * Each row is one section: its stable `key`, its accepted spellings (`names`),
 * whether it is required at BIRTH (just-scaffolded) vs READY
 * (implementation-ready, at pickup), whether it is spec-bearing, and the typed
 * content leaf the READY contract enforces on it (birth checks presence only).
 *
 * The two contracts below are projections of this table, and so is every op
 * that keys off a task's H2 headings — `gap-report` (required-section
 * presence), `scan-placeholders` (spec-bearing sections) and
 * `parse-touchpoints` (the `## Areas` table) each build their lookup with
 * {@link taskSectionLookup} rather than re-spelling the names.
 *
 * The deliberate non-consumers are `migrations/v2-to-v3.ts` and
 * `migrations/v6-to-v7.ts`: a migration encodes the shape of a PAST schema
 * version (respectively the pre-v3 bulleted Today/Files-to-touch shape and the
 * v3-v6 `## Files to touch` table this section replaced), so each keeps its
 * own spellings and must not track this table forward.
 */
export const TASK_BODY: ReadonlyArray<TaskBodySection> = [
  {
    key: 'goal',
    names: ['Goal', 'Goal / problem statement'],
    birth: 'required',
    ready: 'required',
    specBearing: true,
  },
  {
    key: 'today',
    names: ['Today', 'Current state', 'Today / current state'],
    birth: 'optional',
    ready: 'optional',
    specBearing: false,
    // Fully free-form prose: no typed content leaf. Today is narrative
    // context for the implementer, never a machine-resolved inventory — v7
    // dropped the `| Location | Role today |` table requirement and the
    // path-existence check that came with it ([[D-VSLI-distributed-work-runner-architecture]]
    // relax-task pass). `parse-touchpoints` no longer parses this section at
    // all; `resolve-touchpoints` was retired. `specBearing: false` (never
    // scanned for placeholders either) since it's advisory, never a
    // readiness gate — see `implementation-ready.md`'s Today entry.
  },
  {
    key: 'proposed',
    names: ['Proposed'],
    birth: 'optional',
    ready: 'optional',
    specBearing: true,
  },
  {
    key: 'approach',
    names: ['Approach', 'Plan'],
    birth: 'optional',
    ready: 'optional',
    specBearing: true,
  },
  {
    key: 'areas',
    names: ['Areas'],
    birth: 'optional',
    ready: 'optional',
    specBearing: false,
    // Advisory, not a resolution gate: a present `Area` cell never has to
    // resolve to an existing path (v7 renamed and relaxed the old
    // `## Files to touch` — Location/Kind/Change with a filesystem-existence
    // disqualifier and a mandatory delete-reference-enumeration rule). The
    // typed leaf still pins the two-column shape *when the section is
    // written as a table* so schema and doc agree, but gap-report never
    // turns a shape or existence mismatch here into a readiness gap — see
    // `implementation-ready.md`'s `## Areas` entry. `specBearing: false`
    // for the same reason: an empty cell or leftover template placeholder
    // in Areas is never a placeholder gap either — Areas is advisory only.
    content: () => table({ columns: ['Area', 'Note'] }),
  },
  {
    key: 'acceptance_criteria',
    names: ['Acceptance criteria'],
    birth: 'required',
    ready: 'required',
    specBearing: true,
    content: () => list({ everyItem: 'checkbox', minItems: 1 }),
  },
  {
    key: 'out_of_scope',
    names: ['Out of scope'],
    birth: 'required',
    ready: 'required',
    specBearing: true,
  },
  {
    key: 'dependencies',
    names: ['Dependencies'],
    birth: 'optional',
    ready: 'optional',
    specBearing: false,
  },
  {
    key: 'discovery_context',
    names: ['Discovery context'],
    birth: 'optional',
    ready: 'optional',
    specBearing: false,
  },
]

/**
 * Index a subset of {@link TASK_BODY} by its accepted spellings, lower-cased.
 *
 * The one place heading text is turned into a section: every consumer that
 * walks a task's H2 headings looks the heading up here instead of carrying its
 * own alias table. `value` picks what the caller wants keyed — the canonical
 * name, the machine key, the whole row.
 */
export function taskSectionLookup<T>(
  rows: readonly TaskBodySection[],
  value: (s: TaskBodySection) => T,
): Map<string, T> {
  const index = new Map<string, T>()
  for (const s of rows) {
    for (const name of s.names) index.set(name.trim().toLowerCase(), value(s))
  }
  return index
}

/** The sections required at one lifecycle state, in {@link TASK_BODY} order. */
export function requiredTaskSections(mode: 'birth' | 'ready'): TaskBodySection[] {
  return TASK_BODY.filter((s) => s[mode] === 'required')
}

/** The sections {@link TaskBodySection.specBearing} marks, in table order. */
export function specBearingTaskSections(): TaskBodySection[] {
  return TASK_BODY.filter((s) => s.specBearing)
}

/** The rows a caller addresses by machine {@link TaskBodySection.key}, in table order. */
export function taskSectionsByKey(...keys: string[]): TaskBodySection[] {
  return TASK_BODY.filter((s) => keys.includes(s.key))
}

/** Project {@link TASK_BODY} into the section specs for one lifecycle state. */
function taskBody(mode: 'birth' | 'ready'): ReturnType<typeof section>[] {
  return TASK_BODY.map((s) => {
    const spec = section(
      s.names,
      mode === 'ready' && s.content ? { content: s.content() } : undefined,
    )
    return s[mode] === 'optional' ? optional(spec) : spec
  })
}

/**
 * The Task BIRTH contract — the live `TaskSchema` frontmatter plane plus the
 * birth-floor H2 grammar (presence of the required sections; no typed content).
 * The typed shapes are the implementation-ready contract's job (below), enforced
 * at pickup by `/sdlc:task-ensure-ready`. `order: "none"` mirrors the manifest's
 * lenient ordering; `allowUnknown` keeps domain sections legal. This is the
 * contract registered in `_contracts.ts` (the `entities validate`/`audit` surface).
 */
export const TaskContract = contract({
  frontmatter: TaskSchema,
  rules: [titleMirrorsH1],
  body: lenientBody(taskBody('birth')),
})

/**
 * The Task implementation-ready contract — the strict, TYPED-content sibling of
 * the birth-floor `TaskContract`. It is the machine encoding of
 * `solutions/ontological/lib/model/entities/task/implementation-ready.md`: the same `TaskSchema`
 * frontmatter plane, but the body grammar declares the typed content leaves a
 * task must satisfy to be picked up by `/sdlc:task-ensure-ready`:
 *
 *   - `## Today` — free-form prose (the relevant area today). No typed content
 *     leaf: v7 dropped the old `| Location | Role today |` table requirement,
 *     so a present Today never trips a structure/content finding here — any
 *     shape is accepted.
 *   - `## Areas` — a `| Area | Note |` table when written as a table (the
 *     packages/directories/modules this task expects to touch). A missing
 *     declared column on a present table trips `content/table/column-missing`
 *     as a fact, but this is advisory: `gap-report` deliberately does NOT fold
 *     an Areas-section content finding (nor a `structure/block-kind` on a
 *     prose/bulleted Areas) into a readiness gap — see
 *     `implementation-ready.md`'s `## Areas` entry.
 *   - `## Acceptance criteria` — a `- [ ] AC-N:` checklist: every item a checkbox
 *     (`content/list/item-kind` otherwise), ≥1 item (`content/list/min-items`).
 *   - `## Goal`, `## Acceptance criteria`, `## Out of scope` — required presence.
 *     Everything else is optional presence with its typing intact.
 *
 * Header aliases mirror the accepted spellings from the contract doc
 * (`Today / current state`, `Plan`, `Goal / problem statement`).
 *
 * The required floor is deliberately the universal one — what holds for EVERY
 * task kind, which is necessarily the loosest of them. Depth is the routed
 * process's business: per-kind contracts re-tighten this table's rows once the
 * process registry exists to own them
 * ([[D-VSLI-distributed-work-runner-architecture]]).
 *
 * DELIBERATELY NOT registered in `_contracts.ts`: that registry is the birth-floor
 * surface `entities validate` / `audit` route through (draft tasks with prose
 * bodies must validate clean there). This stricter contract is task-INTERNAL,
 * consumed by the readiness ops (`gap-report` and friends) to surface the typed
 * content violations the birth-floor deliberately tolerates.
 *
 * `order: "none"` + `allowUnknown: true` mirror the birth-floor's lenient
 * ordering and keep domain sections legal — only the typed CONTENT of the
 * declared sections is enforced, not their order or the absence of extras.
 */
export const TaskReadyContract = contract({
  frontmatter: TaskSchema,
  body: lenientBody(taskBody('ready')),
})
