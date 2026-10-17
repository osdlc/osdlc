---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Task

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Task is the atomic unit of executable work: one problem, one
implementer, typically one PR. Tasks are what orchestration dispatches
and what the lease protocol claims. A Task with children (via
`parent_key:`) *is* an epic — an organizational rollup that
orchestration skips; epic-ness is derived, not a separate type
([[D-ORMG-data-model]]).

A Task is *not*:

- A Milestone. A Milestone is a release narrative with a target date
  and success criteria; Tasks are its members.
- A Backlog item. A Backlog item is a pre-triage idea; it becomes a
  Task at promotion, when it earns a spec.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `T-NNNN[-slug].md` — 4 base-36 chars, optional immutable slug |
| Wikilink | `[[T-NNNN-slug]]`, e.g. `[[T-87GH-new-scripts-derive-schema-bound-values]]` |
| `id` frontmatter | `T-NNNN`; immutable; matches the filename |
| Numbering | base-36, minted deterministically from a seed and collision-checked ([[D-0002-entity-identifier-shape]]) |

## Frontmatter

`TaskContract` in `task/schema.ts` is the authoritative contract
(validated via `sdlc entities validate`) — field semantics live in the
schema's property descriptions. The roster:

| Field | Required? | Notes |
|---|---|---|
| `id` | required | Immutable `T-NNNN` |
| `state` | required | See Lifecycle; workflow cache under the lease protocol |
| `type`, `schema_version` | recommended | Dispatch tag; schema generation stamp |
| `created`, `last_reviewed` | optional | ISO dates |
| `created_at` | optional | ISO 8601 datetime the task was authored, finer than `created` |
| `provenance` | optional | What authored it when not by hand: a skill, tool, or import source |
| `impact`, `complexity` | optional | Triage enums |
| `priority` | optional | Sparse boolean override valve for ordering |
| `autonomy` | optional | `human-only` / `supervised` / `autonomous/pr` execution gate |
| `session` | optional | `interactive` / `headless` — how an orchestrated run starts this task's work chain (define, implement, check); PR review and respond follow only `--interactive`; absent defers to the workflow's `headless` setting |
| `kind` | optional | `implementation` (absent) / `planning` / `research` runner selector; leaf-execution-only, never gates a rollup |
| `scope` | optional | Declared write region: a pattern set plus its enforcement tier (advisory filtering, or a mandatory hard lock). Absent means unscoped, which schedules as before |
| `scheduling` | optional | Soft scheduling hints — concurrency class, not-before instant, recurrence. Policy may ignore all of them |
| `tags`, `related` | optional | Labels; loose cross-references |
| `parent_key`, `depends_on` | optional | Self-nesting (epic-ness); hard dependency edges |
| `prs`, `issue`, `completion_note`, `relevance_note`, `definition_gap` | optional | Lifecycle bookkeeping; `completion_note` required once `closed/*`. `issue` is the linked GitHub issue's bare decimal number (e.g. `"1234"`), set by `sdlc issues`' `define`-stage dispatch ([[D-0019-sdlc-chain-stages-and-labels]]) |
| `readiness_verified_at`, `touchpoints_verified_at` | optional | Gate stamps, written only by their owning skills; pinned to the bottom of the frontmatter |

## Body shape

| Section | Required? | Notes |
|---|---|---|
| Goal | required | Why the task exists |
| Today | optional | Free-form prose describing current state (no typed shape, v7) |
| Proposed | optional | Target state |
| Approach | optional | Ordered steps |
| Areas | optional | Advisory `\| Area \| Note \|` table of packages/directories/modules touched (v7; not a resolution gate) |
| Acceptance criteria | required | Externally observable checklist |
| Out of scope | required | Deliberate exclusions; `- none` when empty |
| Dependencies | optional | Narrative; canonical list is `depends_on:` |
| Discovery context | optional | Provenance |

`order: lenient`, `allow_unknown: true` (tasks grow domain sections).
Authoritative spec is the `contract(...)` in `schema.ts`. The deeper pickup-time shape
(populated touchpoint tables, verifiable ACs) is the
implementation-ready contract at
`solutions/ontological/lib/model/entities/task/implementation-ready.md` — a gate, not
a body-contract concern.

## Lifecycle

Four majors: `planning/*` (spec forming, not pickable), `open/*`
(pickable now), `in-progress[/blocked]` (claimed), `closed/*`
(terminal).

| State | Meaning |
|---|---|
| `planning/draft` | Being authored |
| `planning/proposed` | Authored, awaiting triage |
| `planning/needs-definition` | Failed the readiness gate; `definition_gap` says why |
| `planning/backlog` | Triaged, parked |
| `open/ready` | Pickable now |
| `in-progress` | Claimed (lease ref is authoritative; this field is the cache) |
| `in-progress/blocked` | Claimed but stuck |
| `closed/done` | Shipped; requires `completion_note` |
| `closed/superseded`, `closed/partially-superseded`, `closed/obsoleted`, `closed/relocated`, `closed/no-repro`, `closed/wontdo` | Terminal without (full) shipping; all `closed/*` require `completion_note` |

## Relationships

- **Task → Task** (`parent_key:`): child points up; a parent with
  children is an epic-rollup. Orchestration dispatches leaves.
- **Task → Task** (`depends_on:`): hard one-direction edges; the
  target must reach `closed/*` before this task starts. The audit
  walks the graph for cycles.
- **Task → Milestone / Decision / Standard** (`related:`): loose
  cross-references.
- **Task ← Backlog** (the backlog's result field): promotion
  provenance.

## Operations

| Name | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| create | runner | `task create [<slug>] [...]` | `solutions/ontological/lib/model/entities/task/noun.ts` | Author a task with minted identity (the relocated `new_task.ts` core); gates the slug against the canonical `SLUG_RE`; slug optional — derived from `--headline` via the shared `deriveSlug` when omitted |
| preview-id | cli | `sdlc task preview-id <title>` | `solutions/ontological/lib/model/entities/task/noun.ts` | Read-only: report the slug + `T-NNNN` id `create` would assign for a title, plus exact/similar same-type slug collisions (writes nothing) |
| resolve | cli | `sdlc task resolve <arg>` | `solutions/ontological/lib/model/entities/task/ops/resolve.ts` | Resolve an arg (absolute path / filename / slug) to its task file; the deterministic substrate home of `file-resolution.md` (`NO TASK FOUND` / `AMBIGUOUS` markers) |
| gap-report | runner | `task gap-report <task>` | `solutions/ontological/lib/model/entities/task/ops/gap-report.ts` | Deterministic readiness-gap composite — required-section presence + `scan-placeholders` + `parse-touchpoints` (`## Areas` shape, informational only, v7) + `check-claims`, emitted as one structured report; no LLM (interpretation stays in `/sdlc:task-ensure-ready`) |
| new | skill | `/sdlc:task-new` | `solutions/ontological/plugin/plugins/sdlc/skills/task-new/` | LLM head over `create`; scaffolder shim forwards to the op |
| next | cli | `sdlc task next` | `solutions/ontological/lib/model/entities/task/ops/next.ts` | Dispatchable pickup roster: priority-ordered + dependency-lift, dependency-blocked tasks filtered out by default (`--include-blocked` keeps them) |
| update | cli | `sdlc task update <task> --set <json>` | `solutions/ontological/lib/model/entities/task/noun.ts` | Apply JSON frontmatter updates, schema-validated (entity-agnostic engine in `model/ops/_update.ts`) |
| define | skill | `/sdlc:task-define <task>` | `solutions/ontological/plugin/plugins/sdlc/skills/task-define/` | Interactively drive toward implementation-ready |
| auto-define | skill | `/sdlc:task-auto-define <task>` | `solutions/ontological/plugin/plugins/sdlc/skills/task-auto-define/` | Non-interactive best-effort definition |
| ensure-ready | skill | `/sdlc:task-ensure-ready <task>` | `solutions/ontological/plugin/plugins/sdlc/skills/task-ensure-ready/` | Verify the implementation-ready contract; stamp on pass |
| work | skill | `/sdlc:task-work <task>` | `solutions/ontological/plugin/plugins/sdlc/skills/task-work/` | Lease → worktree → implement → PR |
| review | skill | `/sdlc:task-review` | `solutions/ontological/plugin/plugins/sdlc/skills/task-review/` | Batch triage of unfinished tasks |
| close-out | skill | `/sdlc:task-close-out <task>` | `solutions/ontological/plugin/plugins/sdlc/skills/task-close-out/` | Close after merge; teardown worktree/branch |
| probe-state | cli | `sdlc task probe-state <basename>` | `solutions/ontological/lib/model/entities/task/ops/probe-state.ts` | Report single-task pre-flight signals (worktree/branch/PR/state + resume detector) for `/sdlc:task-work`; read-only, never self-aborts |

The `create` op is the relocated deterministic core (T-0010); its
Surface is `runner` because the op module exists and is registered but
is not yet a CLI subcommand. It gains Surface `cli` as the generated
adapter (T-0014) lands. Generic cross-entity ops (`audit`, `validate`,
`migrate`, `check-identifiers`) live under
`solutions/ontological/lib/model/ops/` and are not per-type rows.

## Workflow invariants

- The lease ref is the authoritative claim; `state:` is a cache.
  Reconcile flags `in-progress` without a matching lease.
- `readiness_verified_at` is written only by `/sdlc:task-ensure-ready`
  on pass, cleared on fail and at close-out.
- Every `closed/*` state carries a `completion_note` (schema-enforced).
- Task-state frontmatter flips commit on main, never on the task's
  worktree branch.
- A `depends_on` target must be `closed/*` before this task starts.

## Position in the entity model

**Work layer** of the five-layer model ([[D-ORMG-data-model]]) — how
and when work gets done. Task is the layer's atomic unit; Milestone
groups tasks into a release narrative; Backlog feeds tasks in at the
front.

## Summary

- Atomic unit of executable work — one problem, one implementer,
  typically one PR; a Task with children is an epic-rollup. ^summary
- Identifier: `T-NNNN[-slug].md`, base-36, immutable.
- State: four majors (`planning/*`, `open/*`, `in-progress[/blocked]`,
  `closed/*`); lease ref authoritative while claimed.
- Body: Goal + Acceptance criteria + Out of scope required; the
  implementation-ready contract governs pickup-time completeness.
- Distinct from Milestone (release narrative) and Backlog (pre-triage
  idea).
