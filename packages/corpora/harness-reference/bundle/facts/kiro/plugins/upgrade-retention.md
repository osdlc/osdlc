---
type: Harness Fact
title: "Kiro: Old plugin versions"
description: "Old plugin versions in Kiro, as observed over time."
tags: [plugins]
harness: kiro
subject: plugins/upgrade-retention
observations:
  - value: {"update": "refreshes from the remote repository and applies the latest version"}
    since: null
    until: null
    observed: "2026-11-04"
    source: kiro-powers-installation
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Do older power versions stay on disk after an update?"
    observed: "2026-11-04"
    source: kiro-powers-installation
sources:
  - id: kiro-powers-installation
    resource: "https://kiro.dev/docs/powers/installation/"
    title: "Kiro docs: Install powers"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [Kiro](/harnesses/kiro.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Observations

- 2026-11-04: update: refreshes from the remote repository and applies the latest version. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-powers-installation]

  > The power refreshes from the remote repository and applies the latest version.

## Open questions

- Do older power versions stay on disk after an update?[^kiro-powers-installation]

[^kiro-powers-installation]: Kiro docs: Install powers
