---
type: Harness Fact
title: "Claude Code: disable-model-invocation"
description: "disable-model-invocation in Claude Code, as observed over time."
tags: [skill-frontmatter]
harness: claude-code
subject: skill-frontmatter/disable-model-invocation
observations:
  - value: { supported: true, effect: "the model cannot invoke the skill, the user still can with `/name`, and the description is not loaded into context" }
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

What the sources say about
[disable-model-invocation](/subjects/skill-frontmatter/disable-model-invocation.md) in
[Claude Code](/harnesses/claude-code.md). The field that stops the model from invoking a skill on
its own.

## Observations

- 2026-10-01: supported: `true`; effect: the model cannot invoke the skill, the user still can with
  `/name`, and the description is not loaded into context.[^claude-skills][^skill-naming]

[^claude-skills]: Claude Code docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
