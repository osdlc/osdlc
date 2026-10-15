---
id: D-07
type: decision
state: accepted
created: 2026-10-13
---

# D-07: Process groups

## Decision

- The option that runs a child as the leader of its own process group is
  named `processGroup`. An option is a field of the options object passed to
  a runner's `run` method, next to `cwd` and `timeoutMs`. With
  `processGroup: true`, a timeout, an abort or `kill()` signals the whole
  group.
- The async capture runner and the managed-process runner have it. The sync
  and streaming runners kill only the direct child in `0.x`.
- There is no `detached` alias.

```ts
import { managedProcessRunner, spawnRunnerAsync } from '@sksizer/command-seam'

const cwd = process.cwd()
// The timeout kills the build and every process it started.
await spawnRunnerAsync('npm').run(['run', 'build'], { cwd, timeoutMs: 600_000, processGroup: true })
// kill() signals the server and its children.
const server = managedProcessRunner('node').run(['server.js'], { cwd, processGroup: true })
server.kill()
```

## Why

- Node calls the mechanism `detached`, which names how it works, not what the
  caller wants. On Windows, `detached` means something else (a new console).
  `processGroup` says what it does.
- The sync runners use `spawnSync`, which gives no handle to the child while
  it runs, so the runner cannot signal a group. The streaming runner follows
  them for `0.x`.

## Consequences

- The README says which runners kill the group and which kill the direct
  child only.
- A process group does not get the terminal's Ctrl-C. A caller that wants
  Ctrl-C to stop it listens for `SIGINT` and aborts through `signal`.
- Process groups are POSIX only. Windows needs another way
  ([T-01](../tasks/T-01-windows-support.md)).
