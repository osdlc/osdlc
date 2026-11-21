---
id: T-602K
type: task
state: done
created: 2026-10-07
---

# T-602K: Report each worktree's disk size and the total a clean would free

## Goal

With `--sizes`, each worktree row carries its disk usage, the report ranks rows largest first, and the summary says how much a clean would free. Today a person runs `du` by hand to decide where to start.

## Spec

[#660](https://github.com/osdlc/osdlc/issues/660) holds the full spec: today's code with links, the proposal and the acceptance criteria. Discuss and refine it there. When the issue closes, set this task's `state` to `done` and add an Outcome section.

## Outcome

Shipped in [#936](https://github.com/osdlc/osdlc/pull/936). `status --sizes`
measures each worktree with `du -sk` (with a timeout), ranks rows largest
first, adds a size column and the total reclaimable, and counts the worktrees
it could not measure. Only `status` takes the flag. `clean` always reports
the space it freed: it measures each worktree it removes just before removal,
records `freedBytes` on the step in the receipt, and prints `freed: …` in its
summary. The code is `src/size.ts`.
