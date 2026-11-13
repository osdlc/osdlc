---
number: 55
title: Augment
detail: namespaced keys
status: todo
type: functional
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
after:
  - "[47 Merge packs](47%20Merge%20packs.md)"
  - "[44 Flatten extends](44%20Flatten%20extends.md)"
---

Augment with namespaced keys. A pack adds fields to another pack's kind under its own prefix, such
as `harness:model`. A strict type admits keys with the prefix of a profile that isn't loaded, so a
record with extra fields still passes. After 47 and 44.
