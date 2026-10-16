---
id: T-06
type: task
state: open
created: 2026-10-16
---

# T-06: Group kill on the sync and stream runners

## Goal

`spawnRunner`, `runShell`, `shellRunner` and `streamRunner` can kill the
whole [process group](../terms/TM-01-process-group.md) on a timeout, as the
async runners do with `processGroup: true`. This waits until a user needs it
([D-07](../decisions/D-07-process-groups.md)).

## Today

- The async runners (`spawnRunnerAsync`, `runShellAsync`,
  `shellRunnerAsync`) kill the whole group on a timeout or an abort when
  `processGroup: true` is set. `kill()` on a `managedProcessRunner` process
  does the same.
- The sync and stream runners send `SIGKILL` to the direct child only. A
  timed-out script that started its own children leaves them running.
- The `timeoutMs` TSDoc, the README and the CHANGELOG state this.
  `tests/contract.test.ts` and `tests/pipe-path.test.ts` pin it.
- A caller that needs group kill uses an async runner.

## Approach

All four use `spawnSync`, which has no `detached` option, so the child
shares the host's process group. The host is also blocked until
`spawnSync` returns, so it cannot signal anything at the deadline. A sync
group kill needs a different design, such as a wrapper that starts its own
session. Then:

1. Add `processGroup` to the sync and stream runners with that design.
2. Change the tests that pin the direct-child kill to cover both cases.
3. Update the `timeoutMs` TSDoc, the README and D-07.

## Acceptance criteria

- [ ] With `processGroup: true`, a timeout in the sync and stream runners
      kills every process in the group.
- [ ] Without it, they still kill the direct child only.
- [ ] The TSDoc, the README and D-07 describe both cases.

## Out of scope

- Windows, while the package is POSIX only
  ([T-01](T-01-windows-support.md)).
