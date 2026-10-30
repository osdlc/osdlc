---
type: Harness Fact
title: "Grok Build: Hook configuration"
description: "Hook configuration in Grok Build, as observed over time."
tags: [hooks]
harness: grok-build
subject: hooks/config
observations:
  - value: { location: ".grok/hooks/*.json", kind: shell commands in JSON config, also_reads: Claude and Cursor hooks }
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
[Grok Build](/harnesses/grok-build.md). Where hooks are configured and whether they are shell
commands or code plugins.

## Observations

- 2026-08-08: location: .grok/hooks/*.json; kind: shell commands in JSON config; also reads: Claude
  and Cursor hooks.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
