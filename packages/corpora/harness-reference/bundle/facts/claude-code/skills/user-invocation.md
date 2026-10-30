---
type: Harness Fact
title: "Claude Code: User invocation syntax"
description: "User invocation syntax in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/user-invocation
observations:
  - value: { syntax: "/acme-tools:review" }
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

What the sources say about [User invocation syntax](/subjects/skills/user-invocation.md) in
[Claude Code](/harnesses/claude-code.md). What a user types to run a skill.

## Observations

- 2026-10-01: syntax: /acme-tools:review.[^claude-skills][^skill-naming]

[^claude-skills]: Claude Code docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
