---
id: T-UH0R
type: task
state: open
created: 2026-11-09
---

# T-UH0R: A failed step skips only what depends on it

## Goal

When one step of `clean` fails, the run skips the steps that depend on it and
runs the rest, instead of stopping. One worktree that cannot be removed no
longer leaves every later row undone. A failed tip check of a spared remote
branch still stops the run, because the plan's premise no longer holds.

## Spec

[#646](https://github.com/osdlc/osdlc/issues/646) holds the spec: which steps
a failure skips, the new `skipped` step result, and the acceptance criteria
(see the decision comment). Discuss and refine it there. When the issue
closes, set this task's `state` to `done` and add an Outcome section.
