---
id: D-06
type: decision
state: accepted
created: 2026-10-13
---

# D-06: Timeouts and cancellation

## Decision

- `timeoutMs` has one meaning on every runner. `undefined` and `Infinity`
  mean no cap. A fraction rounds up. A value above 2,147,483,647 ms
  (2^31 - 1, about 24.8 days) is clamped to it. That is the largest delay a
  Node timer accepts. `0`, a negative value and `NaN` are a caller error
  (`RangeError`). A value that is not a number is a `TypeError`.
- A timeout kills the child with `SIGKILL`, not `SIGTERM`.
- Abort (`signal`, async runner) sends `SIGTERM`, then `SIGKILL` one second
  later if the child is still running.
- The async runner settles 250 ms after the child exits, even if a process
  the child started still holds the output pipes. This grace is internal and
  not an option.

```ts
import { spawnRunnerAsync } from '@sksizer/command-seam'

const git = spawnRunnerAsync('git')
const cwd = process.cwd()
await git.run(['fetch'], { cwd, timeoutMs: 30_000 }) // SIGKILL after 30 s
await git.run(['fetch'], { cwd, signal: AbortSignal.timeout(30_000) }) // SIGTERM first
```

## Why

- Node treats `0` as "no timeout" in `spawnSync`, while a timer of `0` fires
  at once. The same option meant "never stop" on one runner and "stop now" on
  another. A `0` is more likely an unset config value than a real wish, so it
  is an error.
- Node fires a timer with a larger delay after 1 ms, with a warning. A long
  timeout would then kill the child at once. Clamping keeps it a long wait.
- A process can ignore `SIGTERM`, so only `SIGKILL` makes a timeout a hard
  stop.
- `SIGTERM` first on abort lets a child such as git clean up its lock files.
- A forked grandchild can keep the pipes open long after the child exits. The
  grace keeps the runner from waiting on it. No user has needed to tune the
  grace, so it stays internal.

## Consequences

- The README "Timeouts and cancellation" section states each rule.
- A caller who wants no limit leaves `timeoutMs` out.
