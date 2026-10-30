---
type: Harness Fact
title: "Claude Code: Resume a session"
description: "Resume a session in Claude Code, as observed over time."
tags: [cli]
harness: claude-code
subject: cli/resume
observations:
  - value: { supported: true, flags: "-r/--resume <id> \"<prompt>\"", picker: with no id, from_pr: "--from-pr [value]" }
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

What the sources say about [Resume a session](/subjects/cli/resume.md) in
[Claude Code](/harnesses/claude-code.md). How a saved session is resumed, and whether a new prompt
can be passed.

## Observations

- 2026-09-25: supported: `true`; flags: -r/--resume <id> "<prompt>"; picker: with no id; from pr:
  --from-pr [value].[^notes-claude]

[^notes-claude]: Claude Code: harness notes for a dispatcher
