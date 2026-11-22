---
id: T-02
type: task
state: open
created: 2026-11-22
---

# T-02: Test on Windows

## Goal

The package is tested on Windows, and the README says so.

## Today

The README says Linux and macOS are tested and Windows is not. The scanner splits paths on
`path.sep`, and the symlink tests skip where a link cannot be created.

## Approach

1. Add the package to the repository's Windows workflow when a consumer needs it.
2. Fix what fails, such as path separators and the symlink tests.
3. Change the README's platform table.

## Acceptance criteria

- [ ] The tests pass on Windows in CI.
- [ ] The README lists Windows as tested.
