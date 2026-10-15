---
id: N-01
type: note
state: accepted
created: 2026-10-13
---

# N-01: The runner seam

What the package is built around, and why it has four runners.

## The contract

A _runner_ is an object that runs one binary. The binary is fixed when the
runner is made. Code that needs to run `git` takes a runner as a parameter
instead of calling `child_process` itself. Production passes the real
runner, `spawnRunner('git')`. Tests pass a fake that returns canned results.
That parameter is the seam: the place where behaviour can be swapped without
changing the code around it.

Every capture runner shares one vocabulary:

- `CommandRunOptions`: `cwd` (required), `timeoutMs`, `input` and `env`;
- `CommandResult`: `exitCode`, `stdout`, `stderr`, `neverExited`, `reason`,
  `signal` and `error`;
- `CommandFailed`: the error that the checked calls throw.

A caller can move between runners without learning a new contract.

## The four runners

| Runner                 | For                                       | Returns                  |
| ---------------------- | ----------------------------------------- | ------------------------ |
| `spawnRunner`          | short commands, one after another         | `CommandResult`          |
| `spawnRunnerAsync`     | long commands, or several at once         | `Promise<CommandResult>` |
| `streamRunner`         | output shown live (builds, prompts)       | `StreamResult`           |
| `managedProcessRunner` | a child that runs while the caller works  | `ManagedProcessHandle`   |

Use the sync runner for short commands. Blocking costs them nothing, and
it keeps the calling code synchronous. `asAsync(syncRunner)` views a sync
runner through the async interface, so one fake can serve code written
against either.

The streaming and managed-process runners exist because the capture runners
cannot do two common jobs. A build or an interactive tool must show its
output as it runs. A dev server or a watcher must keep running while the
caller goes on. Code that did these jobs had to call `child_process` itself.
It then could not take a fake in tests, and each place wrote its own
timeout, `cwd`, `env` and failure handling. The two runners give those jobs
the same seam and the same failure shape.

## Failures

A failed command is a result, not an exception
([D-05](../decisions/D-05-failures-are-results.md)). `neverExited` tells a real
exit code from the runner's stand-in, and `reason` says what happened. Apart
from programmer errors, such as a bad `timeoutMs`, only the checked calls
throw, and only for a non-zero exit.

## Hard timeouts

A timeout kills the child with `SIGKILL`
([D-06](../decisions/D-06-timeouts-and-cancellation.md)), so it does not rely on
the child honouring `SIGTERM`. The sync and streaming runners get this from
`spawnSync`'s `timeout` with `killSignal: 'SIGKILL'`. The async runner
enforces it with its own timer, and does not wait for the output pipes to
close, which a surviving grandchild could hold open.

## Out of scope

- Shell-script ergonomics: template strings, piping, globbing.
- Processing output as a stream while the command runs.
- Process management: restarts, logs, health checks.

Other libraries do these well. The README names them.
