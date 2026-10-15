---
id: D-05
type: decision
state: accepted
created: 2026-10-13
---

# D-05: Failures are results

## Decision

- `run` never throws for a failed command. A missing binary, a timeout, an
  abort or a signal becomes a result with a non-zero `exitCode`. Programmer
  errors, such as a bad `timeoutMs` or a NUL byte in argv, do throw.
- `neverExited: true` marks a result with no real exit status. `exitCode` is
  then a stand-in `1`.
- `reason` says why: `'spawn'`, `'timeout'`, `'abort'`, `'signal'` or
  `'output'`. `signal` names the signal when the runner knows it. `error`
  holds the runner's own message.
- `stderr` holds only what the child wrote. The runner's own message is never
  copied into it.
- The streaming and managed-process results carry `reason` and `error` too.
  A caller's `kill()` on a managed process is reported as `'abort'`.
- `runChecked` and `runCheckedAsync` throw `CommandFailed` on a non-zero exit.
  Its `message` quotes argv with `shellJoin`. The docs warn that argv appears
  in the message, so secrets belong in `env` or `input`, not argv.
- `failureText(result)` gives one stream for a short message.
  `failureText(result, { both: true })` gives both, and `CommandFailed.detail`
  is defined as that same call.

A missing `grep` and a `grep` with no matches both have `exitCode` 1.
`neverExited` and `reason` tell them apart:

```ts
import { spawnRunner } from '@sksizer/command-seam'

const r = spawnRunner('grep').run(['-q', 'TODO', 'notes.txt'], { cwd: process.cwd() })
if (r.neverExited) console.error(`grep did not finish (${r.reason}): ${r.error}`)
else if (r.exitCode === 1) console.log('no matches')
```

## Why

- One result shape for every failure lets the caller handle them in one
  place.
- A caller that prints `stderr` should see what the tool said, not a message
  the runner wrote for it. `failureText` and `CommandFailed` fall back to
  `error` when `stderr` is empty, so a message still says why.
- A stand-in exit code must not look like a real one. `grep` exits `1` for
  "no matches", and a missing `grep` must not read the same.
- A quoted argv can be pasted into a terminal and shows where each argument
  ends. The library cannot know which argument is secret, so it does not
  redact.

## Consequences

- Callers check `neverExited` before they treat an exit code as an answer.
- A timeout may pass on a retry. A spawn failure or the output cap will not.
  `reason` lets a caller tell them apart.
