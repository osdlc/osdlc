---
id: D-05
type: decision
state: accepted
created: 2026-10-18
---

# D-05: zod is a peer dependency

## Decision

`zod` is a peer dependency, `^4`. The package does not bundle it.

## Why

- The schemas are part of the public surface. `defineSessionModel` takes the
  caller's own zod schemas for harness, host and launch flags, and
  `LogEnvelopeSchema` is extended by the caller.
- Zod schemas and types cross the package boundary. The caller's zod and
  this package's zod must be the same copy, so the types and `instanceof`-style
  checks match. A peer dependency makes the caller's copy the only one.

## Consequences

- A caller installs `zod` 4 next to the package.
- Moving to a later zod major version is a breaking change.
