---
type: Harness Fact
title: "Grok Build: MCP config file"
description: "MCP config file in Grok Build, as observed over time."
tags: [mcp]
harness: grok-build
subject: mcp/config-file
observations:
  - value: { file: config.toml, key: "[mcp_servers]", format: TOML }
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
[Grok Build](/harnesses/grok-build.md). The file and key that hold MCP server definitions, and its
format.

## Observations

- 2026-08-08: file: config.toml; key: [mcp_servers]; format: TOML.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
