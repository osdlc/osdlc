---
number: 83
title: Resolve from the cache
detail: corpus-schema
status: todo
type: functional
milestone: "[m-vault-install](../milestones/m-vault-install.md)"
after:
  - "[82 Install and update](82%20Install%20and%20update.md)"
---

`sync` and `validate` resolve `extends` and `references` from the cache when the lockfile is present, by the order task 81 sets. They need no network once the cache is warm. After 82.
