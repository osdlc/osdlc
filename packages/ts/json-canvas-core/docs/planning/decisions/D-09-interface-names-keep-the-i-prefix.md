---
id: D-09
type: decision
state: accepted
created: 2026-11-22
---

# D-09: Interface names keep the I prefix

## Decision

The types of the format keep their `I` prefix: `ICanvasContent`, `INode`, `ITextNode`, `IFileNode`,
`ILinkNode`, `IGroupNode`, `IBaseNode` and `IEdge`.

## Why

- A rename would break every consumer for no change in behaviour.
- The prefix is a convention the package has used from its first version, and the renderer built on
  it uses the same names throughout.

## Consequences

- A user who wants unprefixed names can alias them on import.
