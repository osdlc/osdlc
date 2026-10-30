---
type: Harness Fact
title: "Claude Code: Open with a chosen session id"
description: "Open with a chosen session id in Claude Code, as observed over time."
tags: [cli]
harness: claude-code
subject: cli/open-with-id
observations:
  - value: { supported: true, flags: "--session-id <uuid> -n <name>" }
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

What the sources say about [Open with a chosen session id](/subjects/cli/open-with-id.md) in
[Claude Code](/harnesses/claude-code.md). Whether a new session can be opened under a caller-chosen
id or name.

## Observations

- 2026-09-25: supported: `true`; flags: --session-id <uuid> -n <name>.[^notes-claude]

[^notes-claude]: Claude Code: harness notes for a dispatcher
