---
type: decision
state: accepted
created: 2026-10-19
---

# Three modes: query, mutation, raw

## Decision

- A query returns a parsed value, or `null` when `gh` failed or its output
  could not be read. A query never throws for a failed command.
- A mutation throws `CommandFailed` on a non-zero exit. The error carries the
  argv and the full result.
- `raw(argv)` returns the `CommandResult` and lets the caller decide.
  `rawChecked(argv)` throws like a mutation.
- A query returns `null`, never `[]`, for a call it could not make.
- `Gh` and `AsyncGh` follow the same contract. Both run one verb table, so the
  two cannot drift.
- A verb is plain data: argv, a `checked` flag, optional stdin and a `parse`
  function. Nothing in the verb table starts a process.

## Why

- `prList()` returning `[]` means this repository has no open PRs. `null`
  means the caller could not ask. If both read as an empty list, an expired
  credential becomes "nothing to do".
- A mutation that fails and returns normally leaves the caller believing it
  worked. The caller should have to opt out of an error, not into one.
- `gh` does not cover every command. An escape hatch keeps a caller from
  working around the client.

## Consequences

- Callers check for `null`.
- A verb that changes state sets `checked: true`. A new verb must pick a mode.
- A parse error on good output also becomes `null`, so `null` does not say
  which half failed. Use `raw` when the cause matters.
