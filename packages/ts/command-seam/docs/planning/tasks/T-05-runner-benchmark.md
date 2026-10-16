---
id: T-05
type: task
state: open
created: 2026-10-16
---

# T-05: Benchmark the runners against raw `child_process`

## Goal

Measure what each runner costs over the Node call it wraps. Publish the
numbers in the README if they support the claim below.

## Today

There are no numbers. The expected result is a few function calls per run,
small next to the cost of starting a process.

## Approach

1. Compare each runner with the raw call it wraps: `spawnRunner` with
   `spawnSync`, `spawnRunnerAsync` with a hand-written `spawn` capture, and
   `streamRunner` with `spawn` and `stdio: 'inherit'`.
2. Cover small output, where starting the process dominates, and large
   output (10 to 200 MB), where decoding and string appends in the async
   runner matter.
3. Also measure the temp-file capture path `spawnRunner` takes under
   `bun test` ([D-11](../decisions/D-11-bun-test-capture-path.md)).

## Acceptance criteria

- [ ] A benchmark script in the repository runs each comparison.
- [ ] The README states the measured overhead, or the numbers are recorded
      here if they do not support the claim.
