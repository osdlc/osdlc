---
id: D-08
type: decision
state: accepted
created: 2026-11-22
---

# D-08: One normalisation for `scanVault` and `createVaultIndex`

## Decision

Both builders produce a `VaultIndex` through the same code: file metadata is derived from the
path the same way, tags are normalised by the same function (`#` removed, duplicates dropped,
frontmatter `tags` and `tag` both read), and links are resolved and inverted into backlinks by one
function, `resolveVaultLinks`. `createVaultIndex` resolves only when `resolveLinks` is set.

## Why

- A consumer that builds an index from its own data, a web client for example, must get the
  answers a scan of the same notes would give.
- Two copies of the rules would drift. One copy has one test suite.

## Consequences

- The shared code lives in the module that `createVaultIndex` also imports, so that module loads
  no `node:` module at the top. `scanVault` loads `node:fs` on first use, and a test checks the
  rule, so a browser bundle can import `createVaultIndex`.
