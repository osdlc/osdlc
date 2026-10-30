---
type: Harness Fact
title: "DeepSeek Harness (dsh): Reads .agents/skills"
description: "Reads .agents/skills in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/agents-dir
observations:
  - value: { supported: true }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: "deepseek-ai/deepseek-harness packages/skill/skill-filesystem/README.md:44-56 at 5badb150"
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Reads .agents/skills](/subjects/skills/agents-dir.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Whether the neutral `.agents/skills/` directory
(project or user) is read.

## Observations

- 2026-10-08: supported: `true`.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
