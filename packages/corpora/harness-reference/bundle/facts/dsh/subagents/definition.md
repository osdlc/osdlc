---
type: Harness Fact
title: "DeepSeek Harness (dsh): Subagent definition"
description: "Subagent definition in DeepSeek Harness (dsh), as observed over time."
tags: [subagents]
harness: dsh
subject: subagents/definition
observations:
  - value: { file_format: "none; subagents are tools the model calls, presets are YAML rows" }
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

What the sources say about [Subagent definition](/subjects/subagents/definition.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Where subagent definitions live and in what file
format.

## Observations

- 2026-10-08: file format: none; subagents are tools the model calls, presets are YAML
  rows.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
