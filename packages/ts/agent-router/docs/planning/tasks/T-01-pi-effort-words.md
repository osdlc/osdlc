---
id: T-01
type: task
state: done
created: 2026-11-07
---

# T-01: The catalogue speaks one set of effort words

## Goal

The catalogue names efforts on one scale, so a profile walk and a launcher agree on what a tool
accepts.

## Today

Done. [D-03](../decisions/D-03-input-is-checked-before-launch.md) settled step 1: an effort is a
level on `EFFORT_LEVELS` or a parse error, so the catalogue speaks that scale and each
`@osdlc/agent-call` adapter translates it (pi's sends `none` as `--thinking off`). The snapshot's
pi row now says `none`, and `tests/effort.test.ts` checks every snapshot effort is a level. The
catalogue schema (`EffortsSchema`, and `efforts()` in the Rust twin) refuses any other word in
every layer, and `modelsDevRow` drops one from a models.dev refresh, so no layer can bring one
back.

## Approach

1. Decide whether the catalogue speaks `EFFORT_LEVELS` or each tool's own words. The resolver
   already orders levels on `EFFORT_LEVELS`, which argues for it.
2. Fix pi's row in the snapshot, and the snapshot refresh step, to match.
3. Add a test that every tool's effort list in the snapshot is a subset of `EFFORT_LEVELS`.

## Acceptance criteria

- [x] Every effort in the shipped snapshot is on `EFFORT_LEVELS`.
- [x] `pi/…@none` resolves where pi accepts `off`.
