---
id: D-07
type: decision
state: accepted
created: 2026-10-18
---

# D-07: Helper types for model types

## Decision

The package exports `SessionEventOfModel`, `NewSessionEventOfModel` and
`SessionRecordOfModel`. A caller writes
`SessionEventOfModel<typeof model>` to name its event type. A session model
has no field that exists only to carry types.

## Why

- The event and record types depend on the caller's vocabulary, so the
  package cannot export fixed types.
- A field that holds nothing at run time, read only through `typeof`, fails if
  code reads it. A helper type gives the same result with no such field.

## Consequences

- Adding a model type means adding a helper, not a field.
