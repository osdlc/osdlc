---
id: D-03
type: decision
state: accepted
created: 2026-10-18
---

# D-03: Wire names

## Decision

- The env tags are named `OBSERVE_*`: `OBSERVE_SESSION`, `OBSERVE_RUN`,
  `OBSERVE_SUBJECT`, `OBSERVE_INVOCATION`, `OBSERVE_INVOCATION_PID`,
  `OBSERVE_TASK`, `OBSERVE_PROJECT_ROOT`, `OBSERVE_PINNED_CMD`,
  `OBSERVE_AUTHOR` and `OBSERVE_MACHINE_ID`.
- Writers set both the `OBSERVE_*` name and the older `SDLC_*` name, with one
  value. Readers take the `OBSERVE_*` value. If the `SDLC_*` name is set to a
  different value, the `SDLC_*` value wins.
- The record and `launched` event keys are `harness`, `launchFlags` and
  `pin`. The schemas also read the older keys `engine`, `claudeFlags` and
  `sdlcPin`. What the package writes uses the new keys.
- The machine-id seeds (`sdlc-machine:` and `sdlc-machine-host:`) and the
  cache path (`~/.cache/sdlc/machine-id`) keep their names.

## Why

- The tags and keys are the format that launchers share. The names should
  match the package, and the first public release is the cheapest time to
  change them.
- A launcher from an older version may run inside a session of a newer
  version. It sets only `SDLC_*`, so the inherited `OBSERVE_*` value is stale.
  The `SDLC_*` value is the one set closest to the process, so it wins.
- Existing stores must load. Reading the old keys does that without a
  migration.
- A new seed or path would change every machine id, and records would no
  longer match the machine that wrote them.

## Consequences

- Writers keep writing both tag names until a release drops the `SDLC_*`
  names. That release is a breaking change, as is dropping the old record
  keys.
- The `sdlc` names that remain are the format's names, not the package's.
