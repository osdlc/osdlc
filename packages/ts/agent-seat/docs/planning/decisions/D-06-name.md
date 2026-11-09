---
id: D-06
type: decision
state: accepted
created: 2026-11-07
---

# D-06: Package name

## Decision

- The package is `@osdlc/agent-seat`, published to npm from this repository.
- The types keep the word "host" for the app a session opens in (`Host`, `hostRegistry`): a host
  gives an agent a seat.

## Why

- The working name, `agent-host`, collides with Visual Studio Code's "Agent Host" and the Agent
  Host Protocol (`@microsoft/agent-host-protocol`), in the same field. There, an agent host is a
  process that owns agent sessions; this package opens sessions in apps the person already
  uses, VS Code among them. The same words would mean two things.
- `agent-host` is also taken on crates.io and PyPI, which would block a twin in another
  language.
- `agent-seat` is free on npm (scoped and unscoped), crates.io and PyPI (checked 2026-11-07).
  `agent-pane` was the other candidate; "pane" fits editors poorly.

## Consequences

Renaming again means a new package and a deprecation of this one. Treat the name as fixed.
