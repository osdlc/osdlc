---
type: Harness Fact
title: "Gemini CLI: Streamable HTTP transport keys"
description: "Streamable HTTP transport keys in Gemini CLI, as observed over time."
tags: [mcp]
harness: gemini-cli
subject: mcp/streamable-http
observations:
  - value: { supported: true, address_key: httpUrl }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
    note: "`url` selects SSE, not streamable HTTP."
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Streamable HTTP transport keys](/subjects/mcp/streamable-http.md) in
[Gemini CLI](/harnesses/gemini-cli.md). The keys that declare a streamable HTTP MCP server.

## Observations

- 2026-08-08: supported: `true`; address key: httpUrl. `url` selects SSE, not streamable
  HTTP.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
