---
type: Harness Fact
title: "Agent Skills (agentskills.io): compatibility"
description: "compatibility in Agent Skills (agentskills.io), as observed over time."
tags: [skill-frontmatter]
harness: agent-skills
subject: skill-frontmatter/compatibility
observations:
  - value: { supported: true, required: false, min_length: 1, max_length: 500 }
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

What the sources say about [compatibility](/subjects/skill-frontmatter/compatibility.md) in
[Agent Skills (agentskills.io)](/harnesses/agent-skills.md). The `compatibility` field and its
limit.

## Observations

- 2026-10-01: supported: `true`; required: `false`; min length: `1`; max length:
  `500`.[^agentskills-spec][^skill-naming]

[^agentskills-spec]: Agent Skills specification
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
