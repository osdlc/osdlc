---
type: Harness Fact
title: "Cursor: stdio transport keys"
description: "stdio transport keys in Cursor, as observed over time."
tags: [mcp]
harness: cursor
subject: mcp/stdio
observations:
  - value: { supported: true, type: stdio, address_key: command }
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
[Cursor](/harnesses/cursor.md). The keys that declare a stdio MCP server.

## Observations

- 2026-08-08: supported: `true`; type: stdio; address key: command.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
