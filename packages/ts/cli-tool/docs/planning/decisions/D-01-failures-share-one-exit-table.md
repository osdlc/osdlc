---
id: D-01
type: decision
state: accepted
created: 2026-10-21
---

# D-01: Classified failures share one message form and one exit table

## Decision

- `runMain` renders a thrown failure (a `FailureError`, which includes
  `CommandFailed`, or a bare `Failure`) as `<tool name>: <message> <hint>` on
  stderr and exits with the code for the failure's `kind`. Any other thrown
  error keeps today's behaviour: its message and exit 1.
- The table is `FAILURE_EXIT`, keyed by kind, exported from this package. It
  has four codes, one per category a script acts on differently, following the
  dev standard "a new distinct exit code for each distinct failure category":
  - 22 `missingTool`: `not-installed`, `not-executable`. Install the program.
  - 23 `service`: `not-authenticated`, `missing-token`, `not-found`, `http`,
    `unreadable`, `unsupported`. The service answered and refused, or its
    answer was unusable. Fix the credentials or the name.
  - 24 `repository`: `not-a-repo`, `no-remote`, `bad-remote`, `bad-cwd`. There
    is nothing to work on here.
  - 25 `unreachable`: `network`, `remote-unreachable`, `timeout`,
    `rate-limited`. The same command may work later.
- Any other kind (`exit`, `spawn`, `signal`, `aborted`, `output-cap`) exits 1.
  It is an ordinary failed run, and nothing distinguishes it for a script.
- `failWith(ctx, failure, { name })` prints the same line and returns the code,
  for a `main` that holds a `Result` and returns instead of throwing.
- The line carries the message and the hint. The `detail` (a tool's raw
  stderr) is not printed: this package has no verbose switch, and adding one
  here would make every tool's flags depend on it.
- The four codes sit in the tool band (10-63). A tool numbering its own
  outcomes avoids 22-25.

## Why

- Before this, each CLI mapped a missing `gh` or a dead network to its own
  message and number, so two tools built on the same libraries disagreed. The
  libraries now classify; the one place that renders and numbers belongs here,
  with the exit-code rule.
- 22, 23 and 24 are the codes `@osdlc/pr-update` already documented for a
  missing tool, an unusable code host and an unreadable remote, so its codes
  stay stable. What changed is that a network failure moves out of 23 into 25:
  "retry later" and "fix your token" call for different scripts.
- Rate limiting is in 25, not 23: the credentials are fine and waiting fixes
  it.
- `not-found` is in 23 and not 24: a host that has no such repository or PR
  answered; "no repository here" is about the local checkout.

## Consequences

- A new failure kind in a layer below needs a line in `FAILURE_EXIT`, or it
  exits 1. The tests list every kind the layers define.
- A tool that wants a different mapping for one kind catches the failure
  itself and returns its own code.
