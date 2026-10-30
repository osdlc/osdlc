---
type: Harness Fact
title: "Kiro: Hook configuration"
description: "Hook configuration in Kiro, as observed over time."
tags: [hooks]
harness: kiro
subject: hooks/config
observations:
  - value: { location: ".kiro/hooks/*.json", kind: JSON config }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Hook configuration](/subjects/hooks/config.md) in
[Kiro](/harnesses/kiro.md). Where hooks are configured and whether they are shell commands or code
plugins.

## Observations

- 2026-08-08: location: .kiro/hooks/*.json; kind: JSON config.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
