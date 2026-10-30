---
type: Harness Fact
title: "Codex CLI: Headless run"
description: "Headless run in Codex CLI, as observed over time."
tags: [cli]
harness: codex
subject: cli/headless
observations:
  - value: { command: "codex exec [PROMPT]", resume: codex exec resume, fork: codex exec fork }
    since: null
    until: null
    observed: "2026-09-25"
    source: notes-codex
    checked_version: "0.155.1"
    evidence: help-text
sources:
  - id: notes-codex
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-codex.md"
    title: "Codex: harness notes for a dispatcher"
---

What the sources say about [Headless run](/subjects/cli/headless.md) in
[Codex CLI](/harnesses/codex.md). The flag or subcommand for a one-shot, non-interactive run.

## Observations

- 2026-09-25: command: codex exec [PROMPT]; resume: codex exec resume; fork: codex exec
  fork.[^notes-codex]

[^notes-codex]: Codex: harness notes for a dispatcher
