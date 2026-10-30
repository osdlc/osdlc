---
type: Harness Fact
title: "DeepSeek Harness (dsh): Structured output"
description: "Structured output in DeepSeek Harness (dsh), as observed over time."
tags: [cli]
harness: dsh
subject: cli/structured-output
observations:
  - value: { output: "--json (JSONL: session, status, thinking, text, tool_call, tool_result, final, error)", schema_version: none, caps: "strings 8 KiB, lines 32 KiB, final uncapped" }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness packages/bundle/headless/src/json-stream.ts at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Structured output](/subjects/cli/structured-output.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Machine-readable output formats for headless runs.

## Observations

- 2026-10-08: output: --json (JSONL: session, status, thinking, text, tool_call, tool_result, final,
  error); schema version: none; caps: strings 8 KiB, lines 32 KiB, final uncapped.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
