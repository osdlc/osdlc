---
type: decision
state: accepted
created: 2026-10-19
---

# Shell out to `gh`

## Decision

- Every GitHub call runs the `gh` CLI. The package does not speak REST or
  GraphQL itself. The one GraphQL query, for review threads, also goes
  through `gh api graphql`.
- The package reads, stores and forwards no token. `gh` finds its own
  credentials.
- `gh` runs through the injectable `CommandRunner` of `@osdlc/command-seam`,
  with an argument list and no shell. Never a raw `child_process` call.
- Output is read through `gh`'s `--json` field lists. Each verb names the
  fields it needs.

## Why

- The credential already exists in the user's keychain. A library that
  reaches for `GITHUB_TOKEN` is a library that can leak one.
- `gh` already handles login, token refresh, SSO and GitHub Enterprise hosts.
  Copying that work would drift from it.
- A fake runner lets a whole test suite run offline, with no login and no
  `gh` binary.

## Consequences

- `gh` must be on `PATH` and logged in. `installed()` and `authenticated()`
  ask about each half, and `ready()` asks both.
- Each call starts a process. A fan-out uses `AsyncGh`.
- The package depends on `gh`'s flags and JSON field names, not on a stable
  HTTP API. A new `gh` can change them.
- The repository a call acts on is the one `gh` resolves from the working
  directory. See [SECURITY.md](../../SECURITY.md).
