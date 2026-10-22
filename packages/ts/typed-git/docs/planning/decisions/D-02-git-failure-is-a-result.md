---
id: D-02
type: decision
state: accepted
created: 2026-10-21
---

# D-02: `try` returns a `Result<T, GitFailure>`

## Decision

- `git.try.*` returns `Result<T, GitFailure>` from `@osdlc/result`. The
  `GitOutcome<T>` type is removed. This is a hard cutover: there is no alias
  and no re-export of the old name.
- `GitFailure` is a `Failure<GitFailureKind>`. Its `kind` is every
  `@osdlc/command-seam` kind plus `not-a-repo`, `no-remote`,
  `remote-unreachable`, `not-authenticated` and `not-found`, read from git's stderr (the
  table is in the README).
- `GitFailure.cause` is the `CommandFailed` it was classified from, so the
  full `CommandResult` is still reachable: `error.cause.result`.
- The checked door (the plain verb, throws `CommandFailed`) and the soft door
  (`git.soft.*`, the verb's absence value) are unchanged. `CommandFailed` is
  now also a `FailureError`, so a caller that catches either reaches
  `failure`.
- A declared absence is still `{ ok: true }`. Classification applies only to
  failures.
- `not-installed` carries the hint `Install git from https://git-scm.com.`
  because this layer knows the tool; `@osdlc/command-seam` does not.

## Why

- `try` already returned `{ ok, value } | { ok, error }`. Adopting
  `@osdlc/result` changes the error from a thrown class to a value with a
  `kind`, so a caller can `switch` on it, exhaustively, without matching
  stderr itself.
- A caller that shows a failure to a person (a CLI, a bot comment) needs a
  sentence and a next step. `message` and `hint` are written here, by the
  layer that knows git, so no caller keeps its own table.
- Matching English stderr is fragile. A pattern that does not match falls
  back to `exit` with git's first line, so a translated git degrades to the
  old behaviour and never to a wrong kind.
- `cause` keeps the raw result for the rare caller that needs it, as Rust's
  `source()` does.

## Consequences

- Callers that read `outcome.error.result`, `.error.argv` or `.error.binary`
  read `outcome.error.cause.result`, or the copies on the failure itself
  (`error.argv`, `error.binary`, `error.exitCode`).
- Callers that only test `outcome.ok` are unchanged.
