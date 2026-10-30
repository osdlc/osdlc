---
type: Harness Fact
title: "Codex CLI: Fork a session"
description: "Fork a session in Codex CLI, as observed over time."
tags: [cli]
harness: codex
subject: cli/fork
observations:
  - value: { supported: true, command: "codex fork [SESSION_ID] [PROMPT]" }
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

What the sources say about [Fork a session](/subjects/cli/fork.md) in
[Codex CLI](/harnesses/codex.md). Whether a saved session can be cloned into a new one.

## Observations

- 2026-09-25: supported: `true`; command: codex fork [SESSION_ID] [PROMPT].[^notes-codex]

[^notes-codex]: Codex: harness notes for a dispatcher
