---
type: Harness Fact
title: "OpenCode: MCP config file"
description: "MCP config file in OpenCode, as observed over time."
tags: [mcp]
harness: opencode
subject: mcp/config-file
observations:
  - value: { file: opencode.json, key: mcp, format: JSON }
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
[OpenCode](/harnesses/opencode.md). The file and key that hold MCP server definitions, and its
format.

## Observations

- 2026-08-08: file: opencode.json; key: mcp; format: JSON.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
