---
id: T-02
type: task
state: open
created: 2026-11-07
---

# T-02: A configurable effort-mismatch policy

## Goal

A host can choose how strictly an effort the tool and model do not accept is handled.

## Today

One fixed rule: an effort moves at most one step on `EFFORT_LEVELS`, up first, then down
(`adjustEffort`), and the resolve records the move on `Resolved.effortAdjusted`, traces it and
warns. A further one is an `unsupported-effort` error that lists the accepted levels.
`@osdlc/agent-call`'s adapters clamp as well (for example raising `none` to `low` for claude), and
the two layers decide separately.

## Approach

- [ ] Make the tolerance a router option, for example `clamp` or `error` with a step limit, in
      place of the fixed one step.
- [ ] Consider comparing cost instead of counting steps: accept a move only when the adjusted
      level's cost is within a bound of the requested one.
- [ ] Cover both layers in one policy, so the router's move and the adapter's clamp cannot
      disagree.
