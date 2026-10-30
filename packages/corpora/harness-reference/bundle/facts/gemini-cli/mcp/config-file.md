---
type: Harness Fact
title: "Gemini CLI: MCP config file"
description: "MCP config file in Gemini CLI, as observed over time."
tags: [mcp]
harness: gemini-cli
subject: mcp/config-file
observations:
  - value: { file: settings.json, key: mcpServers, format: JSON }
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
[Gemini CLI](/harnesses/gemini-cli.md). The file and key that hold MCP server definitions, and its
format.

## Observations

- 2026-08-08: file: settings.json; key: mcpServers; format: JSON.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
