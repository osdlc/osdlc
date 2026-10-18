---
id: D-04
type: decision
state: accepted
created: 2026-10-18
---

# D-04: Errors

## Decision

- `callAgent` does not throw when the agent fails. It resolves with
  `ok: false` and `error: { reason, detail }`.
- `CallError.reason` is open. Today it is `spawn-failed`, `timeout`,
  `nonzero-exit` or `agent-error`. A minor release may add a reason, and the
  TSDoc tells callers to keep a default branch.
- The promise rejects when planning throws (`templateAdapter` throws an
  `Error` when the spec's model or effort does not fit its template, and
  `customAdapter` passes on what its `args` function throws), when a
  `TempFile.name` is not a plain file name, or when the temp directory for the
  plan's temp files cannot be created or written. The `callAgent` `@throws` is
  the full list. `planCall` and `modelArgs` throw the same way as planning.
- A parser that throws on the output does not reject. The result is
  `ok: false` with reason `agent-error`.
- There is no error class. Each function that can throw says so with
  `@throws`, and a test checks that list.

## Why

- A closed reason would make every new failure mode a breaking change.
- An agent that fails is a normal result for a tool that calls agents, so it
  is data. A caller bug or a broken temp directory is an exception.

## Consequences

Adding an error class later is possible without a break, because `Error`
stays valid.
