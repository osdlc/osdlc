---
type: Harness Fact
title: "Grok Build: Marketplace"
description: "Marketplace in Grok Build, as observed over time."
tags: [plugins]
harness: grok-build
subject: plugins/marketplace
observations:
  - value: { supported: true, note: reads Claude Code marketplaces zero-config }
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
[Grok Build](/harnesses/grok-build.md). Whether plugins are distributed through a marketplace, and
its format.

## Observations

- 2026-08-08: supported: `true`; note: reads Claude Code marketplaces
  zero-config.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
