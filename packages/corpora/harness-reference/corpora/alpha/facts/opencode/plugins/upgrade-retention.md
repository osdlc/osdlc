---
type: Harness Fact
title: "OpenCode: Old plugin versions"
description: "Old plugin versions in OpenCode, as observed over time."
tags: [plugins]
harness: opencode
subject: plugins/upgrade-retention
observations: []
open:
  - question: "After an npm plugin upgrade, do old versions stay in ~/.cache/opencode/node_modules/?"
    observed: "2026-11-04"
    source: opencode-plugins
sources:
  - id: opencode-plugins
    resource: "https://opencode.ai/docs/plugins"
    title: "OpenCode docs: Plugins"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [OpenCode](/harnesses/opencode.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Open questions

- After an npm plugin upgrade, do old versions stay in ~/.cache/opencode/node_modules/?[^opencode-plugins]

[^opencode-plugins]: OpenCode docs: Plugins
