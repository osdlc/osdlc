---
id: D-01
type: decision
state: accepted
created: 2026-10-13
---

# D-01: Purpose and scope

## Decision

The package is published as infrastructure for the libraries hosted in
[sksizer/sdlc](https://github.com/sksizer/sdlc). Those libraries take a runner
as a parameter and depend on this package from npm. It is not pitched as a
general replacement for execa, tinyexec or zx.

## Why

Other libraries already cover most of what this one does, and cover more
platforms. No other library takes a runner object as a parameter; zx can swap
its spawn function. The injectable runner is the reason to publish: code
takes a runner object, production passes the real one, and tests pass a fake.

## Compared with tinyexec and execa

What this package adds:

- Code takes the runner as a parameter, and tests pass a fake. `/testing`
  ships the fakes: `fakeRunner` (sync and async), `fakeProcess` (including
  one that ignores SIGTERM) and `fakeNeverExited`.
- Every failure has one result shape: non-zero exit, timeout, signal, abort
  and spawn error. A `reason` field tells them apart. There are no distinct
  error types.
- A timeout kills with SIGKILL. `processGroup` kills the child's children.
  `stopProcess` sends SIGTERM, waits, then sends SIGKILL. tinyexec has no
  built-in process-group kill. execa has `killDescendants`, which is async
  and opt-in.
- Helpers: checked calls that throw `CommandFailed`, `runJson` with
  `okExitCodes`, `withDefaults` and shell quoting.

Where the others are better:

- Windows. tinyexec handles PATHEXT, and execa has strong Windows support.
  This package is tested only on Linux and macOS.
- Streaming output while the command runs. tinyexec has a line iterator, and
  execa has streams.
- Adoption. Each has about 160 to 175 million weekly downloads.
- tinyexec and this package both have zero dependencies and both have sync
  and async APIs.

When to choose which. To just run a command, tinyexec or execa is the better
choice. Choose this package when shell-out code must be unit tested without
spawning anything, and when failures must be told apart by `reason`. A
fake-runner adapter over tinyexec gives part of this. The fakes, the result
model and the process handling are what it would still lack.

These claims were checked against the tinyexec 1.3.1 and execa 10.1.0
source.

## Consequences

- The README keeps its claims to that scope. Its "When not to use it" and
  "Alternatives" sections point readers to other libraries for general use.
- Exports with no user yet are kept and marked experimental (see
  [D-02](D-02-version-line-and-stability.md)).
- Features that other libraries already do well are added only when a user
  needs them. See [D-09](D-09-helpers.md) and
  [D-10](D-10-output-is-text.md).
