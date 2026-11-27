---
id: T-02
type: task
state: open
created: 2026-11-22
---

# T-02: Test on Windows

## Goal

State Windows as supported, or say what does not work there.

## Today

The tests run on Linux and macOS. The README says Windows is not tested. The code uses `node:path`
separators, and `src/vault-relative.ts` resolves symlinks to decide whether a base file lies inside
the vault, which is the likeliest place to differ.

## Approach

- [ ] Run the package's tests in the repository's Windows job and fix what fails.
- [ ] Add the package to that job's list of path-resolving libraries.
- [ ] Update the README's platform section.

## Acceptance criteria

- [ ] The tests pass on Windows, or the README names the failing behaviour.
