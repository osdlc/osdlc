---
id: D-01
type: decision
state: accepted
created: 2026-10-19
---

# D-01: Package name

## Decision

- The package is `@osdlc/detect-harness`, published to npm from this
  repository, `packages/ts/detect-harness`.
- It replaces `@osdlc/agent-plugin`. That name was only a placeholder on npm
  (version `0.0.1-stage`, not usable) and no release was made under it. The
  placeholder is deprecated with a pointer to this package.
- The first release is 0.4.0. The versions before it were used inside one
  project and were never published, so the changelog lists them as history.

## Why

- The package finds the coding-agent harnesses on a machine and reads what
  each has configured. `detect-harness` says that. `agent-plugin` named an
  earlier, narrower job: a model of one plugin folder. That job is now one
  experimental entry, `./model`, and no longer the point of the package.
- The name is a verb and its object, like the package's main function,
  `detect()`.

## Consequences

- Renaming the package again means a new package and a deprecation of this
  one. Treat the name as fixed.
- Code that used the old name changes its import. The plugin reader is
  `readPlugin` on `@osdlc/detect-harness/model`.
