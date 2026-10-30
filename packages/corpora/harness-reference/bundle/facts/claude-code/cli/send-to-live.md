---
type: Harness Fact
title: "Claude Code: Send to a live session"
description: "Send to a live session in Claude Code, as observed over time."
tags: [cli]
harness: claude-code
subject: cli/send-to-live
observations:
  - value: { supported: false, note: "resuming a running session starts a copy; `--input-format stream-json` feeds only a process the caller spawned; `--bg`, `claude agents --json`, `attach`, `logs` manage background sessions" }
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

What the sources say about [Send to a live session](/subjects/cli/send-to-live.md) in
[Claude Code](/harnesses/claude-code.md). Whether a message can be delivered into a session that is
already running.

## Observations

- 2026-09-25: supported: `false`; note: resuming a running session starts a copy;
  `--input-format stream-json` feeds only a process the caller spawned; `--bg`,
  `claude agents --json`, `attach`, `logs` manage background sessions.[^notes-claude]

[^notes-claude]: Claude Code: harness notes for a dispatcher
