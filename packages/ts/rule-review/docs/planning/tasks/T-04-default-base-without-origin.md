---
id: T-04
type: task
state: done
created: 2026-11-07
---

# T-04: `defaultBase` without `origin/HEAD`

## Goal

`defaultBase` answers in a repository with no `origin/HEAD`, as its
documentation says, instead of throwing.

## Approach

Read `refs/remotes/origin/HEAD` with `symbolicRef`, which answers `null` when
it is unset. Fall back to `master` when only `master` exists, else `main`.

## Acceptance criteria

- [x] A test on a repository with no remote expects `main`, and one with only
      `master` expects `master`.
