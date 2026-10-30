---
type: Harness Fact
title: "Kiro: stdio transport keys"
description: "stdio transport keys in Kiro, as observed over time."
tags: [mcp]
harness: kiro
subject: mcp/stdio
observations:
  - value: { supported: true, address_key: command }
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
[Kiro](/harnesses/kiro.md). The keys that declare a stdio MCP server.

## Observations

- 2026-08-08: supported: `true`; address key: command.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
