---
type: Harness Fact
title: "DeepSeek Harness (dsh): MCP config file"
description: "MCP config file in DeepSeek Harness (dsh), as observed over time."
tags: [mcp]
harness: dsh
subject: mcp/config-file
observations:
  - value: { file: "YAML rows for @deepseek-ai/dsh-mcp-client in cordis.patch.yml", reads_mcp_servers_json: false, tool_names: "mcp__<server>__<tool>" }
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

What the sources say about [MCP config file](/subjects/mcp/config-file.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). The file and key that hold MCP server definitions, and
its format.

## Observations

- 2026-10-08: file: YAML rows for @deepseek-ai/dsh-mcp-client in cordis.patch.yml; reads mcp servers
  json: `false`; tool names: mcp__<server>__<tool>.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
