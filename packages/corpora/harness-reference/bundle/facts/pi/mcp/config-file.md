---
type: Harness Fact
title: "pi: MCP config file"
description: "MCP config file in pi, as observed over time."
tags: [mcp]
harness: pi
subject: mcp/config-file
observations:
  - value: { supported: false, note: "no MCP; extension-bridged" }
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
[pi](/harnesses/pi.md). The file and key that hold MCP server definitions, and its format.

## Observations

- 2026-08-08: supported: `false`; note: no MCP; extension-bridged.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
