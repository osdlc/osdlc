---
type: Harness Fact
title: "Claude Code: Structured output"
description: "Structured output in Claude Code, as observed over time."
tags: [cli]
harness: claude-code
subject: cli/structured-output
observations:
  - value: { output: "--output-format json|stream-json", input: "--input-format stream-json", partial: "--include-partial-messages" }
    since: null
    until: null
    observed: "2026-09-25"
    source: notes-claude
    checked_version: "2.1.283"
    evidence: help-text
sources:
  - id: notes-claude
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-claude.md"
    title: "Claude Code: harness notes for a dispatcher"
---

What the sources say about [Structured output](/subjects/cli/structured-output.md) in
[Claude Code](/harnesses/claude-code.md). Machine-readable output formats for headless runs.

## Observations

- 2026-09-25: output: --output-format json|stream-json; input: --input-format stream-json; partial:
  --include-partial-messages.[^notes-claude]

[^notes-claude]: Claude Code: harness notes for a dispatcher
