---
id: T-03
type: task
state: open
created: 2026-10-19
---

# T-03: Test that `isInside` rejects a sibling-prefix directory

## Goal

`isInside` has a test for the case where a sibling directory shares the root's
name as a prefix, such as `/a/vault-evil` beside `/a/vault`. A guard that
compares path strings with `startsWith` accepts it. `isInside` must not.

## Today

`isInside` in `contained.ts` uses `path.relative`, so it rejects a sibling
that shares the root as a prefix. No test covers
that case, and no test file exercises `isInside` beyond the export checks.
The `./lexical` entry has the case in `tests/lexical-entry.test.ts`, and the Rust
crate has it in `src/tests.rs`.

## Approach

1. Add a test, in `tests/contained.test.ts` or a new file: `isInside('/a/vault', '/a/vault-evil/x')` is false.
2. Keep `isInside('/a/vault', '/a/vault/x')` true in the same test, so the
   case shows the check is exact and not just strict.

## Acceptance criteria

- [ ] A test asserts that `isInside('/a/vault', '/a/vault-evil/x')` is false.
- [ ] The same test asserts that `isInside('/a/vault', '/a/vault/x')` is true.
