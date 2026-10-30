---
type: Harness Fact
title: "Codex CLI: Subagent definition"
description: "Subagent definition in Codex CLI, as observed over time."
tags: [subagents]
harness: codex
subject: subagents/definition
observations:
  - value: { location: ".codex/agents/*.toml", format: TOML }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Subagent definition](/subjects/subagents/definition.md) in
[Codex CLI](/harnesses/codex.md). Where subagent definitions live and in what file format.

## Observations

- 2026-08-08: location: .codex/agents/*.toml; format: TOML.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
