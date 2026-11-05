---
type: Harness Fact
title: "Amp: Old plugin versions"
description: "Old plugin versions in Amp, as observed over time."
tags: [plugins]
harness: amp
subject: plugins/upgrade-retention
observations: []
open:
  - question: "After amp plugins update or amp skill update, do old versions stay on disk?"
    observed: "2026-11-04"
    source: amp-plugins
sources:
  - id: amp-plugins
    resource: "https://ampcode.com/docs/markdown/customize/plugins"
    title: "Amp docs: Plugins"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [Amp](/harnesses/amp.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Open questions

- After amp plugins update or amp skill update, do old versions stay on disk?[^amp-plugins]

[^amp-plugins]: Amp docs: Plugins
