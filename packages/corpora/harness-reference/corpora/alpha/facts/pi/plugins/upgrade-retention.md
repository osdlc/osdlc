---
type: Harness Fact
title: "pi: Old plugin versions"
description: "Old plugin versions in pi, as observed over time."
tags: [plugins]
harness: pi
subject: plugins/upgrade-retention
observations: []
open:
  - question: "After pi update, do older package versions or checkouts stay on disk? The docs say updates reconcile the checkout but do not move a configured ref."
    observed: "2026-11-04"
    source: pi-packages
sources:
  - id: pi-packages
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/packages.md"
    title: "Pi docs: Pi Packages (main at d57c2d2)"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [pi](/harnesses/pi.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Open questions

- After pi update, do older package versions or checkouts stay on disk? The docs say updates reconcile the checkout but do not move a configured ref.[^pi-packages]

[^pi-packages]: Pi docs: Pi Packages (main at d57c2d2)
