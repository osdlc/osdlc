---
id: D-03
type: decision
state: proposed
created: 2026-11-19
---

# D-03: Sibling corpora that link to each other in place

Pending the owner's sign-off. Settles osdlc/osdlc#839. No code changes with this record.

## Question

Many small corpora sit side by side in one tree, one per work item, and cite each other, sometimes
both ways. Should a corpus link to a sibling's records:

- (A) through a `references` entry flagged in place, with links straight to `../item-101/...`;
- (B) through a parent collection root that names its children as one link graph; or
- (C) as it does today, through `references` and a committed copy under `_references/<prefix>/`?

## Drivers

- A copy per citing item duplicates files in git, and each edit to a cited item needs a `sync` in
  every citing item (verified: spec, Sources and `sync`).
- A cycle between two items is an error (verified: `readSources` in `src/validate.ts` reports
  "closes a cycle"; the guide lists it under "What v0 does not do yet").
- A plain `../item-101/...` link only warns and the target is not checked (verified: `BETWEEN_CORPORA`
  in `src/validate.ts`).
- The spec's rule "a folder reached twice is one corpus" already gives one load per folder.

## Facts the choice rests on

- `references` is a mapping of prefix to source; a `./` or `../` source already resolves from the
  corpus root to a folder holding a root file (verified).
- Links into a referenced corpus must go through `_references/<prefix>/`; the copy is checked
  against the source by `sync` and the validator (verified).
- Load order is a depth-first stack; a cycle is detected by a folder already on the stack (verified).
- The shared suite in `packages/conformance/corpus-schema` has only a TypeScript implementation
  today, so a behaviour change updates the TS code and the suite vectors (verified: `families.json`).

## Prior art

| System | What it does | Verdict |
| --- | --- | --- |
| This package, `references` plus `_references/` | Link into a committed copy; no cycles | Keep as the default for corpora from a package or another repo |
| This package, `x-ref-form: id` | Reference by id, no copy; not usable for body links | Keep; does not cover body links |
| Obsidian vaults and mdbase | One root; links resolve across the whole vault or collection | Borrow for B: one link graph under one root |
| Package managers with workspaces (pnpm, Cargo) | Path dependency resolves in place; cycles are allowed only between workspace members of one root | Borrow for A: in-place for path sources inside one tree |

## Criteria

1. No committed copy and no `sync` for siblings.
2. Links keep the same checks as local links (existence, type, fragment).
3. A cycle between siblings is allowed; a cycle through `extends` stays an error.
4. Each sibling keeps its own root file, types and identity.
5. Smallest change to the spec, the validator and the suite.
6. `references` keeps one meaning for packages and for other repos.

## Options

**A. In-place references.** A `references` entry is flagged, for example `in-place: true` (or any
`../` path source that resolves under a declared common folder), and body links go to
`../item-101/...`. The link resolves through the loaded corpus, not a copy. Cost: a new
resolution path in `resolve`, and a rule for which `../` links count as in place. Forecloses
nothing; `_references/` stays for packages. Scores: 1 yes, 2 yes, 3 yes if the loader lets
in-place `references` edges close a cycle, 4 yes, 5 medium, 6 yes if the flag is explicit.

**B. Collection root.** A parent root names child corpora (`collection: [item-101, ...]`), and
links among them are one link graph. Cost: a new root kind, a new level or key, and a changed
meaning of "corpus". Forecloses cheap per-item adoption: every item must be listed in one
place, which conflicts with one folder per work item created on its own. Scores: 1 yes, 2 yes,
3 yes, 4 partly (the collection decides), 5 low, 6 yes.

**C. Status quo.** Cost: the duplication in the issue. Scores: 1 no, 2 yes, 3 no, 4 yes, 5 best,
6 yes.

## Choice

A, with these rules for the build:

- The flag is explicit per `references` entry, so a path source stays a normal reference unless it
  asks for in place (criterion 6).
- An in-place entry needs a `./` or `../` source; a package name with the flag is an error.
- Links into the sibling go straight to its files and are checked as a local link is, using the
  sibling's own types.
- `sync` skips in-place entries and writes no `_references/<prefix>/`.
- A cycle made only of in-place `references` edges is allowed and each folder loads once. A cycle
  that includes any `extends` edge or a copy-form `references` edge stays an error.

B lost: it adds a new root kind and a list that every new item must be added to. C lost: it is the
problem. A reopens the question for B if collections need shared types or shared identity rules.

## Open points for the owner

- The key name: `in-place: true` on a long-form `references` entry, or a new key such as
  `siblings`. The spec's `references` values are strings today, so a flag needs a longer form.
- Whether a wikilink may reach an in-place sibling by bare name (today a wikilink reaches only
  this corpus and its direct references).

## Reopen when

- Collections need a shared type set or one identity space (then B).
- A consumer needs in-place links across repositories (then the flag cannot assume one tree).

## Consequences

- Spec (`packages/conformance/corpus-schema/SPEC.md`): the Sources and Deferred sections change,
  and "Two corpora that reference each other" leaves the Deferred list.
- `src/validate.ts` (`readSources`, `resolve`, copy checks), `src/sync.ts`, `src/load.ts` and
  the guide change; conformance vectors gain sibling and cycle cases.
- Work to follow as a separate PR under about 600 non-test lines; the owner's key-name choice comes
  first.
- Supersedes nothing. Amends the guide's "What v0 does not do yet" table.
