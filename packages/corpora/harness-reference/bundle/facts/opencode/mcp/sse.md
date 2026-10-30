---
type: Harness Fact
title: "OpenCode: SSE transport keys"
description: "SSE transport keys in OpenCode, as observed over time."
tags: [mcp]
harness: opencode
subject: mcp/sse
observations:
  - value: { supported: true, note: via remote }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [SSE transport keys](/subjects/mcp/sse.md) in
[OpenCode](/harnesses/opencode.md). The keys that declare a server-sent-events MCP server.

## Observations

- 2026-08-08: supported: `true`; note: via remote.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
