---
type: Harness Fact
title: "DeepSeek Harness (dsh): Hook events"
description: "Hook events in DeepSeek Harness (dsh), as observed over time."
tags: [hooks]
harness: dsh
subject: hooks/events
observations:
  - value: { events: [SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStart, SubagentStop], via: Claude Code hooks bridge }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness packages/hooks/hooks-claude-code/README.md at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Hook events](/subjects/hooks/events.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). The lifecycle events a hook can attach to.

## Observations

- 2026-10-08: events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`,
  `SubagentStart`, `SubagentStop`; via: Claude Code hooks bridge.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
