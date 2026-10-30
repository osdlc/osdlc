---
type: Harness Fact
title: "Gemini CLI: Structured output"
description: "Structured output in Gemini CLI, as observed over time."
tags: [cli]
harness: gemini-cli
subject: cli/structured-output
observations:
  - value: { output: "-o text|json|stream-json" }
    since: null
    until: null
    observed: "2026-10-09"
    source: notes-gemini
    checked_version: "0.46.0"
    evidence: help-text
sources:
  - id: notes-gemini
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-gemini.md"
    title: "gemini: harness notes for a dispatcher"
---

What the sources say about [Structured output](/subjects/cli/structured-output.md) in
[Gemini CLI](/harnesses/gemini-cli.md). Machine-readable output formats for headless runs.

## Observations

- 2026-10-09: output: -o text|json|stream-json.[^notes-gemini]

[^notes-gemini]: gemini: harness notes for a dispatcher
