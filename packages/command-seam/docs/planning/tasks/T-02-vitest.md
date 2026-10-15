---
id: T-02
type: task
state: open
created: 2026-10-13
---

# T-02: Move the tests to Vitest

## Goal

The tests run under Vitest on Node, the runtime users run, instead of
`bun:test` ([D-12](../decisions/D-12-tests-and-tooling.md)).

## Today

The tests use `bun:test`, so contributors need Bun. CI runs the suite under
Bun. Under Node it runs only the build, the smoke check and the tarball
check. No test needs perl, and `typecheck` already covers the tests and examples
([D-12](../decisions/D-12-tests-and-tooling.md)), so this is a port, not a
rewrite.

## Approach

1. Port the suite to Vitest.
2. Run it on Node 22 and 24 in CI.
3. Keep the build before the tests: under Node, the examples resolve
   `@sksizer/command-seam` by name through `exports` to `dist/`.
4. Check whether the pipe-path test is still needed. On Node every test takes
   the pipe path ([D-11](../decisions/D-11-bun-test-capture-path.md)).
5. Update CONTRIBUTING: the tests no longer need Bun.

## Acceptance criteria

- [ ] The suite passes under Vitest on Node 22 and 24.
- [ ] Under Node, the examples import the package by name from the built
      `dist/`.
- [ ] CONTRIBUTING no longer asks for Bun to run the tests.
