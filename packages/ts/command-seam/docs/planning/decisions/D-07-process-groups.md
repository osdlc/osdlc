---
id: D-07
type: decision
state: accepted
created: 2026-10-13
---

# D-07: Process groups

## Decision

- The option that runs a child as the [leader](../terms/TM-02-group-leader.md)
  of its own [process group](../terms/TM-01-process-group.md) is named
  `processGroup`. An option is a field of the options object passed to a
  runner's `run` method, next to `cwd` and `timeoutMs`. With
  `processGroup: true`, a timeout, an abort or `kill()` signals the whole
  group.
- The async capture runner and the managed-process runner have it. The sync
  and streaming runners kill only the direct child in `0.x`.
- There is no `detached` alias.
- `installGroupSignalForwarding()` is the opt-in way to stop live groups when
  the [host](../terms/TM-04-host.md) gets `SIGINT`, `SIGTERM` or `SIGHUP`. The
  runners register each group they start with `processGroup: true`. While one
  is registered, the signal sends `SIGTERM` to every group, `SIGKILL` to any
  still there after a [grace period](../terms/TM-07-grace-period.md), and the
  host then exits with `128 + signal number`. A group stays registered until
  it is empty, so a forwarded signal also kills a member that a settled run
  left behind. The host's normal exit `SIGKILL`s only the groups whose run is
  still in flight, so a daemon a settled run left behind keeps running.
  `liveProcessGroups()` lists the registered groups.
- When [forwarding](../terms/TM-05-signal-forwarding.md)
  [owns the exit](../terms/TM-11-exit-owner.md), the first forwarded signal puts
  the host in a [stopping state](../terms/TM-06-stopping-state.md). The runners
  refuse a new [`processGroup` run](../terms/TM-03-group-run.md): it starts
  nothing and settles with `reason: 'abort'`. `forwardedSignal()` returns
  the signal, so the host's own loop can stop too. Only the uninstall
  function resets this.
- When the host has its own listener for the signal, that listener owns the
  exit. The groups are still killed, but there is no stopping state, and
  later runs start as usual.

```ts
import {
  installGroupSignalForwarding,
  managedProcessRunner,
  spawnRunnerAsync,
} from '@osdlc/command-seam'

// Once at startup: Ctrl-C, SIGTERM or SIGHUP of the host also stops its live groups.
installGroupSignalForwarding()

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
- A group leader does not get the terminal's Ctrl-C. Without forwarding, a
  host killed by a signal leaves its groups running with no parent, as
  [orphans](../terms/TM-09-orphan.md).
- Forwarding is opt-in because it adds signal listeners to the host. A
  listener replaces the signal's default action, so the package does not add
  one unless the caller asks. The listeners are attached only while a group is
  live. If the host has its own listener for the signal, the groups are still
  killed, but the host's listener decides when to exit.
- The listener replaces the default action, so the host's code keeps running
  after the signal. A host that awaits one command and then starts the next
  would start work after it was told to stop. Refusing new groups stops that
  work, and `forwardedSignal()` lets the host stop its own loop.

## Consequences

- The README says which runners kill the group and which kill the direct
  child only.
- A process group does not get the terminal's Ctrl-C. A caller that wants
  Ctrl-C to stop it calls `installGroupSignalForwarding()` once at startup.
  A caller that wants its own handling listens for `SIGINT` and aborts
  through `signal`.
- `installGroupSignalForwarding`, `GroupSignalForwardingOptions`,
  `liveProcessGroups`, `forwardedSignal` and `forwardedExitCode` are
  experimental (see
  [D-02](D-02-version-line-and-stability.md)).
- A host that sets `process.exitCode` itself after its work returns must keep
  the `128 + signal number` code. It reads `forwardedExitCode()` after its
  work returns.
- `SIGKILL` of the host cannot be caught. Its groups are still left running.
- Forwarding hosts can nest: a grouped child can itself install forwarding
  and start groups of its own. The outer host sends `SIGKILL` to the child's
  group after its grace. If the child's grace is not shorter, that `SIGKILL`
  usually reaches the child before the child sends `SIGKILL` to its own
  groups, and the `exit` handler does not run on `SIGKILL`. A member of an
  inner group that ignores `SIGTERM` is then left running. A nested host
  needs a `graceMs` shorter than its parent's.
- A group is also a new [session](../terms/TM-10-session.md). A signal sent
  to the caller's process group, such as `timeout -s KILL` or a shell job
  kill, no longer reaches a child in its own group. Without a group it would
  reach the whole tree directly. With a group it reaches the tree only
  through forwarding, and a `SIGKILL` skips forwarding. So a `SIGKILL` sent
  to the caller's group now leaves the child's tree running.
- Process groups and signal forwarding are POSIX only. On Windows,
  `installGroupSignalForwarding` does nothing. Windows needs another way
  ([T-01](../tasks/T-01-windows-support.md)).
