---
id: D-07
type: decision
state: accepted
created: 2026-10-27
---

# D-07: Nested edits by path

## Decision

The crate and this package edit keys and items below the top level, by path.
The owner approved the design review on 2026-10-27
([`docs/parley/yaml-splice-nested-edits.json`](../../../../../../docs/parley/yaml-splice-nested-edits.json),
answers in `yaml-splice-nested-edits.answers.json` beside it). The question
ids below are the review's.

API and errors:

- **q-api: new variants.** `SetPath { path, value }`, `RemovePath { path }`
  and `RenamePath { path, to }` join `FieldEdit`. A path is a list of
  `PathSegment::Key(String)` or `PathSegment::Index(usize)`. `Set`, `Remove`
  and `Rename` stay, and a one-segment path behaves exactly like them.
- **q-errors: three new errors.** `PathNotFound`, `PathTypeMismatch` and
  `UnsupportedPath`. In this package they are new `EditErrorCode`s.

What an edit writes:

- **q-empty-parent: braces.** Removing the last key or item of a nested
  collection leaves `{}` (or `[]`), not `a:`. The parent stays a collection.
- **q-orphan-comment: keep.** A comment line above a removed only key stays,
  under `a: {}`. It is the top level's rule.
- **q-vivify: create.** A `SetPath` below an empty parent (null, `~`, `{}`,
  `[]`) creates the collection. A trailing comment moves to the header line.
  A scalar with content is `PathTypeMismatch`.
- **q-missing: split.** `RemovePath` of an absent last key is a no-op. A
  missing parent on the way is `PathNotFound`. An out-of-range index is a
  no-op.
- **q-append-pos: after.** A new key goes after the comment lines at the
  children's indent that end the block, and before blank lines and a comment
  at the parent's column or less.
- **q-final-newline: nested adds none.** A nested append in a document with
  no final line break adds none. The top level is unchanged (it adds one), and
  the README says the two differ.

Scope:

- **q-flow: full.** Flow collections are supported, appends and collections
  included.
- **q-release: tiers 1, 2 and flow.** Tier 1 is block mappings, tier 2 block
  sequences (compact `- key:` items too) and tier 3 flow collections. They
  ship in order, as separate changes of one tracking issue.

Findings of the review, already settled in #517 or kept:

- **q-bom: both.** A string that starts with U+FEFF is double-quoted, and the
  result check reads the output as a fresh reader does. Done in #517.
- **q-blank: refuse.** A value whose first non-empty line is only spaces is
  still refused, to keep byte parity with npm `yaml`.
- **q-key-order: verify and enable.** `yaml-splice-wasm` turns on
  `serde_json/preserve_order`, so a JavaScript object keeps its key order.
  Done in #517.
- **q-upstream: report.** Both findings go to eemeli/yaml. The owner files
  them; the reports are written for that.
- **q-fuzz-tooling: in-house; q-fuzz-budget: default.** The seeded generator
  only, 3,000 iterations in CI.
- **q-commit: its own PR.** The corpus and fuzz tests landed first, in #517.

## Why

- Rewriting a whole parent to change `build.target` loses the comments and
  quoting inside it. Callers of a config or workflow file need the one-key
  edit.
- Additive variants keep the stable API: `FieldEdit` and `EditError` are
  `#[non_exhaustive]`, so adding to them is not a breaking change.
- Each guarantee of the top level holds at depth: bytes outside the edit are
  unchanged, an equal `Set` is a byte-identical no-op, and every result is
  parsed and compared with the same edit applied in memory.
- Of 1,870 planned edits on real files (workflows, actions, config), 642 need
  tier 1 and 1,228 need tier 2, so block sequences ship in the first release.

## Consequences

- The npm package gets the same three edits and three error codes
  ([D-02](D-02-version-line-and-stability.md): codes are open to additions).
- A path edit costs one extra parse of its result and a walk of the spans of
  each mapping on the path.
- Rename and remove through an alias or a merge key are `UnsupportedPath`.
- `tests/fixtures/nested.json` is the contract. Each tier turns its cases on
  in `ENABLED_TIERS` when it is implemented.
