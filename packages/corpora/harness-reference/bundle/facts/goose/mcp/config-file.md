---
type: Harness Fact
title: "Goose: MCP config file"
description: "MCP config file in Goose, as observed over time."
tags: [mcp]
harness: goose
subject: mcp/config-file
observations:
  - value: { file: config.yaml, key: extensions, format: YAML }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [MCP config file](/subjects/mcp/config-file.md) in
[Goose](/harnesses/goose.md). The file and key that hold MCP server definitions, and its format.

## Observations

- 2026-08-08: file: config.yaml; key: extensions; format: YAML.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
