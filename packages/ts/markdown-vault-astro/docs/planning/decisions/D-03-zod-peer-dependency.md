---
id: D-03
type: decision
state: accepted
created: 2026-11-08
---

# D-03: zod is a peer dependency

## Decision

`zod` is a peer dependency, `^4`, and the package uses zod 4 inside.

## Why

`wikilinkRef` returns a schema that a site composes with Astro's `z`. Astro 7 depends on zod 4, so a zod 3 schema would mix two major versions in one content-collection schema. `@osdlc/markdown-contract` makes the same choice.

## Consequences

A site on Astro 6 or earlier, which ships zod 3, installs zod 4 beside it to use `wikilinkRef`.
