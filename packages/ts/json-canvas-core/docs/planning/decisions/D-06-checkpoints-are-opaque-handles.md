---
id: D-06
type: decision
state: accepted
created: 2026-11-22
---

# D-06: Checkpoints are opaque handles

## Decision

`SnapshotHistory.checkpoint()` returns a number that callers treat as a token. They pass it to
`revertTo` and do nothing else with it. It is not an index into `getEntries()`.

The handle counts every step ever recorded, including steps pruning has dropped. It therefore keeps
naming the same state when the oldest steps leave the stack. `revertTo` refuses a handle whose state
has been pruned or cleared.

## Why

- An index into the undo stack goes stale when pruning shifts the stack, and then points at an
  unrelated state with no error.
- A count that only grows survives pruning, and the one case it cannot serve is detectable.

## Consequences

- The type is `number`, so the token is not enforced. The README says not to do arithmetic on it.
- One case is still wrong: after an undo and a new edit drop the branch a checkpoint was on,
  `revertTo` succeeds and returns another state. [T-01](../tasks/T-01-checkpoints-name-a-state.md)
  covers it.
