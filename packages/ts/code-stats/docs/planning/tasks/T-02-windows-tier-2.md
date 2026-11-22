---
id: T-02
type: task
state: open
created: 2026-11-22
---

# T-02: Run the tests on Windows

## Goal

The README can say Windows is tested, because the tests ran there.

## Today

The tests run on Linux and macOS. The package starts `git`, `gh` and `lizard`, reads `.gitignore`
and `.gitattributes` files, and turns paths to `/` form in one helper, `src/paths.ts`. No test has
run on Windows, and the package is not in the home's Windows tier-2 workflow.

## Approach

1. Add the package to the Windows tier-2 workflow.
2. Fix what the first run shows. Likely places are the path helper, the tests that make
   repositories in a temporary folder, and the ones that compare paths as strings.
3. Change the README's platform line and [D-P6HZ](../decisions/D-P6HZ-node-only-and-platforms.md).

## Acceptance criteria

- [ ] The workflow runs the package's tests on Windows and they pass.
- [ ] The README names Windows as tested.
