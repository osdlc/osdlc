---
id: D-09
type: decision
state: accepted
created: 2026-10-13
---

# D-09: Helpers

## Decision

In the package:

- `withDefaults(runner, options)` binds default options, such as `cwd`, to
  any runner. A per-call `env` is merged over the bound one:

  ```ts
  import { spawnRunner, withDefaults } from '@sksizer/command-seam'

  const git = withDefaults(spawnRunner('git'), { cwd: process.cwd(), env: { LC_ALL: 'C' } })
  git.run(['log', '-1'], { env: { GIT_PAGER: 'cat' } }) // both variables reach git
  ```

- `ran` accepts any result with `exitCode` and an optional `neverExited`, so
  it works on the streaming and managed-process results too.
- `@sksizer/command-seam/testing` exports `fakeRunner` (with an
  `asyncRunner` form, keyed by each argument's `shellQuote`), `fakeNeverExited` and
  `fakeProcess` for tests.
- `runJson` takes a `parse` option to validate the parsed value, with an
  `invalid` outcome when it rejects, and `okExitCodes` for a tool that exits
  non-zero with an answer.
- `stopProcess` stops a managed process with `SIGTERM`, then `SIGKILL` after
  a grace period.
- `mapFailedAsync` accepts a mapper that returns `Error` or
  `Promise<Error>`.

Not added:

- A "text or null" read (`runText`, `stdoutOr`). `ran(r) ? … : null` covers
  one command, and `catchFailed` covers several.
- An option to start the child without the parent's environment. It waits
  until a user asks for it.
- A ready-made `StreamRunner` fake, a list of answers per `fakeRunner` key,
  and a synchronous `exit` field on `ManagedProcessHandle`. The hand-written
  forms are short.
- Readiness from a managed process's output. Its stdio is inherited; callers
  poll from outside.

## Why

`ran` on every result means callers no longer skip its `neverExited` check by
comparing `exitCode` themselves. Fakes in a subpath keep test code out of the
main entry point. Helpers no user needs yet stay out, so the surface stays
small (see [D-01](D-01-purpose-and-scope.md)).

## Consequences

- New helpers are experimental until they have a user (see
  [D-02](D-02-version-line-and-stability.md)).
- `cwd` stays required on every call. `withDefaults` is the way to set it
  once.
