---
type: Harness Fact
title: "Copilot CLI: Marketplace"
description: "Marketplace in Copilot CLI, as observed over time."
tags: [plugins]
harness: copilot-cli
subject: plugins/marketplace
observations:
  - value: { supported: true, file: marketplace.json, note: "with .github/skills/, the native channel" }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Marketplace](/subjects/plugins/marketplace.md) in
[Copilot CLI](/harnesses/copilot-cli.md). Whether plugins are distributed through a marketplace, and
its format.

## Observations

- 2026-08-08: supported: `true`; file: marketplace.json; note: with .github/skills/, the native
  channel.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
