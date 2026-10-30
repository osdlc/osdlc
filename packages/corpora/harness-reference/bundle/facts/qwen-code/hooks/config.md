---
type: Harness Fact
title: "Qwen Code: Hook configuration"
description: "Hook configuration in Qwen Code, as observed over time."
tags: [hooks]
harness: qwen-code
subject: hooks/config
observations:
  - value: { location: "settings `hooks`", kind: shell commands in JSON config, events: Claude-style }
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
[Qwen Code](/harnesses/qwen-code.md). Where hooks are configured and whether they are shell commands
or code plugins.

## Observations

- 2026-08-08: location: settings `hooks`; kind: shell commands in JSON config; events:
  Claude-style.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
