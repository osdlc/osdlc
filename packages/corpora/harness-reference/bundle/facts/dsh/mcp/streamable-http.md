---
type: Harness Fact
title: "DeepSeek Harness (dsh): Streamable HTTP transport keys"
description: "Streamable HTTP transport keys in DeepSeek Harness (dsh), as observed over time."
tags: [mcp]
harness: dsh
subject: mcp/streamable-http
observations:
  - value: { supported: true, transport: streamable-http, address_key: url, also: headers }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Streamable HTTP transport keys](/subjects/mcp/streamable-http.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). The keys that declare a streamable HTTP MCP server.

## Observations

- 2026-10-08: supported: `true`; transport: streamable-http; address key: url; also:
  headers.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
