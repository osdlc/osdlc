---
type: Harness Fact
title: "Codex CLI: Resume a session"
description: "Resume a session in Codex CLI, as observed over time."
tags: [cli]
harness: codex
subject: cli/resume
observations:
  - value: { supported: true, command: "codex resume [SESSION_ID] [PROMPT]", by: UUID or exact name, flags: "--last, --all" }
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

What the sources say about [Resume a session](/subjects/cli/resume.md) in
[Codex CLI](/harnesses/codex.md). How a saved session is resumed, and whether a new prompt can be
passed.

## Observations

- 2026-09-25: supported: `true`; command: codex resume [SESSION_ID] [PROMPT]; by: UUID or exact
  name; flags: --last, --all.[^notes-codex]

[^notes-codex]: Codex: harness notes for a dispatcher
