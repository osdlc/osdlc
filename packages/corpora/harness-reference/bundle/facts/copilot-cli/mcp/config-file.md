---
type: Harness Fact
title: "Copilot CLI: MCP config file"
description: "MCP config file in Copilot CLI, as observed over time."
tags: [mcp]
harness: copilot-cli
subject: mcp/config-file
observations:
  - value: { file: "~/.copilot/mcp-config.json", format: JSON }
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
[Copilot CLI](/harnesses/copilot-cli.md). The file and key that hold MCP server definitions, and its
format.

## Observations

- 2026-08-08: file: ~/.copilot/mcp-config.json; format: JSON.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
