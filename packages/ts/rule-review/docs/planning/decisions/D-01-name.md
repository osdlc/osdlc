---
id: D-01
type: decision
state: accepted
created: 2026-11-07
---

# D-01: Package and command name

## Decision

- The package is `@osdlc/rule-review` on npm, published from this repository,
  `packages/ts/rule-review`. The command is `rule-review`.
- It was developed as `@osdlc/agent-dev` with the command `dfv`, and was never
  published under those names. Neither stays as an alias.
- The functions take the name: `reviewChanges` and `review`, with
  `ReviewConfig`, `ReviewJob`, `ReviewRun` and `ReviewOptions`.

## Why

- The name says what the package does: it reviews a change against rule files.
  `agent-dev` named how it works and not what it is for, and `dfv` named
  nothing a reader could guess.
- The bare npm name `dfv` belongs to an unrelated package, so `npx dfv` would
  have run someone else's code.
- `diff-verify` was weighed and dropped: `diff-verify-cli` is an unrelated
  package that verifies generated files, and the name would be read the same
  way.
- `rule-review`, bare and as `@osdlc/rule-review`, was free on npm, crates.io
  and PyPI on 2026-11-07, and no package in the same space uses a name close
  to it. On GitHub the package lives in `osdlc/osdlc`, so it needs no
  repository or account of its own; a GitHub user or organisation named
  `rule-review` was not checked.

## Consequences

- `@osdlc/agent-dev` on npm holds only a placeholder. It is deprecated with a
  message that names this package.
- A later rename is a new package: every consumer changes its imports.
