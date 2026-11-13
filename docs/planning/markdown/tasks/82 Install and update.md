---
number: 82
title: Install and update
detail: corpus-schema
status: todo
type: functional
milestone: "[m-vault-install](../milestones/m-vault-install.md)"
after:
  - "[81 Versions and lockfile](81%20Versions%20and%20lockfile.md)"
---

`corpus-schema install` fetches each package in the root file with pacote into a cache outside the vault, one folder per name and version. It checks the integrity hash and writes the lockfile. `corpus-schema update` moves each package to a newer version inside its range and rewrites the lockfile. The cache location per OS is an open point in D18. After 81.
