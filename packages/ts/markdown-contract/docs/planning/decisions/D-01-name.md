---
id: D-01
type: decision
state: accepted
created: 2026-10-18
---

# D-01: Package name

## Decision

- The package is `@osdlc/markdown-contract`, published to npm from this
  repository, `packages/ts/markdown-contract`.
- The command it installs is `markdown-contract`.

## Why

- The name says what the package does: it checks a markdown document against a
  contract for its structure.
- It lives under the `@osdlc` scope with the other libraries in this
  repository, so one trusted-publishing setup and one release flow cover it.

## Consequences

- Renaming the package later means a new package and a deprecation of this
  one. Treat the name as fixed.
