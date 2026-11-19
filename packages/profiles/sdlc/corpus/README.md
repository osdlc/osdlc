# The sdlc profile

A corpus-schema profile: a corpus with types and no records. It is generated from the sdlc pack 0.1.0 and the intent pack 0.1.0 by `model-schema corpus`. Do not edit it; change the pack and build again.

It holds the types of the sdlc and intent packs, and extends nothing.

| Folder | Kind | `type:` | Id (`x-id-pattern`) | Record file (`x-record-file`) | Holds |
| ------ | ---- | ------- | ---- | ---- | ----- |
| `principles/` | `intent.principle` | `principle` | `^P-[0-9A-Z]{4}$` |  | A belief that drives design judgment. |
| `standards/` | `intent.standard` | `standard` | `^S-[0-9A-Z]{4}$` |  | A prescriptive rule about the codebase: an architectural rule, design convention, style requirement or workflow expectation. |
| `decisions/` | `intent.decision` | `decision` | `^D-[0-9A-Z]{4}$` | `README.md` | A recorded choice: what was decided, why, and what it replaces. |
| `drivers/` | `intent.driver` | `driver` | `^DR-[0-9A-Z]{4}$` |  | A motivating force behind a product: the root of the why chain. |
| `products/` | `intent.product` | `product` | `^PR-[0-9A-Z]{4}$` |  | A thing this project builds and ships; it scopes the drivers and goals beneath it. |
| `capabilities/` | `intent.capability` | `capability` | `^C-[0-9A-Z]{4}$` |  | Something the system provides, a node of the capability tree. |
| `terms/` | `intent.term` | `term` | `^TM-[0-9A-Z]{4}$` |  | A word of the project vocabulary, with its definition. |
| `references/` | `intent.reference` | `reference` | `^RF-[0-9A-Z]{4}$` |  | An external source the project leans on. |
| `tasks/` | `sdlc.work_item` | `task` | `^T-[0-9A-Z]{4}$` |  | A unit of work: sdlc's task. Its documents keep type: task. |
| `milestones/` | `sdlc.milestone` | `milestone` | `^M-[0-9A-Z]{4}(\.\d+)?$` |  | A product release: the work items it ships, and its version. |
| `backlog/` | `sdlc.backlog` | `backlog` | `^B-[0-9A-Z]{4}$` |  | A captured idea, not yet triaged into work; a multi-item dump file is one too. |
| `roadmaps/` | `sdlc.roadmap` | `roadmap` | `^RM-[0-9A-Z]{4}$` |  | A living tracking document: which milestones ship in which versions, against a plan note. |
| `frictions/` | `sdlc.friction` | `friction` | `^FR-[0-9A-Z]{4}$` |  | A recorded, deduplicated observation that the process cost time or failed. |
| `notes/` | `sdlc.note` | `note` | `^N-[0-9A-Z]{4}$` |  | A freeform document in the graph: a plan, research write-up, analysis, strategy, proposal, survey, retro or checklist. |

## What a type checks

Each `<folder>/<folder>.schema.json` is the kind's JSON Schema 2020-12, as the pack emits it, with:

- `x-id-pattern`: the kind's `id` pattern. A record's id is the longest part of its file name that matches it, followed by `-` or the end of the name, so `<id>-<slug>.md` has the id `<id>`. A record's `id` field must equal it.
- `x-record-file`, from the kind's `document.recordFile`: the file that holds a record kept in a folder of its own, such as `README.md` in `D-0001-a-slug/`.
- A ref is `x-ref`, naming its target's type, beside its pattern. `x-ref-form` says how it names the record: each kind's `document.links`. A ref to several kinds lists their types.
- `additionalProperties: false` when the kind is strict. A key of a pack the schema does not know, `<pack>.<prop>`, still passes, as in the pack.
- the pack's rules, as far as JSON Schema holds them: `if`/`then`, and `contains`. A rule there sees a value as written, before defaults.

It leaves out what corpus-schema does not check: defaults, descriptions, relations and their inverses, augments, and body sections. The pack holds those. Body sections will come from markdown-contract, through an `x-body` pointer.

## Use it

1. In your corpus's root file, set `level: 2`, extend this profile and use its types: `extends: { sdlc: '@osdlc/corpus-profile-sdlc' }` and `uses: [sdlc/*]`.
2. Keep each type's records in a folder named after it, such as `principles/`, with no schema file. To add fields to a type, leave it out of `uses` and give its folder a schema file that builds on it: `principles/principles.schema.yaml` holding `x-extends: sdlc/principles`.
3. Validate: `corpus-schema validate <corpus>`, with corpus-schema 0.3 or later.
