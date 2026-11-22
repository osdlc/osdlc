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

The README says Linux and macOS are tested and Windows is not. The package runs `git` and `gh`
through argv and reads files with `join(cwd, path)`, and has no platform branch, so it may work.
Its tests build real repositories and have not been run on Windows. The repository's Windows
tier-2 workflow does not include it.

## Approach

1. Add the package to the Windows tier-2 workflow and read the failures.
2. Fix path separators in the repository-relative paths the manifest prints, which must stay
   `/` on every platform.
3. Update the README's platform line.

## Acceptance criteria

- [ ] The package's tests pass on Windows in CI.
- [ ] A manifest made on Windows has the same paths as one made on Linux.
