---
type: Harness Fact
title: "Claude Code: stdio transport keys"
description: "stdio transport keys in Claude Code, as observed over time."
tags: [mcp]
harness: claude-code
subject: mcp/stdio
observations:
  - value: { supported: true, type: stdio, type_optional: true, address_key: command }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
    note: "`type: stdio` is the default when omitted."
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [stdio transport keys](/subjects/mcp/stdio.md) in
[Claude Code](/harnesses/claude-code.md). The keys that declare a stdio MCP server.

## Observations

- 2026-08-08: supported: `true`; type: stdio; type optional: `true`; address key: command.
  `type: stdio` is the default when omitted.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
