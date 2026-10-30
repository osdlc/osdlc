---
type: Harness Fact
title: "Claude Code: Fork a session"
description: "Fork a session in Claude Code, as observed over time."
tags: [cli]
harness: claude-code
subject: cli/fork
observations:
  - value: { supported: true, flags: "--resume <id> --fork-session" }
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

What the sources say about [Fork a session](/subjects/cli/fork.md) in
[Claude Code](/harnesses/claude-code.md). Whether a saved session can be cloned into a new one.

## Observations

- 2026-09-25: supported: `true`; flags: --resume <id> --fork-session.[^notes-claude]

[^notes-claude]: Claude Code: harness notes for a dispatcher
