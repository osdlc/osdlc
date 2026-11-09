---
id: T-INEW
type: task
state: done
created: 2026-11-07
---

# T-INEW: Run with no target from a subdirectory, sweep the checkout around it

## Goal

Run with no target from inside a checkout, `repo-cleaner` sweeps that checkout, as most git tools do. Today, from a subdirectory, it searches below it, finds nothing and exits 10.

## Spec

[#680](https://github.com/osdlc/osdlc/issues/680) holds the full spec: today's code with links, the proposal and the acceptance criteria. Discuss and refine it there. When the issue closes, set this task's `state` to `done` and add an Outcome section.

## Outcome

Shipped in [#689](https://github.com/osdlc/osdlc/pull/689). With no target, a
directory where the search finds no checkout, and whose checkout tracks files
in it, sweeps that checkout. The rule is narrower than the issue proposed: a
directory the checkout tracks nothing in, such as `~/Developer` under a home
directory kept in git, is still searched and reported as before.
