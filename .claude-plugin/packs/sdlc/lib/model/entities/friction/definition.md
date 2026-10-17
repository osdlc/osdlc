---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Friction

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Friction is a recorded, deduplicated observation that the process cost
time or failed, with a path to becoming a task. It has two sources:
`reported` (an agent or person, from a task's `## Post-mortem`) and
`detected` (a deterministic read of the journal and activity logs by
`sdlc friction detect`, see [[D-J7RN-agent-logging]]).

A Friction is *not*:

- A Task. A task is the work; a friction is the evidence that work is
  needed. `friction promote` is the one join.
- A Backlog item. A backlog item is a human idea; a friction carries a
  fingerprint, counts and a lifecycle, and recurs.
- A log. The agent log is gitignored by default and a Friction is
  committed, so it holds counts, ids, fingerprints and fixed labels
  (op, tool, workflow and step names, error classes). Never prompt,
  message, argument or output text.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `FR-NNNN[-slug].md` — 4 base-36 chars, slug derived from the title |
| Wikilink | `[[FR-NNNN-slug]]` |
| `id` frontmatter | `FR-NNNN`; immutable |
| Numbering | base-36, collision-checked ([[D-0002-entity-identifier-shape]]) |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `friction` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` |  |
| `id` | required | `FR-NNNN` |  | Immutable; matches filename prefix |
| `title` | required | string |  | Mirrors the body H1; a fixed-label headline |
| `state` | required | enum (see Lifecycle) | `open/detected` |  |
| `source` | required | `detected` or `reported` |  | Who surfaced it |
| `signal` | conditional | enum (see Signals) |  | Required when `source` is `detected`; absent when `reported` |
| `fingerprint` | conditional | `signal\|segment\|...` |  | The dedupe key; required when `detected`. Segments are fixed labels in a restricted charset |
| `scope` | optional | `local`, `upstream`, `external` | `local` | Where the fix belongs, the post-mortem classification |
| `occurrences` | optional | numeric string, 1 or more | `"1"` | Event count; a rescan keeps the larger count |
| `runs` | optional | numeric string, 0 or more | `"0"` | Distinct runs the events came from |
| `first_seen`, `last_seen` | conditional | RFC 3339 instant |  | Required when `detected` |
| `subjects` | optional | list of entity wikilinks | `[]` | Tasks the evidence touched |
| `result` | conditional | wikilink or note |  | Required for `closed/promoted` (a task or backlog wikilink) and `closed/resolved` (a note); absent otherwise |
| `created` | required | ISO date |  |  |
| `last_reviewed` | optional | ISO date |  |  |
| `related` | optional | list of wikilinks | `[]` | Cross-references; never `depends_on` |
| `tags` | optional | list of strings | `[]` | Free-form labels |
| `need_human_review` | optional | bool | `false` |  |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand |

## Body shape

| Section | Required? | Aliases | Notes |
|---|---|---|---|
| Observation | required | | One or two sentences: what cost time or failed and how often |
| Evidence | required | | A table of counts by session and op or tool. Ids and counts only; no log content |
| Proposal | optional | | What to change so it stops recurring |

`order: lenient`, `allow_unknown: true`. Authoritative spec is the
`contract(...)` in `schema.ts`.

## Signals

`sdlc friction detect` runs ten detectors. Each is a pure function over
journal, activity and lifecycle events; thresholds are constants.

| Signal | Fires when |
|---|---|
| `tool-failure-repeat` | the same tool and target fails 3 or more times in one session |
| `permission-wait` | 3 or more permission waits in a session, or one wait over 10 minutes |
| `compaction` | 2 or more compactions in a session |
| `stall` | over 15 minutes between consecutive activity events while the session is `running` |
| `op-error` | the same `op` and error code ends non-zero in 2 or more runs |
| `op-retry` | the same `op` and flag shape starts 3 or more times in one run and the earlier ones failed |
| `dispatch-fallback` | a dispatch routes `resume` or `fresh` after `live` for the same PR |
| `model-switch` | a session changes model mid-run |
| `session-lost` | a session's outcome is `lost` (reconcile found no end) |
| `step-failure` | the same workflow step ends non-ok in 2 or more runs |

A candidate becomes an entity at 2 or more occurrences across 2 or more
runs, or on first sight for `session-lost` and `stall`. An entity with the
fingerprint is updated, never duplicated; a `closed/*` one that recurs is
reopened to `open/detected`.

## Lifecycle

| State | Meaning |
|---|---|
| `open/detected` | Surfaced, not yet triaged. The default |
| `open/accepted` | Triaged as worth acting on |
| `closed/promoted` | Became a task or backlog item; `result` names it |
| `closed/dismissed` | Not worth acting on |
| `closed/resolved` | Fixed without a task; `result` says how |

## Relationships

A friction is evidence; a task is the work; a backlog item is an idea.
`promote` is the only join. `subjects` points at the tasks the evidence
touched; a friction never carries `depends_on`.

## Operations

| Name | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| create | cli | `sdlc friction create [<slug>] --title <t> [--source reported] [--scope local]` | `solutions/ontological/lib/model/entities/friction/noun.ts` | Author a friction with minted `FR-NNNN` identity; state defaults `open/detected`; source defaults `reported` |
| preview-id | cli | `sdlc friction preview-id <title>` | `solutions/ontological/lib/model/entities/friction/noun.ts` | Read-only: report the slug + id `create` would assign |
| list | cli | `sdlc friction list [--filter state=open/detected] [--filter signal=stall]` | `solutions/ontological/lib/model/entities/friction/noun.ts` | List frictions, filtered, sorted and paged |
| update | cli | `sdlc friction update <friction> --set <json>` | `solutions/ontological/lib/model/entities/friction/noun.ts` | Schema-validated frontmatter update |
| detect | cli | `sdlc friction detect [--since] [--run] [--session] [--apply]` | `solutions/ontological/lib/services/friction/ops/detect.ts` | Print candidates from the logs; `--apply` creates or updates entities. Dry-run by default |
| promote | cli | `sdlc friction promote <friction> --to task\|backlog` | `solutions/ontological/lib/services/friction/ops/promote.ts` | Create the task or backlog item through its create op; set `closed/promoted` and `result`; commit nothing |
| validate | cli | `sdlc entities validate <path>` | `solutions/ontological/lib/model/ops/validate.ts` | Frontmatter + body check (generic cross-entity op) |

## Workflow invariants

- A detected Friction MUST carry `signal`, `fingerprint`, `first_seen`
  and `last_seen`; a reported one MUST NOT carry `signal`.
- `closed/promoted` and `closed/resolved` MUST carry `result`; every
  other state MUST NOT.
- A Friction file holds counts, ids, fingerprints and fixed labels only.
  No log content, no machine-local pointer.
- A detected Friction has one entity per fingerprint.
- A closed Friction keeps its file and id.

## Position in the entity model

Lives in the **Work layer** ([[D-ORMG-data-model]]), beside Backlog and
Task: it is the evidence that feeds them.

## Summary

- A recorded, deduplicated observation that the process cost time or
  failed, detected from the agent log or reported from a post-mortem. ^summary
- Identifier: `FR-NNNN-<slug>.md`, base-36 ids.
- State enum:
  `open/detected | open/accepted | closed/promoted | closed/dismissed | closed/resolved`.
- Holds counts, ids, fingerprints and fixed labels, never log content.
- Promoted to a task or backlog item by `sdlc friction promote`.
