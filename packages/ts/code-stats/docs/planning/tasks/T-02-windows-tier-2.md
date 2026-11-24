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
and `.gitattributes` files, and turns paths to `/` form in one helper, `src/paths.ts`. The package is
in the home's Windows tier-2 workflow, and its tests run and pass there on Node 22 and 24. The fixes
were path normalisation in `countTree` and Windows skips in the tests.

## Approach

1. Add the package to the Windows tier-2 workflow.
2. Fix what the first run shows. Likely places are the path helper, the tests that make
   repositories in a temporary folder, and the ones that compare paths as strings.
3. Change the README's platform line and [D-P6HZ](../decisions/D-P6HZ-node-only-and-platforms.md).

## Acceptance criteria

- [x] The workflow runs the package's tests on Windows and they pass.
- [x] The README names Windows as tested.

Result: the tests pass on Windows in tier-2 CI on Node 22 and 24, except the file names Windows
forbids and the executable-bit check. Run
[45358781696](https://github.com/osdlc/osdlc/actions/runs/45358781696).
