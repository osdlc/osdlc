---
id: D-06
type: decision
state: accepted
created: 2026-10-18
---

# D-06: Frozen rosters

## Decision

`BUILTIN_AGENTS` and `EFFORT_LEVELS` are frozen at run time with
`Object.freeze`, and typed `readonly`.

## Why

A caller that pushes onto either list would change what `adapterFor`,
`detectAgents` and the adapters see, for every caller in the process. The
types guard against this at compile time only.

## Consequences

A caller that needs its own list copies it with `[...BUILTIN_AGENTS]`.
