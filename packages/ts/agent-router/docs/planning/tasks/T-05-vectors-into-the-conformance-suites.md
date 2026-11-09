---
id: T-05
type: task
state: open
created: 2026-11-09
---

# T-05: The shared vectors move into the conformance suites

## Goal

The vectors both twins run live in `packages/conformance/agent-router/`, like every other family in
this repository, so the Rust crate no longer reads the TypeScript package's directory.

## Today

`scripts/emit-fixtures.ts` writes `fixtures/` in this package, and the Rust crate's
`tests/fixtures.rs` reads it there. `scripts/conformance.ts` lists the crate in `UNMIGRATED` for
that reason, and the Rust workflow runs when `packages/ts/agent-router/fixtures/` changes.

## Approach

1. Add an `agent-router` family to `packages/conformance/families.json`, TypeScript as the
   reference, with a `conformance:write` script that writes the suite.
2. Point both test suites at the suite, and drop `fixtures/`, `check:extra` and the crate's entry
   in `UNMIGRATED` and in the Rust workflow's path list.

## Acceptance criteria

- [ ] `pnpm run check:conformance` lists the family and passes.
- [ ] `packages/rust/agent-router` is not in `UNMIGRATED`.
