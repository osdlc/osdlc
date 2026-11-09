---
id: D-03
type: decision
state: accepted
created: 2026-11-07
---

# D-03: `sessionId` is the caller's id on every request

## Decision

- `sessionId` means the caller's id for a session on every request type: `SessionRequest`,
  `CommandRequest`, `SendRequest` and `FindQuery`. A host binds the pane it opens to it, and a
  later call with the same `sessionId` reaches that pane.
- The harness's own session id is `harnessSessionId`: the id a launch presets
  (`ClaudeLaunchFlags.harnessSessionId`, Claude's `--session-id`) and the one `session()`
  returns.

## Why

Before the first release, `SessionRequest` called the caller's id `sdlcSessionId`, after the
first consumer, because its `sessionId` was already Claude's preset id. The same concept had two
names, one of them a product's name, and the same name meant two things depending on the type.

## Options considered

- **Rename only `sdlcSessionId`** (for example to `bindingId`). Removes the product name, but
  keeps one concept under two names.
- **One name per concept (chosen).** `sessionId` is always the caller's; `harnessSessionId` is
  always the harness's.
