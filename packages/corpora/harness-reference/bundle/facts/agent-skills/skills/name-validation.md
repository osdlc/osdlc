---
type: Harness Fact
title: "Agent Skills (agentskills.io): Skill name validation"
description: "Skill name validation in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/name-validation
observations:
  - value: { length: "1-64", charset: "lowercase a-z, 0-9 and hyphens", edges: no leading or trailing hyphen, consecutive_hyphens: false, colon_allowed: false, must_match_directory: true }
    since: null
    until: null
    observed: "2026-10-01"
    source: agentskills-spec
    via: skill-naming
    evidence: docs
sources:
  - id: agentskills-spec
    resource: "https://agentskills.io/specification"
    title: Agent Skills specification
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Skill name validation](/subjects/skills/name-validation.md) in
[Agent Skills (agentskills.io)](/harnesses/agent-skills.md). What the harness checks about a skill
name, and whether a failure blocks loading.

## Observations

- 2026-10-01: length: 1-64; charset: lowercase a-z, 0-9 and hyphens; edges: no leading or trailing
  hyphen; consecutive hyphens: `false`; colon allowed: `false`; must match directory:
  `true`.[^agentskills-spec][^skill-naming]

[^agentskills-spec]: Agent Skills specification
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
