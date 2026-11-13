---
id: T-05
type: task
state: done
created: 2026-11-07
---

# T-05: Guard the fixture scripts' executable bit

## Goal

A check-folder fixture that must run cannot lose its executable bit unseen.
With `core.fileMode=false` a lost bit does not show in `git status`, and the
tests that run the fixture fail elsewhere.

## Approach

`tests/fixture-modes.test.ts` reads the index modes with `git ls-files -s`
and fails, naming the paths, when a script that must run is not `100755`.

## Acceptance criteria

- [x] The test lists the deliberately non-executable fixtures and requires
      `100755` of every other one.
