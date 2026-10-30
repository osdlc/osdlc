---
type: Harness Fact
title: "pi: Structured output"
description: "Structured output in pi, as observed over time."
tags: [cli]
harness: pi
subject: cli/structured-output
observations:
  - value: { output: "--mode json", rpc: "--mode rpc, a standing JSON-over-stdio protocol" }
    since: null
    until: null
    observed: "2026-09-25"
    source: notes-pi
    checked_version: "0.84.3"
    evidence: help-text
sources:
  - id: notes-pi
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-pi.md"
    title: "pi: harness notes for a dispatcher"
---

What the sources say about [Structured output](/subjects/cli/structured-output.md) in
[pi](/harnesses/pi.md). Machine-readable output formats for headless runs.

## Observations

- 2026-09-25: output: --mode json; rpc: --mode rpc, a standing JSON-over-stdio protocol.[^notes-pi]

[^notes-pi]: pi: harness notes for a dispatcher
