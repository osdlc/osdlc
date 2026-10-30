---
type: Harness Fact
title: "Cursor: Skill name source"
description: "Skill name source in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/name-source
observations:
  - value: { rule: "the folder containing SKILL.md; it must match `name`", required_fields: [name, description] }
    since: null
    until: null
    observed: "2026-10-01"
    source: cursor-skills
    via: skill-naming
    evidence: docs
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: skills"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Skill name source](/subjects/skills/name-source.md) in
[Cursor](/harnesses/cursor.md). Where the skill's runtime name comes from (frontmatter `name`,
directory, or both).

## Observations

- 2026-10-01: rule: the folder containing SKILL.md; it must match `name`; required fields: `name`,
  `description`.[^cursor-skills][^skill-naming]

[^cursor-skills]: Cursor docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
