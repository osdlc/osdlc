---
type: Harness Fact
title: "Kiro: Plugin install copy"
description: "Plugin install copy in Kiro, as observed over time."
tags: [plugins]
harness: kiro
subject: plugins/install-copy
observations: []
open:
  - question: "Does installing a power copy the folder whole, and do exec bits and symlinks survive?"
    observed: "2026-11-04"
    source: kiro-powers-installation
sources:
  - id: kiro-powers-installation
    resource: "https://kiro.dev/docs/powers/installation/"
    title: "Kiro docs: Install powers"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Kiro](/harnesses/kiro.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Open questions

- Does installing a power copy the folder whole, and do exec bits and symlinks survive?[^kiro-powers-installation]

[^kiro-powers-installation]: Kiro docs: Install powers
