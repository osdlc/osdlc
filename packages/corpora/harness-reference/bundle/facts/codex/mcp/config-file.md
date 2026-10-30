---
type: Harness Fact
title: "Codex CLI: MCP config file"
description: "MCP config file in Codex CLI, as observed over time."
tags: [mcp]
harness: codex
subject: mcp/config-file
observations:
  - value: { file: config.toml, key: "[mcp_servers]", format: TOML }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
    note: "Treat `config.toml` table names as version-sensitive."
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [MCP config file](/subjects/mcp/config-file.md) in
[Codex CLI](/harnesses/codex.md). The file and key that hold MCP server definitions, and its format.

## Observations

- 2026-08-08: file: config.toml; key: [mcp_servers]; format: TOML. Treat `config.toml` table names
  as version-sensitive.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
