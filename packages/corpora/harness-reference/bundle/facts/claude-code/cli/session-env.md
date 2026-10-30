---
type: Harness Fact
title: "Claude Code: Session environment"
description: "Session environment in Claude Code, as observed over time."
tags: [cli]
harness: claude-code
subject: cli/session-env
observations:
  - value: { vars: [CLAUDE_CODE_SESSION_ID, CLAUDE_PID] }
    since: null
    until: null
    observed: "2026-10-10"
    source: notes-claude
    checked_version: "2.1.294"
    evidence: run
    note: "Checked in a live session; the source says 2.1.x exports both. The date is the source's `checked` date."
sources:
  - id: notes-claude
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-claude.md"
    title: "Claude Code: harness notes for a dispatcher"
---

What the sources say about [Session environment](/subjects/cli/session-env.md) in
[Claude Code](/harnesses/claude-code.md). Environment variables the harness exports to the commands
it runs.

## Observations

- 2026-10-10: vars: `CLAUDE_CODE_SESSION_ID`, `CLAUDE_PID`. Checked in a live session; the source says
  2.1.x exports both. The date is the source's `checked` date.[^notes-claude]

[^notes-claude]: Claude Code: harness notes for a dispatcher
