---
id: T-02
type: task
state: open
created: 2026-11-07
---

# T-02: Same-prefix concurrency and fail-fast

## Goal

Shorten runs on folders with many independent checks, and let a caller stop at
the first failure.

## Today

`rule-review checks` runs checks one after another and always runs every
check. `review` caps concurrent judgements with a private `mapCapped` in
`src/run.ts`.

## Proposed

- Checks that share a number form a group and run at the same time, under a
  cap. Groups run in number order.
- `mapCapped` moves to its own module, shared by `review` and the check runner.
- `--fail-fast` stops after the first group with a failure. Checks not run are
  reported as skipped with the reason `fail-fast`.
- The report keeps number, then name, order whatever order checks finish in.

## Acceptance criteria

- [ ] A test shows two same-number checks overlap in time, and a later number
      starts only after both finish.
- [ ] With `--fail-fast`, checks after the failing group are skipped and never
      run.
