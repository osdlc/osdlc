---
type: Harness Fact
title: "OpenCode: stdio transport keys"
description: "stdio transport keys in OpenCode, as observed over time."
tags: [mcp]
harness: opencode
subject: mcp/stdio
observations:
  - value: { supported: true, type: local, address_key: command, command_form: array }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [stdio transport keys](/subjects/mcp/stdio.md) in
[OpenCode](/harnesses/opencode.md). The keys that declare a stdio MCP server.

## Observations

- 2026-08-08: supported: `true`; type: local; address key: command; command form:
  array.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
