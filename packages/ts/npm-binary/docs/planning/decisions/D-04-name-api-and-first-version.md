---
id: D-04
type: decision
state: accepted
created: 2026-11-07
---

# D-04: The name, the public API and the first version

## Decision

- The package is `@osdlc/npm-binary`, developed and released from
  [osdlc/osdlc](https://github.com/osdlc/osdlc).
- The public API of the first release is what the README's API section
  lists. The platform package lookup table the launcher embeds is internal:
  `renderLauncher` writes it, and no caller needs it.
- The first version on npm is 0.1.1. 0.1.0 is kept in the CHANGELOG as an
  unpublished version. 0.1.1 is everything since: the terminal SIGINT rule of
  [D-02](D-02-launcher-signals-and-exit.md), and the changes made to prepare
  the first release, some of which change behaviour.
- The package stays on 0.x. A breaking change bumps the minor version.

## Why

- The scoped name is free on npm and matches the other `@osdlc` libraries.
  The unscoped `npm-binary` is a different package.
- Keeping the lookup table internal leaves its shape free to change with the
  launcher.
- The version continues from the one change made while the package was
  internal (the SIGINT rule, a fix: 0.1.0 to 0.1.1). The changes made to
  prepare the first release go into that same version without a further bump:
  no version with the earlier behaviour was ever published, so nobody depends
  on it.
