---
id: T-03
type: task
state: done
created: 2026-10-19
---

# T-03: Test that `isInside` rejects a sibling-prefix directory

## Goal

`isInside` has a test for the case where a sibling directory shares the root's
name as a prefix, such as `/a/vault-evil` beside `/a/vault`. A guard that
compares path strings with `startsWith` accepts it. `isInside` must not.

## Today

`isInside` in `contained.ts` uses `path.relative`, so it rejects such a
sibling. `examples/usage.test.ts` covers an in-root path, a `..` escape and a
symlink, but no test covered a sibling prefix. The same case is tested for
`contains` in `tests/resolve.test.ts` and in the Rust crate's `src/tests.rs`,
and for `isUnder` in `tests/lexical-entry.test.ts`.

## Approach

Add an `isInside` block to `tests/contained.test.ts`.

## Acceptance criteria

- [x] A test asserts that `isInside('/a/vault', '/a/vault-evil')` and
      `isInside('/a/vault', '/a/vault-evil/x')` are false.
- [x] The same test asserts that `isInside('/a/vault', '/a/vault/x')` is true.
