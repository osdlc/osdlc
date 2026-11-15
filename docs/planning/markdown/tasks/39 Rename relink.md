---
number: 39
title: Rename relink
detail: markdown-reshape
status: todo
type: functional
milestone: "[m-model](../milestones/m-model.md)"
---

Rename the markdown-relink crate to markdown-reshape. Reshape means changing how notes are arranged
without changing what they say. Steps:

- Publish the crate under the new name.
- Deprecate markdown-relink on crates.io. This is an owner step.
- Rename the vault terms in its code, such as `VaultFacts`.
- Switch the determined notes app, which uses it through its Rust backend. skillwright no longer
  uses it.
