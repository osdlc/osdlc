---
type: decision
schema_version: '2'
id: D-0004
title: Update repositories in parallel with --jobs, one child process per repository
state: open/proposed
created: '2026-11-19'
last_reviewed: '2026-11-19'
tags:
  - pr-update
  - concurrency
  - cli
---
# Update repositories in parallel with --jobs, one child process per repository

## Summary

`update --jobs <n>` (and `pr_update.jobs`, default `1`) should update up to `n`
repositories at once. `runUpdate` cannot do that in process, because its git, verify and
lease calls are all synchronous: wrapping the per-repository loop in
`Promise.all` would still run one repository at a time. The proposal is that
the standalone CLI runs each repository as a child `pr-update update --repo
<r> --output json`, at most `n` at a time, and merges their reports. Library hosts
keep calling `runUpdate` once per repository themselves.

^summary

## Context

Raised in osdlc/osdlc#848. A run over a dozen repositories is dominated by
fetches, verify runs and repair calls. Repositories share no state: the
attempts store is per-repository files or compare-and-swap refs, and the
lease is a compare-and-swap ref, so parallel repositories need no new locking.

What the code does today:

- `runUpdate` loops `for (const [repo, ...] of groups)` and awaits
  `updateAll` for each. Within a repository the PRs stay sequential, parent
  first, in one worktree.
- `updateAll` runs on typed-git's synchronous `Git`. `RunVerb` returns a
  `CommandResult`, not a promise. `Ports.lease` and `AttemptStore` are
  synchronous too. About 38 `git.*` calls in `update/execute.ts` and both
  `runVerb` call sites are blocking.
- The only awaited work in the loop is `resolveVerifyVerbs` and the repair
  port, which is the agent run. Those can overlap; the git and verify work,
  which is most of the minutes, cannot.
- typed-git has an `AsyncGit` with the same methods, and command-seam has
  `spawnRunnerAsync`, so an async executor is possible.
- `--confirm-push` reads the terminal synchronously and must force `jobs` to
  `1`. Output must stay readable, and JSON stays keyed by `repo` and `number`.
- A forwarded signal (`forwardedSignal()`) must stop new PRs in every
  repository.

## Options considered

Criteria, written before the options: (1) the work really overlaps, not only
the awaits; (2) the diff to a 1100-line executor stays reviewable; (3) every
`Ports` seam a library host supplies keeps working; (4) a signal and
`--confirm-push` behave as they do now.

### A. `Promise.all` over the repository loop

Smallest diff, about 30 lines. Fails criterion 1: the synchronous calls block
the event loop, so only the repair agent and verb resolution overlap. It would
look like parallelism and give almost none.

### B. Make the executor asynchronous

Move `updateAll`, `execute.ts`, the verify runner, `Lease`, `AttemptStore` and
`Generator`/`Resolver` seams to promises, on `AsyncGit` and
`spawnRunnerAsync`. Meets criterion 1 inside one process and shares the signal
state naturally. Fails 2 and 3: it changes the type of every host-supplied
port, a breaking change to the public API, and touches most of
`update/*.ts` plus its tests (well over 600 lines of non-test code). It could
be worth doing for its own sake, but not as the way to get `--jobs`.

### C. One child process per repository (proposed)

The CLI, when `jobs > 1`, runs the survey as today, then spawns at most `jobs`
children of its own binary, each `update --repo <r> --pr <selectors> --jobs 1
--output json` with the parent's other flags. It waits for them with the
async runner, and merges the JSON reports into one `UpdateOutput`. Text output
is rendered from the merged report, so it is not interleaved. Meets 1 (real
processes) and 2 (the new code is a fan-out module and a merge, and the
executor is untouched). Criterion 3 holds because nothing in a host's `Ports`
changes: the host calls `runUpdate` per repository itself if it wants the same.
Criterion 4: `--confirm-push` is refused with `--jobs > 1` as a usage error,
and a signal is forwarded to the children by command-seam's runner.

Costs: each child re-fetches and re-surveys its repository, so a repository
is surveyed twice, and child processes need the same seams (`gh`, git
runners) the parent had, so it works only for the standalone defaults. A test
double supplied through `CliSeams` does not cross the process boundary.

### D. Worker threads

Same isolation as C, but `Ports` are functions and cannot be posted to a
worker, so a host's ports would need rebuilding in each worker. Worse than C
without being simpler.

### E. Do nothing

`jobs` stays `1`. A host that wants parallelism calls `runUpdate` once per
repository from its own processes.

## Decision (proposed)

Option C, behind `--jobs`, as a separate PR once the owner accepts the
trade-offs below. Until then the issue stays open. Defaults and config key as the
issue states: `jobs` default `1`, `--jobs` beats `pr_update.jobs`, and
`--confirm-push` with `jobs > 1` is a usage error, not a silent downgrade, so
the user does not lose the prompt without noticing.

## Consequences

- No change to `Ports`, `UpdateOutcome` or the JSON shape.
- A repository is surveyed once by the parent and once by its child. The
  parent's survey could pass its rows to the child instead, which needs a
  hidden flag or an input file; left out of the first version.
- Test seams do not cross the process boundary, so the fan-out is tested with a
  fake child command, and the merge is tested as a pure function.
- Option B stays open as its own issue if a host wants in-process concurrency.

## Open questions

- Is a double survey acceptable for the first version, or must the child take
  the parent's rows?
- Should `--jobs` with a non-standalone `CliSeams` (an embedding host that
  injects runners) be refused, or fall back to `1` with a note?
- Does command-seam's async runner forward the signal to a child's process
  group on every platform, including Windows? Check before building C.
