---
type: Harness Fact
title: "pi: Hook configuration"
description: "Hook configuration in pi, as observed over time."
tags: [hooks]
harness: pi
subject: hooks/config
observations:
  - value: { kind: TypeScript extensions, shell_hooks: false }
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
[pi](/harnesses/pi.md). Where hooks are configured and whether they are shell commands or code
plugins.

## Observations

- 2026-08-08: kind: TypeScript extensions; shell hooks: `false`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
