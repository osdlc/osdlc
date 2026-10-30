---
type: Harness Fact
title: "DeepSeek Harness (dsh): How the agent loads a skill"
description: "How the agent loads a skill in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/agent-loading
observations:
  - value: { mechanism: "a `skill` tool" }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness packages/skill/skill-filesystem/README.md at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). The mechanism the model uses to load a skill body.

## Observations

- 2026-10-08: mechanism: a `skill` tool.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
