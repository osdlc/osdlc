---
id: T-02
type: task
state: open
created: 2026-11-22
---

# T-02: Test on Windows

## Goal

The README can say that the package works on Windows, because CI runs it there.

## Today

The package runs `git` and `gh` through argv, reads files with `join(cwd, path)`, and has no
platform branch. Its tests build real repositories. The repository's Windows tier-2 workflow now includes it, and
the tests run and pass there on Node 22 and 24.

## Approach

1. Add the package to the Windows tier-2 workflow and read the failures.
2. Fix path separators in the repository-relative paths the manifest prints, which must stay
   `/` on every platform.
3. Update the README's platform line.

## Acceptance criteria

- [x] The package's tests pass on Windows in CI.
- [ ] A manifest made on Windows has the same paths as one made on Linux.

Result: the tests pass on Windows in tier-2 CI on Node 22 and 24, except the executable-bit check.
Run [45358781696](https://github.com/osdlc/osdlc/actions/runs/45358781696).
