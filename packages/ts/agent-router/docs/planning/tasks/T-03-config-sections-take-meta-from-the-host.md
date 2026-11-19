---
id: T-03
type: task
state: open
created: 2026-11-07
---

# T-03: The config sections take their meta from the host

## Goal

The `./config` section factories carry no host's vocabulary. A host passes its own section meta.

## Today

`profilesSection`, `routingSection` and `routerSection` take `consumers` and `description` from the
host, but each hard-codes the rest of its meta block: `category`, `layers`, `enforcement` and
`runs_in`. Those values are the first host's words. The subpath is experimental
([D-02](../decisions/D-02-version-line-and-stability.md)), so this can change in a patch release.

## Approach

1. Decide the option shape: a `meta` argument merged over the package's fixed fields, or the
   individual terms, matching `@osdlc/config-layers`' `defineConfigSection`.
2. Keep a default only where it is neutral, or none.
3. Grep the package for host words in code once it lands.

## Acceptance criteria

- [ ] Each factory takes its meta terms from the caller.
- [ ] No host-specific category, layer or run-context word is left in the package's code.
