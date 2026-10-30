---
type: Harness Fact
title: "Antigravity CLI: MCP config file"
description: "MCP config file in Antigravity CLI, as observed over time."
tags: [mcp]
harness: antigravity
subject: mcp/config-file
observations:
  - value: { file: ".agents/mcp_config.json", url_key: serverUrl }
    since: null
    until: null
    observed: "2026-10-09"
    source: harness-comparison
open:
  - question: "Which transports .agents/mcp_config.json supports, and whether serverUrl selects streamable HTTP or SSE."
    observed: "2026-10-09"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [MCP config file](/subjects/mcp/config-file.md) in
[Antigravity CLI](/harnesses/antigravity.md). The file and key that hold MCP server definitions, and
its format.

## Observations

- 2026-10-09: file: .agents/mcp_config.json; url key: serverUrl.[^harness-comparison]

## Open questions

- Which transports .agents/mcp_config.json supports, and whether serverUrl selects streamable HTTP
  or SSE.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
