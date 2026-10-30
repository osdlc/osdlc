---
type: Harness Fact
title: "Gemini CLI: SSE transport keys"
description: "SSE transport keys in Gemini CLI, as observed over time."
tags: [mcp]
harness: gemini-cli
subject: mcp/sse
observations:
  - value: { supported: true, address_key: url }
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
[Gemini CLI](/harnesses/gemini-cli.md). The keys that declare a server-sent-events MCP server.

## Observations

- 2026-08-08: supported: `true`; address key: url.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
