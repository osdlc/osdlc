---
type: decision
state: accepted
created: 2026-10-20
---

# The name is `@osdlc/typed-gh`

## Decision

- The package is `@osdlc/typed-gh` on npm, in the `osdlc` scope.
- The owner chose the name.

## Why

- `typed-gh` says what it is: a typed client for `gh`. It pairs with
  `@osdlc/typed-git`, which uses the same pattern for git.
- The `osdlc` scope puts it beside `@osdlc/command-seam` and
  `@osdlc/typed-git`, the packages it builds on.
- A scope keeps the name free of clashes with unscoped packages.

## Consequences

- The name is part of the public API. Renaming it later means publishing a new
  package and deprecating this one.
- The package is about the `gh` CLI. It would not suit a client that talks to
  GitHub without `gh`.
