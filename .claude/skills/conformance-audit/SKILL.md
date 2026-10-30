---
name: conformance-audit
description: Audit the library families in osdlc/osdlc against S-conformance-suites, read-only, on an up-to-date main. Runs `pnpm run check:conformance` and every family's generator, runs each implementation's tests, reports migration progress (families not yet in packages/conformance/, the CATCHING_UP and UNMIGRATED lists), finds Rust/TypeScript library pairs that families.json does not list, and flags implementation source that changed after its family's suite last did. Writes a report; commits nothing. Run it on demand, or periodically with `/loop 1d /conformance-audit` or `/schedule`. Invoke for "check the families", "are the Rust and TypeScript libraries still aligned", "conformance status", or "how far is the suite migration".
---

# `/conformance-audit`

Checks that every library family in this repository still behaves the same
in each language, and how far the move to shared conformance suites has got.
[S-conformance-suites](../../../docs/planning/standards/S-conformance-suites.md)
is the standard; `scripts/conformance.ts` enforces its mechanical part. This
skill adds what a pull request's CI cannot see: the whole repository at once,
drift that builds up between pull requests, and pairs nobody registered.

It is read-only. It never commits, pushes, or edits a suite. When it finds
something to fix, the report says what and where, and the user decides.

## 1. Work on an up-to-date main

Never audit the current checkout, which may hold unrelated work. Make a
detached worktree of `origin/main`:

```sh
git fetch origin main
git worktree add --detach .claude/worktrees/conformance-audit origin/main
cd .claude/worktrees/conformance-audit
pnpm install --frozen-lockfile
```

If the worktree already exists from an earlier run, `git -C` into it and
`git checkout --detach origin/main` instead. Use one shared
`CARGO_TARGET_DIR` (for example `../cargo-target`): the box is small, and a
target directory per worktree fills the disk.

## 2. The mechanical checks

Run, and keep each one's output for the report:

```sh
pnpm run check:conformance
node scripts/conformance.ts --regenerate --reference ts
node scripts/conformance.ts --regenerate --reference rust
```

`--regenerate` runs each family's generator and fails if a suite changed,
which means the reference's behaviour moved and nobody rewrote the expected
values. Afterwards, run `git status --short packages/conformance` and
`git checkout -- packages/conformance` so the worktree is clean again.

## 3. Each implementation's tests

Read `packages/conformance/families.json`. For every implementation of every
family:

- TypeScript: `pnpm --filter <name> run build`, then
  `pnpm --filter <name> run test`. Build the workspace packages it depends
  on first (`pnpm --filter <name>... run build`).
- Rust: `cargo test -p <name> --locked`, from `packages/rust/`.

Record pass or fail and the failing test names. A suite case that fails in a
non-reference implementation is a real divergence. Say which case and what
each side gives.

## 4. Migration progress

- The standard's **Migration** table lists every family. A row whose
  "Fixture today" column does not say `moved:` has not moved. List them.
- `CATCHING_UP` and `UNMIGRATED` in `scripts/conformance.ts` should shrink.
  List their entries with the reason each gives.
- A family listed in the table that has no implementation on `main` yet (its
  Rust or TypeScript half lives on a branch) is not a problem; say so once.

## 5. Pairs nobody registered

List the directories under `packages/ts/` and `packages/rust/`. A pair is a
candidate family when:

- the same name exists on both sides, or
- `packages/README.md` calls one the "Rust implementation" or "TypeScript
  implementation" of the other, or
- a crate's `Cargo.toml` description or README names an `@osdlc/` package as
  its counterpart.

Leave out bindings: a `-wasm` crate, and a TypeScript package built from a
crate (`@osdlc/yaml-splice`). Report each
candidate that `families.json` does not list, with the evidence.

## 6. Source that outran its suite

For each family, find when its suite last changed and what changed in each
implementation's `src/` since:

```sh
since="$(git log -1 --format=%cI -- packages/conformance/<family>)"
git log --oneline --since="$since" -- <dir>/src
```

A commit there is not wrong in itself. It may be internal. But a behaviour
change in one implementation with no suite change is exactly how families
drift. For each family with such commits, dispatch one read-only sub-agent
(the `Explore` agent is enough) with the commit list and the suite path, and
ask: does any of these commits change behaviour the suite should cover, and
does the other implementation have the same behaviour? Run at most three at
once. Ask for a one-line verdict per commit: `internal`, `covered`, or
`uncovered: <what>`.

## 7. Report

Print one table, then the findings that need action:

| Family | Cases | check | regenerate | TS tests | Rust tests | Versions | Source since suite |
|---|---|---|---|---|---|---|---|

- **Cases** is the total across the family's sections.
- **Versions** shows each implementation's version, marked when major.minor
  differ.
- **Source since suite** shows the count of commits, and the number the
  sub-agents judged `uncovered`.

Under the table, list in this order:

1. failing checks and tests;
2. `uncovered` behaviour;
3. unregistered pairs;
4. migration still to do.

Each item gets one line, with a path the user can open. End with the one
thing most worth doing next.

Then remove the worktree (`git worktree remove .claude/worktrees/conformance-audit`)
unless the user asked to keep it.

## Running it periodically

This skill keeps no state between runs, so it suits a recurring run:

- In a session: `/loop 1d /conformance-audit` runs it daily while the
  session is open.
- In the cloud: `/schedule` creates a routine that runs it on a cron
  schedule and reports back.

A run that finds no problem says so in one line, with the migration count,
rather than printing a clean table.
