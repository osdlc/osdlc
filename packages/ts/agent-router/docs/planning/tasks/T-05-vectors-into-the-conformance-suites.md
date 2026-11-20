---
id: T-05
type: task
state: done
created: 2026-11-09
---

# T-05: The shared vectors move into the conformance suites

## Goal

The vectors both twins run live in `packages/conformance/agent-router/`, like every other family in
this repository, so the Rust crate no longer reads the TypeScript package's directory.

## Today

`scripts/emit-fixtures.ts` writes `fixtures/` in this package, and the Rust crate's
`tests/fixtures.rs` reads it there, as well as `src/catalogue/snapshot.json` (the shipped
snapshot, which some vectors name as a layer and one test parses through the Rust schema).
`scripts/conformance.ts` lists the crate in `UNMIGRATED` for that reason, and the Rust workflow
runs when either path changes.

## Approach

1. Add an `agent-router` family to `packages/conformance/families.json`, TypeScript as the
   reference, with a `conformance:write` script that writes the suite.
2. Point both test suites at the suite, and drop `fixtures/`, `check:extra` and the crate's entry
   in `UNMIGRATED`.
3. Decide how the crate reaches the snapshot: a copy in the suite, written by the generator, or
   the TypeScript path kept. Keep the Rust workflow's snapshot path for as long as it reads it.

## Acceptance criteria

- [x] `pnpm run check:conformance` lists the family and passes.
- [x] `packages/rust/agent-router` is not in `UNMIGRATED`.
- [x] The crate reads nothing under `packages/ts/`, or the plan says why the snapshot path stays.

## Outcome

The suite is one file per section, because it is over 1 MB as a single file. The shipped snapshot
is the `snapshot_layer` section, written by the generator from `src/catalogue/snapshot.json`, and
the catalogue layers that vectors name are the `named_layers` section. The crate reads nothing
under `packages/ts/`, so the Rust workflow no longer lists this package's paths.
