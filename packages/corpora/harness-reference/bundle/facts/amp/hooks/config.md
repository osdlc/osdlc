---
type: Harness Fact
title: "Amp: Hook configuration"
description: "Hook configuration in Amp, as observed over time."
tags: [hooks]
harness: amp
subject: hooks/config
observations:
  - value: { kind: JS plugins, shell_hooks: false }
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
[Amp](/harnesses/amp.md). Where hooks are configured and whether they are shell commands or code
plugins.

## Observations

- 2026-08-08: kind: JS plugins; shell hooks: `false`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
