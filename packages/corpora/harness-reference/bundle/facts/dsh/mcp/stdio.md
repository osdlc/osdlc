---
type: Harness Fact
title: "DeepSeek Harness (dsh): stdio transport keys"
description: "stdio transport keys in DeepSeek Harness (dsh), as observed over time."
tags: [mcp]
harness: dsh
subject: mcp/stdio
observations:
  - value: { supported: true, transport: stdio, address_key: command, also: "args, env" }
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

What the sources say about [stdio transport keys](/subjects/mcp/stdio.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). The keys that declare a stdio MCP server.

## Observations

- 2026-10-08: supported: `true`; transport: stdio; address key: command; also: args, env.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
