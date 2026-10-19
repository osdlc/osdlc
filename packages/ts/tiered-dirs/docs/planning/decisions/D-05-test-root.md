---
id: D-05
type: decision
state: accepted
created: 2026-10-18
---

# D-05: The test root

## Decision

- When neither `env` nor `home` is injected, `systemBaseDirs` applies two
  rules before the override order. `TieredDirs.fromEnv` uses
  `systemBaseDirs`.
  - In a test runner process, where `<P>_ROOT` is unset and `HOME` is not
    moved, `<P>_ROOT` reads as `testRoot()`:
    `<tmp>/tiered-dirs-test-<pid>-<start ms>`.
  - With `<P>_REQUIRE_OVERRIDE` set, a root that would fall back to the per-OS
    table throws `OVERRIDE_REQUIRED`.
- A test runner process has a test file as its entry point and runs with
  `NODE_ENV=test`, `NODE_TEST_CONTEXT` (set by `node --test`) or under Bun.
  A Vitest worker also counts. It has `VITEST_WORKER_ID` or `VITEST_POOL_ID`
  set, and its entry point is in the `vitest` package's `dist/workers` folder,
  or is tinypool's `dist/entry/process.js` or `dist/entry/worker.js` for
  Vitest 3 and earlier.
- A child process a test spawns gets no default. It inherits the Vitest
  variables, but its entry point is neither a test file nor a Vitest worker.
- "HOME moved" means `HOME` differs from the passwd home. In that case the
  test-root default does not apply. The Rust crate has no such condition.
- `{ testRoot: false }` turns the first rule off. `<P>_ROOT` and
  `<P>_REQUIRE_OVERRIDE` still apply.
- `testRoot()` returns the root in a test runner process and `undefined`
  elsewhere. It is cached per module instance, so per test file under
  Vitest's default isolation.

## Why

- Vitest workers do not have a test file as their entry point. Without the
  Vitest rule the default never fired under Vitest, and a test that forgot to
  set `<P>_ROOT` resolved the real home.
- TypeScript test runners commonly point `HOME` at a fixture to move the
  home. The test must keep that fixture, so the rule yields to a moved
  `HOME`. A Rust test cannot move the home through `dirs`, and Rust detects a
  cargo test binary, which is narrower. The condition is not needed there.
- `testRoot: false` matches `ResolveOptions::with_test_root` in the Rust
  crate. A caller that wants the OS defaults in a test turns the default off
  explicitly.

## Consequences

- A CI job that sets `HOME` itself, such as a GitHub Actions container job
  (`HOME=/github/home`, passwd home `/root`), gets no test-root default. It
  sets `<P>_ROOT`.
- The two twins differ here by design. Parity covers the paths below a root,
  not how a test root is chosen.
