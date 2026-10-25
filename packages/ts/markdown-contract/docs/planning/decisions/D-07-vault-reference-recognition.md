---
id: D-07
type: decision
state: accepted
created: 2026-10-25
---

# D-07: Vault references are part of the public API

## Decision

- `extractVaultRefs` and `VaultRef` are public exports of `./core` and of the
  root entry. They find `[[wikilink]]` and `![[transclusion]]` references in
  flattened text.
- They are stable, not experimental.
- `parse()` still leaves these references as text in the tree. Recognition is
  a string pass the caller runs, for example over `SectionView.text('all')`.
- The Rust peer of this package has the same function, `extract_vault_refs`,
  with the same rules.

## Why

- Linking between documents is part of what a contract can check. A rule that
  tests whether a wikilink target exists, or whether a `#^block-id` fragment
  has an anchor, needs the references extracted the same way every time.
- The function was an internal test helper in the first published release.
  That left every user to write their own pattern.
- The shape is small and fixed: `kind`, `target`, `alias`, `fragment` and
  `raw`. Nothing in it is waiting on a design choice, so it does not need the
  experimental tier of [D-03](D-03-stability-tiers.md).

## Consequences

- A change to what counts as a reference, or to a field of `VaultRef`, is a
  breaking change and is marked `Breaking` in the CHANGELOG.
