---
type: Harness Fact
title: "Codex CLI: Structured output"
description: "Structured output in Codex CLI, as observed over time."
tags: [cli]
harness: codex
subject: cli/structured-output
observations:
  - value: { output: "--json (JSONL events)", last_message: "-o/--output-last-message <file>", schema: "--output-schema <file>" }
    since: null
    until: null
    observed: "2026-09-25"
    source: notes-codex
    checked_version: "0.155.1"
    evidence: help-text
    note: "`codex agents` has no JSON listing."
sources:
  - id: notes-codex
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-codex.md"
    title: "Codex: harness notes for a dispatcher"
---

What the sources say about [Structured output](/subjects/cli/structured-output.md) in
[Codex CLI](/harnesses/codex.md). Machine-readable output formats for headless runs.

## Observations

- 2026-09-25: output: --json (JSONL events); last message: -o/--output-last-message <file>; schema:
  --output-schema <file>. `codex agents` has no JSON listing.[^notes-codex]

[^notes-codex]: Codex: harness notes for a dispatcher
