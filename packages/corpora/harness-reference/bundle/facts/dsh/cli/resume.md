---
type: Harness Fact
title: "DeepSeek Harness (dsh): Resume a session"
description: "Resume a session in DeepSeek Harness (dsh), as observed over time."
tags: [cli]
harness: dsh
subject: cli/resume
observations:
  - value: { supported: true, command: "dsh --profile headless --session-id <id> <prompt>", refused_when: "different cwd, subagent or fork session, id held by another agent, or an uncomposed preset" }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: "deepseek-ai/deepseek-harness packages/bundle/headless/src/startup.ts:43-44 at 5badb150"
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Resume a session](/subjects/cli/resume.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). How a saved session is resumed, and whether a new
prompt can be passed.

## Observations

- 2026-10-08: supported: `true`; command: dsh --profile headless --session-id <id> <prompt>; refused
  when: different cwd, subagent or fork session, id held by another agent, or an uncomposed
  preset.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
