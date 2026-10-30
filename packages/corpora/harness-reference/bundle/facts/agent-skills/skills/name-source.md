---
type: Harness Fact
title: "Agent Skills (agentskills.io): Skill name source"
description: "Skill name source in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/name-source
observations:
  - value: { rule: "frontmatter `name`, which must match the parent directory name" }
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

What the sources say about [Skill name source](/subjects/skills/name-source.md) in
[Agent Skills (agentskills.io)](/harnesses/agent-skills.md). Where the skill's runtime name comes
from (frontmatter `name`, directory, or both).

## Observations

- 2026-10-01: rule: frontmatter `name`, which must match the parent directory
  name.[^agentskills-spec][^skill-naming]

[^agentskills-spec]: Agent Skills specification
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
