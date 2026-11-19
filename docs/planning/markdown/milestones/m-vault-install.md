---
title: Vault install
order: 13
phase: store
tasks:
  - "[81 Versions and lockfile](../tasks/81%20Versions%20and%20lockfile.md)"
  - "[82 Install and update](../tasks/82%20Install%20and%20update.md)"
  - "[83 Resolve from the cache](../tasks/83%20Resolve%20from%20the%20cache.md)"
  - "[84 Vault guide](../tasks/84%20Vault%20guide.md)"
---

A plain Obsidian vault extends a profile and references a corpus with no `package.json` and no
`node_modules`. Packages install into a cache outside the vault, and a lockfile beside the root file
pins them ([D18](../decisions/D18%20Vaults%20install%20corpora%20outside%20the%20vault.md)). It is
not on the beeline and comes after corpus-schema 0.4.0.
