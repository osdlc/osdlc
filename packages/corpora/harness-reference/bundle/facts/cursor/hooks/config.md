---
type: Harness Fact
title: "Cursor: Hook configuration"
description: "Hook configuration in Cursor, as observed over time."
tags: [hooks]
harness: cursor
subject: hooks/config
observations:
  - value: { location: ".cursor/hooks.json", kind: shell commands in JSON config }
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
[Cursor](/harnesses/cursor.md). Where hooks are configured and whether they are shell commands or
code plugins.

## Observations

- 2026-08-08: location: .cursor/hooks.json; kind: shell commands in JSON
  config.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
