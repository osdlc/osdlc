---
id: D-07
type: decision
state: proposed
created: 2026-11-24
---

# D-07: Accessibility and walk modes

## Decision

- `story-shots --a11y` runs axe-core over every enrolled story in light and
  dark and fails on WCAG 2.2 A and AA violations, unless a story sets
  `parameters.a11y.test: 'todo'`. It reads the `parameters.a11y` that
  `@storybook/addon-a11y` reads, so the panel and the check agree.
- `story-shots --walk` tabs through every enrolled story in light, then
  Shift+Tabs back, and records each stop. It is a survey: it fails only on a
  story that errors.
- Both run in the same pinned container as the baseline check, one mode per
  run, and read and write no baselines. axe-core is installed in the
  container at the version pinned in `story-shots.sh`.
- The rules are exported from `./a11y`, with no Node imports.

## Why

- The container already serves the build and runs the stories, so the checks
  need no second setup.
- Reading the addon's parameters means a team states an exception once.
- The alternatives each cover one part: the addon with a test runner or
  `@storybook/addon-vitest` needs a runner, `@axe-core/playwright` and
  `axe-playwright` are libraries that enrol no stories, and the focus-order
  tools do not walk every story of a build.

## Consequences

- The check needs Docker, like the baseline check.
- Changing the axe-core pin can change which stories fail, so the changelog
  says when it moves.
