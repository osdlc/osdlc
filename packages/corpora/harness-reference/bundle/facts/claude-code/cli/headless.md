---
type: Harness Fact
title: "Claude Code: Headless run"
description: "Headless run in Claude Code, as observed over time."
tags: [cli]
harness: claude-code
subject: cli/headless
observations:
  - value: { flag: "-p/--print", note: "`--no-session-persistence` skips saving the run" }
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

What the sources say about [Headless run](/subjects/cli/headless.md) in
[Claude Code](/harnesses/claude-code.md). The flag or subcommand for a one-shot, non-interactive
run.

## Observations

- 2026-09-25: flag: -p/--print; note: `--no-session-persistence` skips saving the run.[^notes-claude]

[^notes-claude]: Claude Code: harness notes for a dispatcher
