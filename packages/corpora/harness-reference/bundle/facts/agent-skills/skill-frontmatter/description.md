---
type: Harness Fact
title: "Agent Skills (agentskills.io): description"
description: "description in Agent Skills (agentskills.io), as observed over time."
tags: [skill-frontmatter]
harness: agent-skills
subject: skill-frontmatter/description
observations:
  - value: { supported: true, required: true, min_length: 1, max_length: 1024 }
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

What the sources say about [description](/subjects/skill-frontmatter/description.md) in
[Agent Skills (agentskills.io)](/harnesses/agent-skills.md). The `description` field, its limits and
whether it is required.

## Observations

- 2026-10-01: supported: `true`; required: `true`; min length: `1`; max length:
  `1024`.[^agentskills-spec][^skill-naming]

[^agentskills-spec]: Agent Skills specification
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
