---
type: Harness Fact
title: "Claude Code: Skill name source"
description: "Skill name source in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/name-source
observations:
  - value: { rule: "frontmatter `name` if set, else the directory name", root_skill_needs_name: true }
    since: null
    until: null
    observed: "2026-10-01"
    source: claude-skills
    via: skill-naming
    checked_version: "2.1.286"
    evidence: docs
    note: "A SKILL.md at a plugin root has no directory fallback and needs `name`."
sources:
  - id: claude-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Skill name source](/subjects/skills/name-source.md) in
[Claude Code](/harnesses/claude-code.md). Where the skill's runtime name comes from (frontmatter
`name`, directory, or both).

## Observations

- 2026-10-01: rule: frontmatter `name` if set, else the directory name; root skill needs name:
  `true`. A SKILL.md at a plugin root has no directory fallback and needs
  `name`.[^claude-skills][^skill-naming]

[^claude-skills]: Claude Code docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
