---
number: 81
title: Versions and lockfile
detail: corpus-schema spec
status: todo
type: functional
milestone: "[m-vault-install](../milestones/m-vault-install.md)"
after:
  - "[36 Release 0.4.0](36%20Release%200.3.0.md)"
---

Spec the vault install shape in [D18](../decisions/D18%20Vaults%20install%20corpora%20outside%20the%20vault.md). A package source in `extends` and `references` may carry a version range, such as `@acme/corpus-nutrition@^2.3`. The spec names the lockfile `corpus-schema.lock.yaml`, sets its format (per package: name, exact version, integrity hash, prefix) and says what it means. It also sets the resolution order: when a lockfile exists it wins, and `node_modules` is ignored. Add conformance cases for ranges, the lockfile and the order. After 36.
