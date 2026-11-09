---
id: T-08
type: task
state: open
created: 2026-11-07
---

# T-08: Limit failed token attempts

## Goal

The guard limits how often it reports denials, not how often a peer may try a
token. A 256-bit token cannot be guessed, so this is defence in depth, and it
keeps a flood of bad attempts from costing the app anything.

## Proposed

- Limit 401s per peer address, with a backoff after repeated failures (for
  comparison, code-server allows 2 a minute and 12 an hour).
- Loopback is not exempt.

## Done when

- A test shows the limit and its recovery.
- A valid token is never slowed by another peer's failures.
