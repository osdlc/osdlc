---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Standard

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Standard prescribes a rule that applies to a scoped set of paths
and explains its application. Standards are the **enforceable** layer
of project governance: where a Principle states a value and a
Decision records a choice, a Standard says *what to do (or not do)
here* — and, where possible, a deterministic validator checks it.

A Standard is *not*:

- A Principle. A Principle is a broad value; a Standard is a scoped,
  often checkable rule. Standards typically operationalize Principles.
- A Decision. A Decision records *why this and not that*; a Standard
  is one possible *output* of a Decision.
- A Convention. A Convention is informal; a Standard is normative
  and reviewable.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `S<NNNN>-<slug>.md` |
| Wikilink | `[[S<NNNN>-<slug>]]`, e.g. `[[S-0005-entity-definition-contract]]` |
| `id` frontmatter | `S<NNNN>` (sequential, zero-padded; immutable) |
| Migration | Existing standards at `docs/planning/standards/S<NNNN>-<slug>.md` already match the shape; no rename needed |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `standard` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` |  |
| `id` | required | `S<NNNN>` |  | Immutable; matches filename prefix |
| `title` | required | string |  | Human-readable headline |
| `state` | required | enum (see Lifecycle) | `open/proposed` |  |
| `created` | required | ISO date |  |  |
| `last_reviewed` | optional | ISO date |  | When the standard was last sanity-checked |
| `applies_to.paths` | required | list of glob patterns |  | Where the rule binds. Authoritative scope |
| `supersedes` | optional | wikilink to a Standard |  | Legacy — no longer written; supersession deletes the predecessor and the deletion commit records the succession |
| `superseded_by` | conditional | wikilink to a Standard |  | Required when `state: closed/superseded` (legacy tombstones only — new supersessions delete the predecessor) |
| `enforcement` | optional | enum `advise` \| `block` |  | How hard `verify changes` enforces the standard: `advise` never blocks, `block` blocks at this standard's own floor. Absent: the project-wide `verify.blocking` and `verify.severity_floor` apply |
| `severity_floor` | conditional | enum `violation` \| `tension` \| `drift` |  | Lowest finding severity that blocks; only with `enforcement: block`. Absent: the project's `verify.severity_floor` |
| `related` | optional | list of wikilinks | `[]` | Other standards, decisions, principles, milestones |
| `tags` | optional | list of strings | `[]` | Free-form labels |
| `deprecation_note` | conditional | string |  | Required when `state: closed/deprecated` |
| `need_human_review` | optional | bool | `false` |  |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand: a skill, tool, or import source |

## Body shape

| Section | Required? | Aliases | Notes |
|---|---|---|---|
| Summary | required | | First section: 1–3 tight bullets; first bullet carries `^summary` for index transclusion |
| Rule | required | Standard, Statement | The rule itself. Exactly one form must appear |
| Why | required | Rationale | Why the rule exists; failure mode it prevents |
| How to apply | required | Application, How this applies | Concrete guidance for authors / reviewers / validators |
| Anti-examples | optional | Counter-examples, Violations | Cases that violate the rule, and why |
| Scope | optional | | Narrative scope; authoritative scope is `applies_to.paths` |
| Notes | optional | | Caveats, references |
| References | optional | | Inbound and outbound links |

`order: lenient` (sections may appear in any order). `allow_unknown:
true` (authors may add structural sections — e.g., S-0005's
"Companion doc shape" / "Body manifest shape" — when the rule's
shape needs them). Authoritative spec is the `contract(...)` in `schema.ts`.

## Lifecycle

| State | Meaning | Required fields |
|---|---|---|
| `open/draft` | Actively being authored; not yet in review |  |
| `open/proposed` | Authored; under review. Not yet binding |  |
| `open/active` | Reviewed and adopted. Validators (where they exist) gate on it |  |
| `closed/superseded` | Legacy tombstone — no longer minted; a fully superseded Standard is deleted instead | `superseded_by` |
| `closed/deprecated` | The rule no longer applies; not replaced by a successor | `deprecation_note` |

Transitions:

- `open/proposed → open/active` when the standard is endorsed.
- `open/active → deleted` when a new Standard lands that fully replaces it:
  the predecessor file is deleted in the same change, inbound wikilinks
  re-pointed at the successor, the deletion commit naming it. Git history is
  the archive — no tombstone, no lineage frontmatter. A Standard only
  partially absorbed is amended in place and stays `open/active`.
- `open/active → closed/deprecated` when the rule stops applying for reasons
  other than replacement.
- Reversing a supersession or re-opening a `closed/deprecated` Standard creates
  a NEW Standard (recover prose from git history); terminal states stay
  terminal.

## Relationships

- **Standard → Principle**: a Standard typically operationalizes a
  Principle (`related:` cites the Principle).
- **Standard → Decision**: a Standard often emerges from a Decision
  (`related:` cites the Decision).
- **Standard ↔ Standard** (M:N, via `related:`, `supersedes:`,
  `superseded_by:`).
- **Standard → Validator**: a Standard MAY name a validator that
  checks it; the validator lives under the substrate (`solutions/ontological/lib/`
  today, top-level `lib/` end-state).

## Operations

| Name | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| create | runner | `standard create [<slug>] [...]` | `solutions/ontological/lib/model/entities/standard/noun.ts` | Scaffold a new instance; state starts `open/proposed` (the relocated `new_standard.ts` core); slug optional — derived from `--title` via the shared `deriveSlug` when omitted |
| preview-id | cli | `sdlc standard preview-id <title>` | `solutions/ontological/lib/model/entities/standard/noun.ts` | Read-only: report the slug + `S-NNNN` id `create` would assign for a title, plus exact/similar same-type slug collisions (writes nothing) |
| new | skill | `/sdlc:standard-new` | `solutions/ontological/plugin/plugins/sdlc/skills/standard-new/` | LLM head over `create`; scaffolder shim forwards to the op |
| update | cli | `sdlc standard update <standard> --set <json>` | `solutions/ontological/lib/model/entities/standard/noun.ts` | Apply JSON frontmatter updates, schema-validated (entity-agnostic engine in `model/ops/_update.ts`) |
| supersede | cli | `sdlc standard supersede <standard> --by <id>` | `solutions/ontological/lib/model/entities/standard/ops/supersede.ts` | Delete the predecessor; the deletion commit names the successor; no-ops on a missing predecessor. (Implementation still tombstones; slated to match this contract) |
| activate | cli | `sdlc standard update <standard> --set '{"state":"open/active"}'` | `solutions/ontological/lib/model/entities/standard/noun.ts` | Transition `open/proposed → open/active` (via `update`) |
| deprecate | cli | `sdlc standard update <standard> --set '{"state":"closed/deprecated","deprecation_note":"…"}'` | `solutions/ontological/lib/model/entities/standard/noun.ts` | Set to `closed/deprecated` with `deprecation_note:` (via `update`) |
| validate | cli | `sdlc entities validate <path>` | `solutions/ontological/lib/model/ops/validate.ts` | Frontmatter + body manifest check (generic cross-entity op) |
| review | skill | `/sdlc:standard-review [--propose]` | `solutions/ontological/plugin/plugins/sdlc/skills/standard-review/` | Check bound files against each Rule, standards against each other and their principles, and prose against the descriptive-yet-succinct rubric; renders the `standard-review` report kind (`reports/review/`); `--propose` opens a PR of text edits |

The `create` deterministic core is the relocated `standard create` op
(`solutions/ontological/lib/model/entities/standard/noun.ts`, Surface `runner`
— registered but not yet a CLI subcommand; T-0010, the born-in-lib
directive's poster child); `skills/standard-new/new_standard.ts` and
`/sdlc:standard-new` are the shim and LLM head over it. `update` and
`supersede` share the entity-agnostic frontmatter-set engine in
`model/ops/_update.ts` (D-0007 §2a, Cluster 6); the lifecycle
transitions (`activate`, `deprecate`) are `update --set` shapes rather
than distinct verbs. `validate` is the generic `entities validate` op
(`solutions/ontological/lib/model/ops/`).

## Workflow invariants

- A Standard MUST declare
  `state: open/draft | open/proposed | open/active | closed/superseded | closed/deprecated`.
- A Standard MUST declare `applies_to.paths` with at least one glob.
- A `closed/superseded` Standard MUST carry `superseded_by:` pointing at a
  Standard.
- A `closed/deprecated` Standard MUST carry `deprecation_note:`.
- A Standard carrying `severity_floor:` MUST declare `enforcement: block`.
- A Standard's body MUST contain a Rule-section (under that name or
  one of its aliases), a Why-section, and a How-to-apply-section.
- `superseded_by:` MUST point at a Standard that exists. `supersedes:` is
  legacy — new supersessions write no pointer; the deletion commit records
  the lineage.

## Position in the entity model

Lives in the **Planning-meta layer** of the five-layer model
([[D-ORMG-data-model]]). Planning-meta covers artifacts that govern
how the project reasons about itself; Standards are the enforceable
sub-layer within that.

## Summary

- A rule that prescribes behavior on a scoped set of paths, with a
  deterministic validator where one exists. ^summary
- Identifier: `S<NNNN>-<slug>.md` filename, `[[S<NNNN>-<slug>]]`
  wikilink, sequential zero-padded ids.
- State enum: `open/draft | open/proposed | open/active | closed/superseded | closed/deprecated`.
  `closed/superseded` requires `superseded_by:` and is legacy — a fully
  superseded Standard is deleted, git history is the archive;
  `closed/deprecated` requires `deprecation_note:`.
- Body convention: Rule (required, under that name or an alias) +
  Why + How to apply + optional Anti-examples / Scope / Notes /
  References.
- Frontmatter MUST carry `applies_to.paths` — the authoritative
  scope. Narrative-only scope in the body is informational.
- Distinct from Principle (value-bearing) and Decision (choice-
  bearing). Standards operationalize Principles and often follow
  from Decisions.
