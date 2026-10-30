---
type: Harness Fact
title: "Claude Code: How the agent loads a skill"
description: "How the agent loads a skill in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/agent-loading
observations:
  - value: { mechanism: "the `Skill` tool, by name" }
    since: null
    until: null
    observed: "2026-10-01"
    source: claude-skills
    via: skill-naming
    evidence: docs
sources:
  - id: claude-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[Claude Code](/harnesses/claude-code.md). The mechanism the model uses to load a skill body.

## Observations

- 2026-10-01: mechanism: the `Skill` tool, by name.[^claude-skills][^skill-naming]

[^claude-skills]: Claude Code docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
